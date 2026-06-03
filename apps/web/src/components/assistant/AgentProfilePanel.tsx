import { useEffect, useState } from 'react';

import { Button, Text, toast } from '../ui';
import * as agentApi from '../../services/agentApi';
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

export function AgentProfilePanel({ currentUserId, isAdmin }: AgentProfilePanelProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState<XuanzhiAgentProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    agentApi
      .listAgents()
      .then(setAgents)
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载 Agent 失败'))
      .finally(() => setLoading(false));
  }, []);

  const visibleAgents = isAdmin ? agents : agents.filter((agent) => agent.userId === currentUserId);

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
      setEditingId(null);
      setEditProfile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
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
