import { useState, type ReactNode } from 'react';
import { Conversations } from '@ant-design/x';

import { Avatar, Button, Input, Modal, Text } from '../ui';
import { Icon } from '../ui/icons';
import type { Task, User } from '../../types/protocol';

type SidebarProps = {
  activeKey?: string;
  activeAgentId: string;
  activeWorkspace: WorkspaceKey;
  agentItems: SidebarAgentItem[];
  collapsed: boolean;
  currentUser: User;
  tasks: Task[];
  onActiveChange: (taskId: string) => void;
  onAgentSelect: (agentId: string) => void;
  onCreateAgent: () => void;
  onCreateConversation: () => void;
  onWorkspaceChange: (workspace: WorkspaceKey) => void;
  onLogout: () => void;
};

export type WorkspaceKey = 'chat' | 'file';

export type SidebarAgentItem = {
  id: string;
  name: string;
  description: string;
  avatar: string;
  tone: string;
  isRunning: boolean;
};

const activeTaskStatuses = new Set<Task['status']>(['created', 'planning', 'running', 'waiting_approval']);

function isTaskActive(status: Task['status']) {
  return activeTaskStatuses.has(status);
}

const navRailItems: Array<{ key: WorkspaceKey; label: string; icon: ReactNode }> = [
  { key: 'chat', label: '对话', icon: <Icon name="message" /> },
  { key: 'file', label: '文件', icon: <Icon name="file-text" /> },
];

const fileCategories = [
  { key: 'all', label: '全部', count: 1, icon: <Icon name="folder" /> },
  { key: 'docs', label: '文档', count: 1, icon: <Icon name="file-text" /> },
  { key: 'sheets', label: '表格', count: 0, icon: <Icon name="table" /> },
  { key: 'images', label: '图片', count: 0, icon: <Icon name="image" /> },
  { key: 'code', label: '代码', count: 0, icon: <Icon name="file-search" /> },
  { key: 'ppt', label: 'PPT', count: 0, icon: <Icon name="book" /> },
  { key: 'pdf', label: 'PDF', count: 0, icon: <Icon name="file-text" /> },
  { key: 'other', label: '其他', count: 0, icon: <Icon name="more" /> },
  { key: 'friends', label: '来自好友', icon: <Icon name="share" /> },
];

const settingsMenuItems = [
  { key: 'general', label: '通用设置', icon: <Icon name="settings" /> },
  { key: 'usage', label: '用量统计', icon: <Icon name="check-circle" /> },
  { key: 'skills', label: '技能管理', icon: <Icon name="tool" /> },
  { key: 'remote', label: '远控通道', icon: <Icon name="cloud" /> },
  { key: 'backup', label: '备份与迁移', icon: <Icon name="database" /> },
  { key: 'about', label: '关于我们', icon: <Icon name="bulb" /> },
];

function SettingsCenter({ currentUser, onLogout }: { currentUser: User; onLogout: () => void }) {
  const [activeSetting, setActiveSetting] = useState('general');

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <Text className="settings-title" strong>
          设置
        </Text>
        <div className="settings-menu">
          {settingsMenuItems.map((item) => (
            <button
              key={item.key}
              className={activeSetting === item.key ? 'settings-menu-item is-active' : 'settings-menu-item'}
              type="button"
              onClick={() => setActiveSetting(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="settings-content">
        <div className="settings-content-header">
          <Text strong>通用设置</Text>
        </div>

        <div className="settings-card">
          <div className="settings-row">
            <Text strong>头像</Text>
            <Avatar size={42} icon={<Icon name="user" />} />
          </div>
          <div className="settings-row">
            <Text strong>用户名</Text>
            <span className="settings-user-badge">
              <Icon name="check-circle" />
              {currentUser.name}
            </span>
          </div>
          <div className="settings-row">
            <Text strong>外观</Text>
            <button className="settings-select" type="button">
              浅色模式
              <Icon name="chevron-right-panel" />
            </button>
          </div>
          <div className="settings-row is-stacked">
            <div className="settings-row-title">
              <Text strong>字体大小</Text>
              <Text type="secondary">中</Text>
            </div>
            <div className="settings-slider" aria-hidden="true">
              <span />
            </div>
            <div className="settings-scale">
              <span>小</span>
              <span>中</span>
              <span>大</span>
            </div>
          </div>
        </div>

        <div className="settings-switch-list">
          {[
            ['龙虾管家', '开启后可实时保护 AI 安全，防范漏洞攻击、拦截恶意指令。'],
            ['休眠阻止', '开启后，电脑不会进入休眠模式，玄知助手会保持活跃状态。'],
            ['云端同步', 'AI 生成的文件将自动同步至云端，方便跨设备访问和备份。'],
            ['高级功能设置', '高级功能使用过程中会带来额外 Token 消耗。'],
          ].map(([title, description]) => (
            <div className="settings-switch-row" key={title}>
              <span>
                <Text strong>{title}</Text>
                <Text type="secondary">{description}</Text>
              </span>
              <button className="settings-switch is-on" type="button" aria-pressed="true">
                <span />
              </button>
            </div>
          ))}
        </div>
        <Button type="text" className="settings-logout-button" onClick={onLogout}>
          退出当前账号
        </Button>
      </section>
    </div>
  );
}

function FileSidebarPanel() {
  return (
    <div className="file-sidebar-panel">
      <Text className="file-sidebar-title" strong>
        文件空间
      </Text>
      <div className="file-category-list" aria-label="文件分类">
        {fileCategories.map((item) => (
          <button
            className={item.key === 'all' ? 'file-category-item is-active' : 'file-category-item'}
            key={item.key}
            type="button"
          >
            <span className="file-category-main">
              {item.icon}
              <span>{item.label}</span>
            </span>
            {'count' in item ? <span className="file-category-count">{item.count}</span> : null}
          </button>
        ))}
      </div>
      <Text className="file-sidebar-section" type="secondary">
        外部文件
      </Text>
      <div className="external-file-list">
        <button className="external-file-item" type="button">
          <span className="external-file-icon is-doc">T</span>
          <span>腾讯文档</span>
        </button>
        <button className="external-file-item" type="button">
          <span className="external-file-icon is-knowledge">i</span>
          <span>ima 知识库</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  activeKey,
  activeAgentId,
  activeWorkspace,
  agentItems,
  collapsed,
  currentUser,
  tasks,
  onActiveChange,
  onAgentSelect,
  onCreateAgent,
  onCreateConversation,
  onWorkspaceChange,
  onLogout,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openSettings = () => {
    setSettingsOpen(true);
  };

  const hasActiveTask = agentItems.some((agent) => agent.isRunning);

  const conversationItems = tasks.map((task) => {
    const taskActive = isTaskActive(task.status);

    return {
      key: task.id,
      label: (
        <span className="conversation-title">
          <span className="conversation-title-text">{task.title}</span>
        </span>
      ),
      icon: taskActive ? (
        <span className="conversation-item-spinner" aria-label="任务进行中">
          <Icon name="loader" />
        </span>
      ) : (
        <Icon name="message" />
      ),
    };
  });

  return (
    <aside className={`assistant-sidebar ${collapsed ? 'is-rail-only' : ''}`}>
      <nav className="assistant-nav-rail" aria-label="主导航">
        <button
          className="nav-avatar-trigger"
          type="button"
          aria-label="打开设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Avatar size={38} icon={<Icon name="user" />} />
        </button>
        <div className="nav-rail-list">
          {navRailItems.map((item) => (
            <button
              key={item.key}
              className={item.key === activeWorkspace ? 'nav-rail-item is-active' : 'nav-rail-item'}
              type="button"
              aria-current={item.key === activeWorkspace ? 'page' : undefined}
              onClick={() => onWorkspaceChange(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="nav-rail-bottom">
          <button className="nav-rail-icon" type="button" aria-label="设置" onClick={openSettings}>
            <Icon name="settings" />
          </button>
        </div>
      </nav>

      <div className="assistant-sidebar-panel" aria-hidden={collapsed}>
        {activeWorkspace === 'file' ? (
          <FileSidebarPanel />
        ) : (
          <>
            <Input className="sidebar-search" prefix={<Icon name="search" />} placeholder="搜索" aria-label="搜索会话" />

            <Button icon={<Icon name="plus" />} className="new-chat-button" onClick={onCreateAgent}>
              新建 Agent
            </Button>

            <div className="agent-list" aria-label="Agent 列表" data-has-active-task={hasActiveTask ? 'true' : 'false'}>
              {agentItems.map((agent) => {
                const selected = agent.id === activeAgentId;

                return (
                  <button
                    key={agent.id}
                    className={[
                      'assistant-agent-card',
                      selected ? 'is-active' : '',
                      agent.isRunning ? 'is-running' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    type="button"
                    onClick={() => {
                      if (selected) {
                        onCreateConversation();
                        return;
                      }
                      onAgentSelect(agent.id);
                    }}
                  >
                    <span className="agent-card-avatar-wrap">
                      <span className={`agent-card-avatar is-${agent.tone}`}>
                        {agent.avatar === 'thunderbolt' ? <Icon name="thunderbolt" /> : agent.avatar}
                      </span>
                      {agent.isRunning ? (
                        <span className="agent-card-spinner" aria-label="任务进行中">
                          <Icon name="loader" />
                        </span>
                      ) : null}
                    </span>
                    <span className="agent-card-copy">
                      <Text strong>{agent.name}</Text>
                      <Text type="secondary">{agent.description}</Text>
                    </span>
                  </button>
                );
              })}
            </div>

            <Conversations
              className="conversation-list"
              activeKey={activeKey}
              items={conversationItems}
              onActiveChange={onActiveChange}
            />
          </>
        )}
      </div>

      <Modal
        title="设置"
        open={settingsOpen}
        footer={null}
        width={840}
        className="settings-modal"
        centered
        onCancel={() => setSettingsOpen(false)}
      >
        <SettingsCenter currentUser={currentUser} onLogout={onLogout} />
      </Modal>
    </aside>
  );
}
