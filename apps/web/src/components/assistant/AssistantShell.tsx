import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { promptDrafts } from '../../data/assistantData';
import type { AgentTemplate } from '../../data/assistantData';
import * as approvalApi from '../../services/approvalApi';
import * as messageApi from '../../services/messageApi';
import { subscribeTaskStream } from '../../services/streamClient';
import * as taskApi from '../../services/taskApi';
import {
  replaceTaskRecord,
  upsertById,
  upsertTaskRecordItem,
} from '../../stores/taskStore';
import type { Approval, Message, StreamEvent, Task, User } from '../../types/protocol';
import { ApprovalCard } from '../chat/ApprovalCard';
import { ChatComposer } from '../chat/ChatComposer';
import { ChatHome } from '../chat/ChatHome';
import { ChatPanel } from '../chat/ChatPanel';
import { FileSpacePage } from '../files/FileSpacePage';
import { toast } from '../ui';
import { AgentCreatePage } from './AgentCreatePage';
import { Sidebar } from './Sidebar';
import type { SidebarAgentItem, WorkspaceKey } from './Sidebar';
import { WorkspaceHeader } from './WorkspaceHeader';

type AssistantShellProps = {
  currentUser: User;
  token: string;
  onLogout: () => void;
};

function getStreamEventTaskId(event: StreamEvent) {
  return event.type === 'task.updated' ? event.data.id : event.data.taskId;
}

const DEFAULT_AGENT_ID = 'agent-default';
const activeTaskStatuses = new Set<Task['status']>(['created', 'planning', 'running', 'waiting_approval']);

type LocalAgent = Omit<SidebarAgentItem, 'isRunning'>;
type WorkspaceView = 'home' | 'chat' | 'agent-picker' | 'file';

const defaultAgent: LocalAgent = {
  id: DEFAULT_AGENT_ID,
  name: '玄知助手',
  description: '心直口快、赛博感、朋友式吐槽',
  avatar: 'thunderbolt',
  tone: 'default',
};

function isTaskStatusActive(status: Task['status']) {
  return activeTaskStatuses.has(status);
}

export function AssistantShell({ currentUser, token, onLogout }: AssistantShellProps) {
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [activeAgentId, setActiveAgentId] = useState(DEFAULT_AGENT_ID);
  const [localAgents, setLocalAgents] = useState<LocalAgent[]>([]);
  const [taskAgentMap, setTaskAgentMap] = useState<Record<string, string>>({});
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('home');
  const [inputValue, setInputValue] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messagesByTask, setMessagesByTask] = useState<Record<string, Message[]>>({});
  const [approvalsByTask, setApprovalsByTask] = useState<Record<string, Approval[]>>({});
  const [approvingId, setApprovingId] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 同一时间只订阅当前任务的 SSE，切换任务或登出时立即关闭，避免旧任务事件写入新视图。
  const streamCleanupRef = useRef<(() => void) | undefined>(undefined);
  const streamGenerationRef = useRef(0);

  const closeStream = useCallback(() => {
    streamGenerationRef.current += 1;
    streamCleanupRef.current?.();
    streamCleanupRef.current = undefined;
  }, []);

  const applyStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'task.updated':
        setTasks((current) => upsertById(current, event.data));
        break;
      case 'message.created':
      case 'message.updated':
        setMessagesByTask((current) => upsertTaskRecordItem(current, event.data.taskId, event.data));
        break;
      case 'approval.requested':
      case 'approval.updated':
        setApprovalsByTask((current) => upsertTaskRecordItem(current, event.data.taskId, event.data));
        break;
    }
  }, []);

  const loadTaskSnapshot = useCallback(async (taskId: string) => {
    const [task, messages, approvals] = await Promise.all([
      taskApi.getTask(taskId),
      messageApi.getTaskMessages(taskId),
      taskApi.getTaskApprovals(taskId),
    ]);

    setTasks((current) => upsertById(current, task));
    setMessagesByTask((current) => replaceTaskRecord(current, taskId, messages));
    setApprovalsByTask((current) => replaceTaskRecord(current, taskId, approvals));

    return task;
  }, []);

  const openTask = useCallback(
    async (taskId: string) => {
      closeStream();
      const streamGeneration = streamGenerationRef.current;
      setActiveTaskId(taskId);
      setWorkspaceView('chat');
      try {
        // 先加载任务快照再建立当前任务 SSE；创建新任务时会先进入这里，再发送首条消息触发 Mock Agent。
        await loadTaskSnapshot(taskId);
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        // 只保存当前任务连接的关闭函数，切换任务时 closeStream 会停止旧连接继续写入状态。
        const cleanup = subscribeTaskStream(
          taskId,
          token,
          (event) => {
            const eventTaskId = getStreamEventTaskId(event);
            if (streamGeneration !== streamGenerationRef.current || eventTaskId !== taskId) {
              return;
            }
            applyStreamEvent(event);
          },
          () => {
            if (streamGeneration === streamGenerationRef.current) {
              toast.warning('任务实时连接已断开，请重新选择任务');
            }
          },
        );
        if (streamGeneration !== streamGenerationRef.current) {
          cleanup();
          return;
        }
        streamCleanupRef.current = cleanup;
      } catch (error) {
        if (streamGeneration === streamGenerationRef.current) {
          toast.error(error instanceof Error ? error.message : '加载任务失败');
        }
      }
    },
    [applyStreamEvent, closeStream, loadTaskSnapshot, token],
  );

  useEffect(() => {
    let cancelled = false;

    taskApi
      .listTasks()
      .then(async (nextTasks) => {
        if (!cancelled) {
          setTasks(nextTasks);
          setTaskAgentMap((current) => {
            const next = { ...current };
            nextTasks.forEach((task) => {
              next[task.id] ??= DEFAULT_AGENT_ID;
            });
            return next;
          });
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : '加载任务列表失败');
      });

    return () => {
      cancelled = true;
      closeStream();
    };
  }, [closeStream]);

  const allAgents = useMemo(() => [defaultAgent, ...localAgents], [localAgents]);

  const activeAgentTasks = useMemo(
    () => tasks.filter((task) => (taskAgentMap[task.id] ?? DEFAULT_AGENT_ID) === activeAgentId),
    [activeAgentId, taskAgentMap, tasks],
  );

  const agentItems = useMemo<SidebarAgentItem[]>(
    () =>
      allAgents.map((agent) => ({
        ...agent,
        isRunning: tasks.some(
          (task) => (taskAgentMap[task.id] ?? DEFAULT_AGENT_ID) === agent.id && isTaskStatusActive(task.status),
        ),
      })),
    [allAgents, taskAgentMap, tasks],
  );

  const submitMessage = useCallback(
    async (value: string) => {
      const question = value.trim();

      if (!question) {
        return;
      }

      setInputValue('');

      try {
        const task =
          activeTaskId && activeAgentTasks.some((item) => item.id === activeTaskId)
            ? activeAgentTasks.find((item) => item.id === activeTaskId)
            : await taskApi.createTask({
                title: question.slice(0, 28),
                userInput: question,
                intent: 'meeting',
              });

        if (!task) {
          return;
        }

        setTasks((current) => upsertById(current, task));
        setTaskAgentMap((current) => ({
          ...current,
          [task.id]: current[task.id] ?? activeAgentId,
        }));

        if (task.id !== activeTaskId) {
          // 新任务需要先打开详情并建立 SSE，再发送首条消息；Mock Agent 会在消息写入后立刻推送事件。
          await openTask(task.id);
        }

        const createdMessage = await messageApi.sendTaskMessage(task.id, question);
        setMessagesByTask((current) => upsertTaskRecordItem(current, task.id, createdMessage));
        // Mock Agent 目前会同步生成事件、产物和审批；这里主动刷新一次快照，
        // 避免 SSE 连接尚未完全建立时漏掉首轮进度和审批。
        await loadTaskSnapshot(task.id);
        setWorkspaceView('chat');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '发送失败');
        setInputValue(question);
      }
    },
    [activeAgentId, activeAgentTasks, activeTaskId, loadTaskSnapshot, openTask],
  );

  const createConversation = useCallback(() => {
    closeStream();
    setActiveTaskId(undefined);
    setInputValue('');
    setWorkspaceView('home');
  }, [closeStream]);

  const showFileSpace = useCallback(() => {
    closeStream();
    setActiveTaskId(undefined);
    setInputValue('');
    setWorkspaceView('file');
  }, [closeStream]);

  const handleWorkspaceChange = useCallback(
    (workspace: WorkspaceKey) => {
      if (workspace === 'file') {
        showFileSpace();
        return;
      }

      if (workspaceView === 'file') {
        setWorkspaceView('home');
      }
    },
    [showFileSpace, workspaceView],
  );

  const showAgentCreatePage = useCallback(() => {
    closeStream();
    setActiveTaskId(undefined);
    setInputValue('');
    setWorkspaceView('agent-picker');
  }, [closeStream]);

  const selectAgent = useCallback(
    (agentId: string) => {
      closeStream();
      setActiveAgentId(agentId);
      setActiveTaskId(undefined);
      setInputValue('');
      setWorkspaceView('home');
    },
    [closeStream],
  );

  const createAgentFromTemplate = useCallback((template: AgentTemplate) => {
    const nextAgent: LocalAgent = {
      id: `agent-${template.key}-${Date.now()}`,
      name: template.name,
      description: template.description,
      avatar: template.avatar,
      tone: template.tone,
    };

    setLocalAgents((current) => [...current, nextAgent]);
    setActiveAgentId(nextAgent.id);
    setActiveTaskId(undefined);
    setInputValue('');
    setWorkspaceView('home');
  }, []);

  const selectPrompt = useCallback((key: string) => {
    setInputValue(promptDrafts[key] ?? '');
  }, []);

  const copyMessage = useCallback((content: string) => {
    void navigator.clipboard?.writeText(content);
  }, []);

  const editMessage = useCallback((content: string) => {
    setInputValue(content);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  const approve = useCallback(async (approvalId: string) => {
    setApprovingId(approvalId);
    try {
      const approval = await approvalApi.approveApproval(approvalId);
      setApprovalsByTask((current) => upsertTaskRecordItem(current, approval.taskId, approval));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '确认失败');
    } finally {
      setApprovingId(undefined);
    }
  }, []);

  const reject = useCallback(async (approvalId: string) => {
    setApprovingId(approvalId);
    try {
      const approval = await approvalApi.rejectApproval(approvalId);
      setApprovalsByTask((current) => upsertTaskRecordItem(current, approval.taskId, approval));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '拒绝失败');
    } finally {
      setApprovingId(undefined);
    }
  }, []);

  const handleLogout = useCallback(() => {
    // 登出是用户隔离边界：关闭 SSE 并清掉所有任务态缓存，防止下一个用户看到上一位的残留数据。
    closeStream();
    setTasks([]);
    setMessagesByTask({});
    setApprovalsByTask({});
    setTaskAgentMap({});
    setLocalAgents([]);
    setActiveAgentId(DEFAULT_AGENT_ID);
    setActiveTaskId(undefined);
    setWorkspaceView('home');
    onLogout();
  }, [closeStream, onLogout]);

  const activeTask = activeAgentTasks.find((task) => task.id === activeTaskId);
  const activeMessages = activeTaskId ? messagesByTask[activeTaskId] ?? [] : [];
  const activeApprovals = activeTaskId ? approvalsByTask[activeTaskId] ?? [] : [];
  const activePendingApprovals = activeApprovals.filter((approval) => approval.status === 'pending');
  const isChatting = Boolean(activeTask);
  const isAgentPicker = workspaceView === 'agent-picker';
  const isFileSpace = workspaceView === 'file';
  const activeWorkspace: WorkspaceKey = isFileSpace ? 'file' : 'chat';

  return (
    <main className={`assistant-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <Sidebar
        activeKey={activeTaskId}
        activeAgentId={activeAgentId}
        activeWorkspace={activeWorkspace}
        agentItems={agentItems}
        collapsed={sidebarCollapsed}
        currentUser={currentUser}
        tasks={activeAgentTasks}
        onActiveChange={(taskId) => void openTask(taskId)}
        onAgentSelect={selectAgent}
        onCreateAgent={showAgentCreatePage}
        onCreateConversation={createConversation}
        onWorkspaceChange={handleWorkspaceChange}
        onLogout={handleLogout}
      />

      <section className={`assistant-main ${isFileSpace ? 'is-file-space' : isChatting ? 'is-chatting' : 'is-home'}`}>
        {isFileSpace ? null : (
          <WorkspaceHeader
            sidebarCollapsed={sidebarCollapsed}
            task={activeTask}
            onCreateConversation={createConversation}
            onToggleSidebar={toggleSidebar}
          />
        )}

        <div className={`workspace-body ${isFileSpace ? 'is-file' : isChatting ? 'is-task' : ''}`}>
          {isFileSpace ? (
            <FileSpacePage />
          ) : isAgentPicker ? (
            <AgentCreatePage onSelectTemplate={createAgentFromTemplate} />
          ) : isChatting && activeTask ? (
            <section className="task-chat-column">
              <ChatPanel
                messages={activeMessages}
                onCopyMessage={copyMessage}
                onEditMessage={editMessage}
              />
            </section>
          ) : (
            <ChatHome
              inputValue={inputValue}
              onInputChange={setInputValue}
              onPromptSelect={selectPrompt}
              onSubmitMessage={submitMessage}
            />
          )}
        </div>

        {isChatting && !isFileSpace ? (
          <footer className="composer-area">
            <div className="composer-stack">
              {activePendingApprovals.length > 0 ? (
                <div className="composer-approval-stack">
                  {activePendingApprovals.map((approval) => (
                    <ApprovalCard
                      key={approval.id}
                      approval={approval}
                      loading={approvingId === approval.id}
                      onApprove={approve}
                      onReject={reject}
                    />
                  ))}
                </div>
              ) : null}
              <ChatComposer value={inputValue} variant="chat" onChange={setInputValue} onSubmit={submitMessage} />
            </div>
          </footer>
        ) : null}
      </section>
    </main>
  );
}
