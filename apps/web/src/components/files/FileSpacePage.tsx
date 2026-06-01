import type { ReactNode } from 'react';

import { Button, Input, Text } from '../ui';
import { Icon } from '../ui/icons';

type FileRecord = {
  id: string;
  name: string;
  size: string;
  updatedAt: string;
  agent: string;
  type: 'md';
};

const files: FileRecord[] = [
  {
    id: 'file-task-summary',
    name: 'task-summary_20260527_1525.md',
    size: '1.8 KB',
    updatedAt: '2026/05/27 15:26',
    agent: 'QClaw',
    type: 'md',
  },
];

function ToolbarButton({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <Button className="file-toolbar-button" icon={icon}>
      {children}
      <Icon name="chevron-right-panel" />
    </Button>
  );
}

function FileTypeIcon({ type }: { type: FileRecord['type'] }) {
  return <span className={`file-type-icon is-${type}`}>{type.toUpperCase()}</span>;
}

export function FileSpacePage() {
  return (
    <section className="file-space-page" aria-label="文件空间">
      <header className="file-toolbar">
        <Input className="file-search-input" prefix={<Icon name="search" />} placeholder="搜索文件名" aria-label="搜索文件名" />
        <div className="file-toolbar-actions">
          <ToolbarButton icon={<Icon name="user" />}>全部Agent</ToolbarButton>
          <div className="file-view-toggle" aria-label="文件视图切换">
            <button className="is-active" type="button" aria-label="列表视图">
              <Icon name="list" />
            </button>
            <button type="button" aria-label="宫格视图">
              <Icon name="grid" />
            </button>
          </div>
        </div>
      </header>

      <div className="file-content-header">
        <span />
        <Text type="secondary">1 个文件</Text>
      </div>

      <div className="file-group">
        <button className="file-group-title" type="button" aria-expanded="true">
          <span className="file-group-caret">⌃</span>
          <Icon name="message" />
          <Text strong>请提供你的出生信息:</Text>
        </button>

        <div className="file-list">
          {files.map((file) => (
            <button className="file-card" key={file.id} type="button">
              <FileTypeIcon type={file.type} />
              <span className="file-card-copy">
                <Text strong>{file.name}</Text>
                <Text type="secondary">
                  {file.size} | {file.updatedAt} | <span className="file-agent-dot" aria-hidden="true" /> {file.agent}
                </Text>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
