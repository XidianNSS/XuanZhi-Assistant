import { useEffect, useMemo, useState } from 'react';

import * as fileApi from '../../services/fileApi';
import type { FileAsset, FileAssetContent, FileFolder } from '../../types/protocol';
import { qclawFileCategory } from '../../utils/fileCategory';
import { MarkdownContent } from '../chat/MarkdownContent';
import { Empty, toast } from '../ui';
import { Icon } from '../ui/icons';

type FilePreviewModalProps = {
  file?: FileAsset;
  folders?: FileFolder[];
  windowIndex?: number;
  onClose: () => void;
  onActivate?: () => void;
  onFileChanged?: (file: FileAsset) => void;
  onFileCreated?: (file: FileAsset) => void;
  onOpenTask?: (taskId: string) => void;
  onUseAsContext?: (file: FileAsset) => void;
};

function previewStyle(windowIndex: number) {
  const offset = (windowIndex % 6) * 28;
  return {
    height: 'min(720px, calc(100vh - 64px))',
    left: `calc(50% - 440px + ${offset}px)`,
    top: `${32 + offset}px`,
    width: 'min(880px, calc(100vw - 48px))',
  };
}

function renderTextPreview(content: Extract<FileAssetContent, { kind: 'text' }>) {
  const extension = content.file.extension.toLowerCase().replace(/^\./, '');
  if (extension === 'md' || content.file.mimeType === 'text/markdown') {
    return <MarkdownContent content={content.text} />;
  }

  if (extension === 'json') {
    try {
      return <pre>{JSON.stringify(JSON.parse(content.text), null, 2)}</pre>;
    } catch {
      return <pre>{content.text}</pre>;
    }
  }

  return <pre>{content.text}</pre>;
}

export function FilePreviewModal({
  file,
  windowIndex = 0,
  onClose,
  onActivate,
  onOpenTask,
  onUseAsContext,
}: FilePreviewModalProps) {
  const [content, setContent] = useState<FileAssetContent>();
  const [loading, setLoading] = useState(false);
  const style = useMemo(() => previewStyle(windowIndex), [windowIndex]);

  useEffect(() => {
    if (!file) {
      setContent(undefined);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    fileApi.getFileContent(file.id)
      .then((nextContent) => {
        if (!cancelled) {
          setContent(nextContent);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : '加载文件预览失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return null;

  const openInSystemApp = async () => {
    try {
      await fileApi.openFile(file.id);
      toast.warning('已请求系统打开文件');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '打开文件失败');
    }
  };

  return (
    <div className="file-preview-floating-root" role="dialog" aria-modal="false" aria-label={file.name}>
      <section className="file-preview-window" style={style} onMouseDown={onActivate}>
        <header className="file-preview-window-header">
          <span className="file-window-dots">
            <button type="button" aria-label="关闭预览" className="is-close" onClick={onClose} />
            <button type="button" aria-label="最小化预览" className="is-minimize" onClick={onClose} />
            <button type="button" aria-label="最大化预览" className="is-maximize" />
          </span>
          <span className={`file-type-mark is-${qclawFileCategory(file)}`}>{file.extension.toUpperCase()}</span>
          <strong>{file.name}</strong>
          {file.taskId ? (
            <button className="file-open-external-button" type="button" onClick={() => onOpenTask?.(file.taskId!)}>
              打开任务
            </button>
          ) : null}
          <button className="file-open-external-button" type="button" onClick={() => onUseAsContext?.(file)}>
            加入上下文
          </button>
          <button className="file-open-external-button" type="button" onClick={openInSystemApp}>
            系统打开
          </button>
          <a className="file-open-external-button" href={fileApi.getFileDownloadUrl(file.id)} target="_blank" rel="noreferrer">
            <Icon name="cloud" />
            下载
          </a>
        </header>

        <section className="file-preview-window-body">
          {loading ? (
            <Empty description="正在加载预览" />
          ) : content?.kind === 'text' ? (
            <div className={`file-preview-content is-${file.extension}`}>{renderTextPreview(content)}</div>
          ) : content?.kind === 'image' ? (
            <div className="file-preview-image-wrap">
              <img alt={file.title} src={content.dataUrl} />
            </div>
          ) : (
            <Empty description={content?.message ?? '该文件暂不支持预览'} />
          )}
        </section>
      </section>
    </div>
  );
}
