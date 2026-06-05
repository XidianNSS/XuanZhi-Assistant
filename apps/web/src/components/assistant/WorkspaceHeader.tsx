import { Button, Text, Tooltip } from '../ui';
import { Icon } from '../ui/icons';

import type { Task } from '../../types/protocol';

const taskStatusLabel: Record<Task['status'], string> = {
  created: '已创建',
  planning: '规划中',
  running: '执行中',
  waiting_approval: '等待确认',
  completed: '已完成',
  failed: '失败',
};

type WorkspaceHeaderProps = {
  sidebarCollapsed: boolean;
  task?: Task;
  onToggleSidebar: () => void;
};

export function WorkspaceHeader({
  sidebarCollapsed,
  task,
  onToggleSidebar,
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-start">
        <Tooltip title={sidebarCollapsed ? '显示侧边栏' : '隐藏侧边栏'}>
          <Button
            type="text"
            icon={sidebarCollapsed ? <Icon name="chevron-right-panel" /> : <Icon name="chevron-left-panel" />}
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? '显示侧边栏' : '隐藏侧边栏'}
            aria-expanded={!sidebarCollapsed}
            onClick={onToggleSidebar}
          />
        </Tooltip>
        {task ? (
          <div className="workspace-title">
            <Text>{task.title}</Text>
            <small>{taskStatusLabel[task.status]}</small>
          </div>
        ) : null}
      </div>
    </header>
  );
}
