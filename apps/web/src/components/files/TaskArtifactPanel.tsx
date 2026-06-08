import * as fileApi from '../../services/fileApi';
import type { FileAsset } from '../../types/protocol';
import { qclawFileCategory } from '../../utils/fileCategory';
import { Button, Empty, Text } from '../ui';
import { Icon } from '../ui/icons';

type TaskArtifactPanelProps = {
  files: FileAsset[];
  onPreview: (file: FileAsset) => void;
  onUseAsContext: (file: FileAsset) => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskArtifactPanel({ files, onPreview, onUseAsContext }: TaskArtifactPanelProps) {
  return (
    <aside className="task-artifact-panel" aria-label="当前对话产物">
      <header className="task-artifact-header">
        <span>
          <Icon name="folder" />
          <Text strong>产物</Text>
        </span>
        <Text type="secondary">{files.length}</Text>
      </header>

      {files.length === 0 ? (
        <Empty className="task-artifact-empty" description="本轮还没有生成文件" />
      ) : (
        <div className="task-artifact-list">
          {files.map((file) => (
            <article className="task-artifact-item" key={file.id}>
              <button type="button" onClick={() => onPreview(file)}>
                <span className={`task-artifact-type is-${qclawFileCategory(file)}`}>{file.extension.toUpperCase()}</span>
                <span>
                  <Text strong>{file.name}</Text>
                  <Text type="secondary">{formatSize(file.sizeBytes)} | {file.source === 'user_uploaded' ? '上传' : '生成'}</Text>
                </span>
              </button>
              <div className="task-artifact-actions">
                <Button type="text" size="small" icon={<Icon name="plus" />} onClick={() => onUseAsContext(file)}>
                  引用
                </Button>
                <Button
                  type="text"
                  size="small"
                  icon={<Icon name="cloud" />}
                  onClick={() => window.open(fileApi.getFileDownloadUrl(file.id), '_blank')}
                >
                  下载
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
