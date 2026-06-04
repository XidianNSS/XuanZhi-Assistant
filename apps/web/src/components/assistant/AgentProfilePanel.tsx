import { useEffect, useState } from 'react';

import { Button, Text, toast } from '../ui';
import * as agentApi from '../../services/agentApi';
import type { OpenClawAgentProfile, OpenClawProfileFile } from '../../services/agentApi';
import type { Agent, XuanzhiAgentProfile } from '../../types/protocol';

type AgentProfilePanelProps = {
  currentUserId: string;
  isAdmin: boolean;
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: '初级',
  intermediate: '中级',
  expert: '专家',
};

function fileSummary(file: OpenClawProfileFile) {
  if (!file.available) {
    return file.error ? `读取失败：${file.error}` : '尚未写入';
  }
  const lines = file.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('---'))
    .slice(0, 2);
  return lines.join(' · ') || '已写入 OpenClaw workspace';
}

export function AgentProfilePanel({ currentUserId, isAdmin }: AgentProfilePanelProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openClawProfiles, setOpenClawProfiles] = useState<Record<string, OpenClawAgentProfile>>({});
  const [openClawLoading, setOpenClawLoading] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState<XuanzhiAgentProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOpenClawProfile = async (agentId: string) => {
    setOpenClawLoading((current) => ({ ...current, [agentId]: true }));
    try {
      const profile = await agentApi.getOpenClawAgentProfile(agentId);
      setOpenClawProfiles((current) => ({ ...current, [agentId]: profile }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '读取 OpenClaw 配置失败');
    } finally {
      setOpenClawLoading((current) => ({ ...current, [agentId]: false }));
    }
  };

  useEffect(() => {
    agentApi
      .listAgents()
      .then(setAgents)
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载 Agent 失败'))
      .finally(() => setLoading(false));
  }, []);

  const visibleAgents = isAdmin ? agents : agents.filter((agent) => agent.userId === currentUserId);

  useEffect(() => {
    visibleAgents.forEach((agent) => {
      if (!openClawProfiles[agent.id] && !openClawLoading[agent.id]) {
        void loadOpenClawProfile(agent.id);
      }
    });
  }, [visibleAgents.map((agent) => agent.id).join('|')]);

  const startEdit = (agent: Agent) => {
    if (!agent.profile) return;
    setEditingId(agent.id);
    setEditProfile(agent.profile);
  };

  const saveProfile = async (agentId: string) => {
    if (!editProfile) return;
    setSaving(true);
    try {
      const updated = await agentApi.updateAgentProfile(agentId, editProfile);
      setAgents((current) => current.map((agent) => (agent.id === agentId ? updated : agent)));
      await loadOpenClawProfile(agentId);
      setEditingId(null);
      setEditProfile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const syncProfile = async (agentId: string) => {
    setSaving(true);
    try {
      const updated = await agentApi.syncAgentProfile(agentId);
      setAgents((current) => current.map((agent) => (agent.id === agentId ? updated : agent)));
      await loadOpenClawProfile(agentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Text type="secondary">加载中...</Text>;
  }

  if (visibleAgents.length === 0) {
    return <Text type="secondary">暂无 Agent。注册后系统会自动创建专属 Agent。</Text>;
  }

  return (
    <div className="agent-profile-panel">
      {visibleAgents.map((agent) => {
        const profile = agent.profile;
        const isEditing = editingId === agent.id;
        const openClawProfile = openClawProfiles[agent.id];
        const files = openClawProfile?.files ?? [];
        const readyFileCount = files.filter((file) => file.available).length;

        return (
          <div key={agent.id} className="profile-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <Text strong>{profile?.agentName || agent.name}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {agent.workspace || 'workspace 待创建'}
                </Text>
              </div>
              {profile && !isEditing ? (
                <Button size="small" onClick={() => startEdit(agent)}>编辑</Button>
              ) : null}
              {isEditing ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" onClick={() => setEditingId(null)}>取消</Button>
                  <Button type="primary" size="small" loading={saving} onClick={() => saveProfile(agent.id)}>
                    保存
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="openclaw-profile-status">
              <div className="openclaw-profile-status-main">
                <span className={`openclaw-profile-dot ${readyFileCount === 0 ? 'is-empty' : readyFileCount === files.length ? 'is-ready' : 'is-partial'}`} />
                <div>
                  <Text strong>OpenClaw 启动上下文</Text>
                  <Text type="secondary">
                    {openClawLoading[agent.id]
                      ? '正在读取 workspace 文件...'
                      : `${readyFileCount}/${files.length || 4} 个 profile 文件已写入`}
                  </Text>
                </div>
              </div>
              <div className="openclaw-profile-actions">
                <Button size="small" onClick={() => void loadOpenClawProfile(agent.id)}>
                  刷新
                </Button>
                <Button size="small" type="primary" disabled={!profile} loading={saving} onClick={() => void syncProfile(agent.id)}>
                  重新同步
                </Button>
              </div>
            </div>

            {files.length > 0 ? (
              <div className="openclaw-profile-file-grid">
                {files.map((file) => (
                  <div key={file.name} className={`openclaw-profile-file ${file.available ? 'is-available' : ''}`}>
                    <span className="openclaw-profile-file-name">{file.name}</span>
                    <span className="openclaw-profile-file-summary">{fileSummary(file)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {!profile ? (
              <Text type="secondary">尚未完成初始化。请回到工作台完成 Agent 初始化。</Text>
            ) : isEditing && editProfile ? (
              <div className="agent-wizard-form" style={{ gap: 12 }}>
                <label className="wizard-field">
                  <span className="wizard-label">助理名称</span>
                  <input
                    className="wizard-input"
                    value={editProfile.agentName}
                    onChange={(event) => setEditProfile({ ...editProfile, agentName: event.target.value })}
                  />
                </label>
                <div className="wizard-field-row">
                  <label className="wizard-field">
                    <span className="wizard-label">你的名字</span>
                    <input
                      className="wizard-input"
                      value={editProfile.identity.displayName}
                      onChange={(event) => setEditProfile({
                        ...editProfile,
                        identity: { ...editProfile.identity, displayName: event.target.value },
                      })}
                    />
                  </label>
                  <label className="wizard-field">
                    <span className="wizard-label">角色</span>
                    <input
                      className="wizard-input"
                      value={editProfile.identity.role}
                      onChange={(event) => setEditProfile({
                        ...editProfile,
                        identity: { ...editProfile.identity, role: event.target.value },
                      })}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="profile-field">
                  <span className="profile-field-label">你的名字</span>
                  <span className="profile-field-value">{profile.identity.displayName || '-'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">角色</span>
                  <span className="profile-field-value">{profile.identity.role || '-'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">经验水平</span>
                  <span className="profile-field-value">{EXPERIENCE_LABELS[profile.identity.experience ?? ''] ?? '-'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">回复风格</span>
                  <span className="profile-field-value">{profile.requirements.tone ?? '-'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">分析深度</span>
                  <span className="profile-field-value">{profile.requirements.depth ?? '-'}</span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
