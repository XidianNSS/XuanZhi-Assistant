import { useEffect, useState } from 'react';
import { Button, Text, toast } from '../ui';
import * as agentApi from '../../services/agentApi';
import type { Agent, XuanzhiAgentProfile } from '../../types/protocol';

type AgentProfilePanelProps = {
  currentUserId: string;
  isAdmin: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  '密码学研究员': '密码学研究员',
  '密评工程师': '密评工程师',
  '安全架构师': '安全架构师',
  '研究生/博士生': '研究生/博士生',
  '高校教师': '高校教师',
  '产品经理': '产品经理',
  '软件工程师': '软件工程师',
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
    agentApi.listAgents()
      .then((list) => {
        setAgents(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visibleAgents = isAdmin ? agents : agents.filter((a) => a.userId === currentUserId);

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setEditProfile(agent.profile ? { ...agent.profile } : null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditProfile(null);
  };

  const saveProfile = async (agentId: string) => {
    if (!editProfile) return;
    setSaving(true);
    try {
      const updated = await agentApi.updateAgentProfile(agentId, editProfile);
      setAgents((prev) => prev.map((a) => (a.id === agentId ? updated : a)));
      setEditingId(null);
      setEditProfile(null);
      toast.error(''); // clear
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Text type="secondary">加载中…</Text>;
  }

  if (visibleAgents.length === 0) {
    return <Text type="secondary">暂无智能体。请先在注册流程中创建智能体。</Text>;
  }

  return (
    <div className="agent-profile-panel">
      {visibleAgents.map((agent) => {
        const profile = agent.profile;
        const isEditing = editingId === agent.id;

        return (
          <div key={agent.id} className="profile-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <Text strong>
                  {agent.emoji ?? '🤖'} {profile?.agentName || agent.name}
                </Text>
                {profile?.access?.role === 'admin' && (
                  <span className="profile-chip" style={{ marginLeft: 8, background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                    管理员
                  </span>
                )}
                {profile?.identity?.displayName && (
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    — {profile.identity.displayName}
                  </Text>
                )}
              </div>
              {!isEditing ? (
                <Button size="small" onClick={() => startEdit(agent)}>编辑</Button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" onClick={cancelEdit}>取消</Button>
                  <Button type="primary" size="small" loading={saving} onClick={() => saveProfile(agent.id)}>保存</Button>
                </div>
              )}
            </div>

            {!profile ? (
              <Text type="secondary">尚未完成配置。点击"编辑"来设置你的身份和偏好。</Text>
            ) : isEditing && editProfile ? (
              <div className="agent-wizard-form" style={{ gap: 12 }}>
                <div className="wizard-field">
                  <label className="wizard-label">助手名称</label>
                  <input
                    className="wizard-input"
                    value={editProfile.agentName}
                    onChange={(e) => setEditProfile({ ...editProfile, agentName: e.target.value })}
                    placeholder="例如：张三的密码助手"
                  />
                </div>
                <div className="wizard-field-row">
                  <div className="wizard-field">
                    <label className="wizard-label">你的名字</label>
                    <input
                      className="wizard-input"
                      value={editProfile.identity.displayName}
                      onChange={(e) => setEditProfile({ ...editProfile, identity: { ...editProfile.identity, displayName: e.target.value } })}
                    />
                  </div>
                  <div className="wizard-field">
                    <label className="wizard-label">你的角色</label>
                    <select
                      className="wizard-input wizard-select"
                      value={editProfile.identity.role}
                      onChange={(e) => setEditProfile({ ...editProfile, identity: { ...editProfile.identity, role: e.target.value } })}
                    >
                      <option value="">选择...</option>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="wizard-label">回复风格</label>
                  <div className="wizard-choice-row">
                    {(['严谨学术', '工程务实', '简洁高效'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`wizard-choice-btn ${editProfile.requirements.tone === t ? 'active' : ''}`}
                        onClick={() => setEditProfile({ ...editProfile, requirements: { ...editProfile.requirements, tone: t } })}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="profile-field">
                  <span className="profile-field-label">你的名字</span>
                  <span className="profile-field-value">{profile.identity.displayName || '—'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">你的角色</span>
                  <span className="profile-field-value">{profile.identity.role || '—'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">经验水平</span>
                  <span className="profile-field-value">{EXPERIENCE_LABELS[profile.identity.experience ?? ''] ?? '—'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">回复风格</span>
                  <span className="profile-field-value">{profile.requirements.tone ?? '—'}</span>
                </div>
                <div className="profile-field">
                  <span className="profile-field-label">分析深度</span>
                  <span className="profile-field-value">{profile.requirements.depth ?? '—'}</span>
                </div>
                {profile.identity.researchFields && profile.identity.researchFields.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">研究方向</Text>
                    <div className="profile-chip-row">
                      {profile.identity.researchFields.map((f) => (
                        <span key={f} className="profile-chip">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {profile.requirements.expertDomains && profile.requirements.expertDomains.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">关注的密码学领域</Text>
                    <div className="profile-chip-row">
                      {profile.requirements.expertDomains.map((d) => (
                        <span key={d} className="profile-chip" style={{ borderColor: '#bfdbfe', color: '#2563eb', background: '#eff6ff' }}>{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
