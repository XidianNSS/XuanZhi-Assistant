import { useMemo, useState, type ReactNode } from 'react';

import * as fileApi from '../../services/fileApi';
import type { FileAsset, FileAssetCategory, FileAssetSource, FileFolder } from '../../types/protocol';
import { qclawFileCategory } from '../../utils/fileCategory';
import { Button, Empty, Input, Modal, Text, toast } from '../ui';
import { Icon } from '../ui/icons';
import { FilePreviewModal } from './FilePreviewModal';

type FileSpacePageProps = {
  activeAgentId: string;
  activeCategory: FileAssetCategory | 'all';
  files: FileAsset[];
  folders: FileFolder[];
  loading?: boolean;
  onCategoryChange: (category: FileAssetCategory | 'all') => void;
  onFileChanged: (file: FileAsset) => void;
  onFileCreated: (file: FileAsset) => void;
  onFolderCreated: (folder: FileFolder) => void;
  onFolderChanged: (folder: FileFolder) => void;
  onFolderDeleted: (folderId: string) => void;
  onOpenTask: (taskId: string) => void;
  onRefresh: () => void;
  onUseFileAsContext: (file: FileAsset) => void;
};

type ViewMode = 'list' | 'grid';
type AgentFilter = 'all' | 'current';

const categoryLabels: Record<FileAssetCategory | 'all', string> = {
  all: '全部类型',
  code: '代码',
  data: '代码',
  documents: '文档',
  images: '图片',
  others: '其他',
  presentations: 'PPT',
  reports: 'PDF',
  spreadsheets: '表格',
};

const sourceLabels: Record<FileAssetSource, string> = {
  assistant_generated: 'Agent',
  tool_output: 'Agent',
  user_uploaded: '本地',
  workspace_imported: 'Agent',
};

function isAgentFile(file: FileAsset) {
  return file.source !== 'user_uploaded';
}

const categoryIcons: Record<FileAssetCategory, ReactNode> = {
  code: <Icon name="file-search" />,
  data: <Icon name="database" />,
  documents: <Icon name="file-text" />,
  images: <Icon name="image" />,
  others: <Icon name="more" />,
  presentations: <Icon name="book" />,
  reports: <Icon name="file-search" />,
  spreadsheets: <Icon name="table" />,
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extensionLabel(file: FileAsset) {
  return (file.extension || categoryLabels[qclawFileCategory(file)]).slice(0, 3).toUpperCase();
}

function latestByVersionGroup(files: FileAsset[]) {
  const byGroup = new Map<string, FileAsset>();
  files.forEach((file) => {
    const key = file.versionGroupId ?? file.id;
    const current = byGroup.get(key);
    if (!current || file.version > current.version || (file.version === current.version && file.updatedAt > current.updatedAt)) {
      byGroup.set(key, file);
    }
  });
  return [...byGroup.values()];
}

function groupTitle(file: FileAsset) {
  if (!file.taskId) return '未关联任务';
  return `任务 ${file.taskId.replace(/^task_/, '').slice(0, 8)}`;
}

function FileTypeMark({ file }: { file: FileAsset }) {
  const category = qclawFileCategory(file);
  return (
    <span className={`file-type-mark is-${category}`}>
      <span className="file-type-mark-icon">{categoryIcons[category]}</span>
      <span>{extensionLabel(file)}</span>
    </span>
  );
}

async function copyText(value: string) {
  try {
    await navigator.clipboard?.writeText(value);
    toast.warning('已复制');
  } catch {
    toast.error('复制失败');
  }
}

export function FileSpacePage({
  activeAgentId,
  activeCategory,
  files,
  folders,
  loading = false,
  onFileChanged,
  onFileCreated,
  onOpenTask,
  onUseFileAsContext,
}: FileSpacePageProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [previewFiles, setPreviewFiles] = useState<FileAsset[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [actionFileId, setActionFileId] = useState<string>();
  const [pendingClearFile, setPendingClearFile] = useState<FileAsset>();
  const [clearLocalFile, setClearLocalFile] = useState(false);
  const agentFilterLabel = agentFilter === 'all' ? '全部Agent' : '当前Agent';

  const visibleFiles = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return latestByVersionGroup(files)
      .filter((file) => !file.deletedAt)
      .filter((file) => (agentFilter === 'all' ? true : isAgentFile(file)))
      .filter((file) => (activeCategory === 'all' ? true : qclawFileCategory(file) === activeCategory))
      .filter((file) => {
        if (!keyword) return true;
        return `${file.name} ${file.title} ${file.summary ?? ''}`.toLowerCase().includes(keyword);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [activeAgentId, activeCategory, agentFilter, files, search]);

  const groupedFiles = useMemo(() => {
    const groups = new Map<string, FileAsset[]>();
    visibleFiles.forEach((file) => {
      const key = groupTitle(file);
      groups.set(key, [...(groups.get(key) ?? []), file]);
    });
    return [...groups.entries()];
  }, [visibleFiles]);

  const clearFromCloud = async (file: FileAsset) => {
    try {
      const updated = await fileApi.deleteFile(file.id);
      onFileChanged(updated);
      setActionFileId(undefined);
      setPendingClearFile(undefined);
      setClearLocalFile(false);
      toast.warning('已从云端清理');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清理失败');
    }
  };

  const revealFileLocation = async (file: FileAsset) => {
    try {
      await fileApi.revealFile(file.id);
      setActionFileId(undefined);
      toast.warning('已打开文件位置');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '打开文件位置失败');
    }
  };

  const openPreviewFile = (file: FileAsset) => {
    setPreviewFiles((current) => {
      const existing = current.find((item) => item.id === file.id);
      if (!existing) return [...current, file];
      return [...current.filter((item) => item.id !== file.id), existing];
    });
  };

  const closePreviewFile = (fileId: string) => {
    setPreviewFiles((current) => current.filter((item) => item.id !== fileId));
  };

  const activatePreviewFile = (fileId: string) => {
    setPreviewFiles((current) => {
      const existing = current.find((item) => item.id === fileId);
      if (!existing || current[current.length - 1]?.id === fileId) return current;
      return [...current.filter((item) => item.id !== fileId), existing];
    });
  };

  return (
    <section className="file-space-page" aria-label="文件空间" onClick={() => {
      setAgentMenuOpen(false);
      setActionFileId(undefined);
    }}>
      <header className="file-toolbar">
        <Input
          className="file-search-input"
          prefix={<Icon name="search" />}
          placeholder="搜索文件名"
          aria-label="搜索文件名"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="file-toolbar-actions">
          <div className="file-agent-picker">
            <button
              className={`file-agent-filter ${agentMenuOpen ? 'is-open' : ''}`}
              type="button"
              aria-label={agentFilterLabel}
              aria-expanded={agentMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setAgentMenuOpen((open) => !open);
              }}
            >
              <Icon name="user" />
              <span>{agentFilterLabel}</span>
              <Icon name="chevron-right-panel" />
            </button>
            {agentMenuOpen ? (
              <div className="file-agent-menu" onClick={(event) => event.stopPropagation()}>
                <button
                  className={agentFilter === 'all' ? 'is-active' : ''}
                  type="button"
                  onClick={() => {
                    setAgentFilter('all');
                    setAgentMenuOpen(false);
                  }}
                >
                  <Icon name="user" />
                  <span>全部Agent</span>
                  {agentFilter === 'all' ? <Icon name="check" /> : <span />}
                </button>
                <button
                  className={agentFilter === 'current' ? 'is-active' : ''}
                  type="button"
                  onClick={() => {
                    setAgentFilter('current');
                    setAgentMenuOpen(false);
                  }}
                >
                  <span className="file-source-dot" />
                  <span>当前Agent</span>
                  {agentFilter === 'current' ? <Icon name="check" /> : <span />}
                </button>
              </div>
            ) : null}
          </div>
          <div className="file-view-toggle" aria-label="文件视图切换">
            <button
              className={viewMode === 'list' ? 'is-active' : ''}
              type="button"
              aria-label="列表视图"
              onClick={() => setViewMode('list')}
            >
              <Icon name="list" />
            </button>
            <button
              className={viewMode === 'grid' ? 'is-active' : ''}
              type="button"
              aria-label="宫格视图"
              onClick={() => setViewMode('grid')}
            >
              <Icon name="grid" />
            </button>
          </div>
        </div>
      </header>

      <div className="file-content-header">
        <span>{loading ? '正在同步文件索引' : categoryLabels[activeCategory]}</span>
        <Text type="secondary">{visibleFiles.length} 个文件</Text>
      </div>

      {visibleFiles.length === 0 ? (
        <Empty className="file-empty" description={loading ? '正在加载文件' : '当前分类还没有文件'} />
      ) : (
        <div className={`file-qclaw-list is-${viewMode}`}>
          {groupedFiles.map(([groupName, groupFiles]) => {
            const collapsed = collapsedGroups.includes(groupName);
            return (
              <section className="file-qclaw-group" key={groupName}>
                <button
                  className="file-qclaw-group-title"
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() => {
                    setCollapsedGroups((current) => (
                      current.includes(groupName)
                        ? current.filter((name) => name !== groupName)
                        : [...current, groupName]
                    ));
                  }}
                >
                  <span className="file-qclaw-caret" aria-hidden="true">{collapsed ? '›' : '⌃'}</span>
                  <Icon name="message" />
                  <Text strong>{groupName}</Text>
                </button>

                {collapsed ? null : (
                  <div className="file-qclaw-rows">
                    {groupFiles.map((file) => (
                      <div className="file-qclaw-row" key={file.id}>
                        <button className="file-row-main" type="button" onClick={() => openPreviewFile(file)}>
                          <FileTypeMark file={file} />
                          <span className="file-row-copy">
                            <span className="file-row-name" title={file.name}>{file.name}</span>
                            <span className="file-row-meta" aria-hidden="true">
                              <span>{formatSize(file.sizeBytes)}</span>
                              <span>{formatDate(file.updatedAt)} {formatClock(file.updatedAt)}</span>
                              <span className="file-row-meta-source">
                                <span className="file-source-dot" />
                                {sourceLabels[file.source]}
                              </span>
                            </span>
                          </span>
                        </button>
                        <span className="file-row-menu-wrap">
                          <button
                            className="file-row-menu-button"
                            type="button"
                            aria-label={`打开 ${file.name} 的操作菜单`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionFileId((current) => current === file.id ? undefined : file.id);
                              setAgentMenuOpen(false);
                            }}
                          >
                            <span className="file-row-ellipsis" aria-hidden="true">...</span>
                          </button>
                          {actionFileId === file.id ? (
                            <div className="file-row-menu" onClick={(event) => event.stopPropagation()}>
                              <button type="button" onClick={() => {
                                openPreviewFile(file);
                                setActionFileId(undefined);
                              }}>
                                <Icon name="folder" />
                                打开文件
                              </button>
                              <button type="button" onClick={() => void revealFileLocation(file)}>
                                <Icon name="folder" />
                                打开文件位置
                              </button>
                              <button type="button" onClick={() => copyText(fileApi.getFileDownloadUrl(file.id))}>
                                <Icon name="copy" />
                                复制文件
                              </button>
                              <button type="button" onClick={() => window.open(fileApi.getFileDownloadUrl(file.id), '_blank')}>
                                <Icon name="share" />
                                下载文件
                              </button>
                              <span className="file-row-menu-separator" />
                              <button type="button" onClick={() => {
                                setPendingClearFile(file);
                                setClearLocalFile(false);
                                setActionFileId(undefined);
                              }}>
                                <Icon name="cloud" />
                                从云端清理
                              </button>
                            </div>
                          ) : null}
                        </span>
                        <span className="file-row-cloud" title="已同步">
                          <Icon name="cloud" />
                        </span>
                        <span className="file-row-size">{formatSize(file.sizeBytes)}</span>
                        <span className="file-row-source">
                          <span className="file-source-dot" />
                          {sourceLabels[file.source]}
                        </span>
                        <span className="file-row-time">
                          <span>{formatDate(file.updatedAt)}</span>
                          <span>{formatClock(file.updatedAt)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {previewFiles.map((file, index) => (
        <FilePreviewModal
          key={file.id}
          file={file}
          folders={folders}
          windowIndex={index}
          onActivate={() => activatePreviewFile(file.id)}
          onClose={() => closePreviewFile(file.id)}
          onFileChanged={onFileChanged}
          onFileCreated={onFileCreated}
          onOpenTask={(taskId) => {
            closePreviewFile(file.id);
            onOpenTask(taskId);
          }}
          onUseAsContext={(targetFile) => {
            closePreviewFile(file.id);
            onUseFileAsContext(targetFile);
          }}
        />
      ))}

      <Modal
        centered
        className="file-clear-confirm-modal"
        footer={(
          <div className="file-clear-confirm-actions">
            <Button
              size="large"
              onClick={() => {
                setPendingClearFile(undefined);
                setClearLocalFile(false);
              }}
            >
              取消
            </Button>
            <Button
              size="large"
              type="primary"
              onClick={() => {
                if (clearLocalFile) {
                  toast.warning('当前仅支持清理云端副本，本地文件会保留');
                }
                if (pendingClearFile) void clearFromCloud(pendingClearFile);
              }}
            >
              确定清理
            </Button>
          </div>
        )}
        onCancel={() => {
          setPendingClearFile(undefined);
          setClearLocalFile(false);
        }}
        open={Boolean(pendingClearFile)}
        title="确定从云端清理？"
        width={420}
      >
        <div className="file-clear-confirm-copy">
          <p>本地文件将保留，仅删除云端副本</p>
          <label className="file-clear-confirm-checkbox">
            <input
              type="checkbox"
              checked={clearLocalFile}
              onChange={(event) => setClearLocalFile(event.target.checked)}
            />
            <span>同步清除本地文件</span>
          </label>
        </div>
      </Modal>
    </section>
  );
}
