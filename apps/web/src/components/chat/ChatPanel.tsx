import { Empty } from '../ui';
import { Icon } from '../ui/icons';
import * as fileApi from '../../services/fileApi';

import type { FileAsset, Message } from '../../types/protocol';
import { ChatCanvas } from './ChatCanvas';

type ChatPanelProps = {
  messages: Message[];
  files?: FileAsset[];
  onCopyMessage: (content: string) => void;
  onEditMessage: (content: string) => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TaskFileStrip({ files }: { files: FileAsset[] }) {
  if (files.length === 0) return null;

  return (
    <div className="task-file-strip" aria-label="当前对话生成的文件">
      <div className="task-file-strip-header">
        <Icon name="folder" />
        <span>本轮生成文件</span>
      </div>
      <div className="task-file-strip-list">
        {files.map((file) => (
          <a className="task-file-card" href={fileApi.getFileDownloadUrl(file.id)} key={file.id}>
            <span className={`task-file-type is-${file.category}`}>{file.extension.toUpperCase()}</span>
            <span className="task-file-copy">
              <strong>{file.name}</strong>
              <small>{formatSize(file.sizeBytes)} | {file.category}</small>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  files = [],
  messages,
  onCopyMessage,
  onEditMessage,
}: ChatPanelProps) {
  const hasMessages = messages.length > 0;

  return (
    <div className="chat-panel">
      {hasMessages ? (
        <>
          <ChatCanvas messages={messages} onCopyMessage={onCopyMessage} onEditMessage={onEditMessage} />
          <TaskFileStrip files={files} />
        </>
      ) : (
        <Empty className="chat-empty" description="这个任务还没有消息" />
      )}
    </div>
  );
}
