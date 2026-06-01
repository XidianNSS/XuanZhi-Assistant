import type { Task } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';

const meetingTargetPattern = /(会议|开会|会面|日程|复盘会|calendar|meeting|schedule)/i;
const meetingActionPattern = /(帮我|请|创建|新建|预约|安排|发起|预定|book|create|schedule)/i;
const specificSchedulePattern = /(今天|明天|后天|下周|本周|周[一二三四五六日天]|上午|下午|晚上|\d+\s*点|参会|张三|李四|王五)/i;
const exploratoryQuestionPattern = /(都能|可以|能否|能不能|如何|怎么|什么|介绍|举例|说明).*[?？]?/i;
const knowledgeQuestionPattern = /(知识库|资料|来源|置信度|引用|检索|文档|回答用户问题)/;

function isMeetingAutomationRequest(task: Task) {
  if (task.intent !== 'meeting') {
    return false;
  }

  const text = `${task.title} ${task.userInput}`.trim();
  const hasTarget = meetingTargetPattern.test(text);
  const hasAction = meetingActionPattern.test(text);
  const isExploratoryQuestion = exploratoryQuestionPattern.test(text) && !specificSchedulePattern.test(text);

  return hasTarget && hasAction && !isExploratoryQuestion;
}

function answerForGeneralInput(userInput: string) {
  if (knowledgeQuestionPattern.test(userInput)) {
    return [
      '可以按普通问答处理：先基于上传知识库检索相关片段，再在回答末尾展示来源、引用片段和置信度。',
      '如果资料不足，应明确说明“未在知识库中找到可靠依据”，而不是直接触发创建会议这类外部动作。',
    ].join('\n');
  }

  return `收到：${userInput}。我会先按普通对话理解，不会直接创建会议或调用外部动作；如果后续需要工具操作，我会先给出确认提示。`;
}

// NOTE(mock-agent): 这是接入真实 Agent 前的演示执行器，用同一套 event/artifact/approval
// 写入路径验证权限、SSE 和审批闭环。只有明确会议/日程创建请求才会生成审批动作。
export function runMockAgent(task: Task, store: MemoryStore, stream: StreamHub) {
  const publishTask = (status: Task['status']) => {
    const updated = store.updateTaskStatus(task.id, status);
    if (updated) {
      stream.broadcast(task.id, { type: 'task.updated', data: updated });
    }
  };

  const publishEvent = (input: Parameters<MemoryStore['addEvent']>[0]) => {
    const event = store.addEvent(input);
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
    return event;
  };

  const publishArtifact = (input: Parameters<MemoryStore['addArtifact']>[0]) => {
    const artifact = store.addArtifact(input);
    stream.broadcast(task.id, { type: 'artifact.created', data: artifact });
    return artifact;
  };

  const publishApproval = (input: Parameters<MemoryStore['addApproval']>[0]) => {
    const approval = store.addApproval(input);
    stream.broadcast(task.id, { type: 'approval.requested', data: approval });
    return approval;
  };

  const publishMessage = (content: string) => {
    const message = store.addMessage({
      userId: task.userId,
      taskId: task.id,
      role: 'assistant',
      content,
    });
    stream.broadcast(task.id, { type: 'message.created', data: message });
    return message;
  };

  publishTask('running');
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'task.input.received',
    title: '已收到用户输入',
    message: task.userInput,
    status: 'success',
  });

  if (!isMeetingAutomationRequest(task)) {
    publishEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'agent.analysis.started',
      title: '正在分析问题',
      message: 'Agent 正在按普通对话处理本次输入。',
      status: 'running',
    });
    publishMessage(answerForGeneralInput(task.userInput));
    publishEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'agent.answer.created',
      title: '已生成回复',
      status: 'success',
    });
    publishTask('completed');
    return;
  }

  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'agent.analysis.started',
    title: '正在分析任务',
    message: 'Agent 正在分析会议目标、时间和参会人。',
    status: 'running',
  });
  publishArtifact({
    userId: task.userId,
    taskId: task.id,
    type: 'plan',
    title: '执行计划',
    format: 'markdown',
    content: [
      '1. 确认会议主题为项目复盘会。',
      '2. 识别参会人为张三。',
      '3. 暂定时间为下周三上午。',
      '4. 请求用户确认后再创建会议。',
    ].join('\n'),
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'agent.plan.created',
    title: '已生成执行计划',
    status: 'success',
  });
  publishArtifact({
    userId: task.userId,
    taskId: task.id,
    type: 'meeting_draft',
    title: '会议草稿',
    format: 'json',
    content: {
      title: '项目复盘会',
      time: '下周三上午',
      attendees: ['张三'],
      agenda: ['回顾项目目标', '复盘关键问题', '确认后续行动'],
    },
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'agent.meeting_draft.created',
    title: '已生成会议草稿',
    status: 'success',
  });
  publishTask('waiting_approval');
  publishApproval({
    userId: task.userId,
    taskId: task.id,
    title: '确认创建会议',
    description: '是否确认创建项目复盘会？',
    action: 'calendar.create_meeting',
    payload: {
      title: '项目复盘会',
      time: '下周三上午',
      attendees: ['张三'],
    },
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'approval.requested',
    title: '等待用户确认是否创建会议',
    status: 'waiting',
  });
}

export function runMockFollowup(task: Task, content: string, store: MemoryStore, stream: StreamHub) {
  const event = store.addEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'task.followup.responded',
    title: '已处理补充消息',
    message: content,
    status: 'success',
  });
  stream.broadcast(task.id, { type: 'agent.event.created', data: event });

  const message = store.addMessage({
    userId: task.userId,
    taskId: task.id,
    role: 'assistant',
    content: `收到补充信息：“${content}”。我会把它纳入当前对话上下文继续处理。`,
  });
  stream.broadcast(task.id, { type: 'message.created', data: message });
}
