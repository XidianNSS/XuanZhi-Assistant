import { useState } from 'react';
import { Button, Text, toast } from '../ui';
import * as agentApi from '../../services/agentApi';
import type { XuanzhiAgentProfile } from '../../types/protocol';

type AgentCreatePageProps = {
  currentUserId: string;
  isAdmin: boolean;
  onCreated: (agentId: string) => void;
  onCancel: () => void;
};

const STEPS = ['你的身份', '助手风格', '助手命名', '确认'] as const;

const ROLE_OPTIONS = [
  '密码学研究员', '密评工程师', '安全架构师',
  '研究生/博士生', '高校教师', '产品经理', '软件工程师', '其他',
] as const;

const TONE_OPTIONS = ['严谨学术', '工程务实', '简洁高效'] as const;
const DEPTH_OPTIONS = ['快速概览', '标准分析', '深度研究'] as const;

const DOMAINS = [
  '对称密码分析', '公钥密码分析', '后量子密码', '侧信道分析',
  '密评合规', '密码协议', 'SM系列算法', '轻量级密码', 'AI+密码', '芯片安全',
] as const;

const EXPERIENCE_LEVELS = [
  { value: 'beginner' as const, label: '初级' },
  { value: 'intermediate' as const, label: '中级' },
  { value: 'expert' as const, label: '专家' },
] as const;

const EMOJI_OPTIONS = ['🤖', '🔐', '🦉', '🧠', '💻', '🔬', '📊', '⚡'] as const;

function defaultProfile(isAdmin: boolean, displayName?: string): XuanzhiAgentProfile {
  return {
    version: 1,
    agentName: displayName ? `${displayName}的助手` : '',
    identity: {
      displayName: displayName ?? '',
      role: '',
      organization: '',
      researchFields: [],
      experience: 'intermediate',
    },
    requirements: {
      tone: '简洁高效',
      depth: '标准分析',
      language: 'zh-CN',
      autoMode: true,
      expertDomains: [],
      notificationPrefs: { wechat: true, email: false },
    },
    access: {
      role: isAdmin ? 'admin' : 'user',
      isolatedWorkspace: !isAdmin,
    },
  };
}

export function AgentCreatePage({ currentUserId, isAdmin, onCreated, onCancel }: AgentCreatePageProps) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<XuanzhiAgentProfile>(() => defaultProfile(isAdmin));
  const [emoji, setEmoji] = useState('🤖');
  const [saving, setSaving] = useState(false);

  const workspaceName = profile.identity.displayName.trim()
    ? `workspace-${profile.identity.displayName.trim().toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') || 'agent'}`
    : 'workspace-agent';

  const updateIdentity = (patch: Partial<XuanzhiAgentProfile['identity']>) =>
    setProfile((p) => ({ ...p, identity: { ...p.identity, ...patch } }));

  const updateReq = (patch: Partial<XuanzhiAgentProfile['requirements']>) =>
    setProfile((p) => ({ ...p, requirements: { ...p.requirements, ...patch } }));

  const toggleDomain = (domain: string) => {
    setProfile((p) => {
      const cur = p.requirements.expertDomains ?? [];
      const next = cur.includes(domain) ? cur.filter((d) => d !== domain) : [...cur, domain];
      return { ...p, requirements: { ...p.requirements, expertDomains: next } };
    });
  };

  const toggleResearch = (field: string) => {
    setProfile((p) => {
      const cur = p.identity.researchFields ?? [];
      const next = cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field];
      return { ...p, identity: { ...p.identity, researchFields: next } };
    });
  };

  const canNext = () => {
    if (step === 0) return profile.identity.displayName.trim().length > 0 && profile.identity.role.length > 0;
    if (step === 2) return profile.agentName.trim().length > 0;
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && canNext() && step < 3) {
      e.preventDefault();
      setStep((s) => s + 1);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      let agentId: string;

      if (isAdmin) {
        const agent = await agentApi.createAgent({
          name: profile.agentName.trim(),
          profile,
          emoji: EMOJI_OPTIONS[0],
        });
        agentId = agent.id;
      } else {
        const agents = await agentApi.listAgents();
        const myAgent = agents.find((a) => a.userId === currentUserId);
        if (myAgent) {
          await agentApi.updateAgentProfile(myAgent.id, profile);
          agentId = myAgent.id;
        } else {
          toast.error('未找到关联的智能体');
          setSaving(false);
          return;
        }
      }

      onCreated(agentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="agent-wizard-page">
      <div className="agent-wizard-inner">
        <header className="agent-wizard-header">
          <h1>注册新智能体</h1>
          <Text type="secondary">
            完成下面的信息，玄知会根据你的身份和偏好来调整工作方式。
          </Text>
        </header>

        {/* Step dots */}
        <div className="agent-wizard-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`agent-wizard-step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="agent-wizard-step-num">{i + 1}</span>
              <span className="agent-wizard-step-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="agent-wizard-body" onKeyDown={handleKeyDown}>
          {/* Step 1: Identity */}
          {step === 0 && (
            <div className="agent-wizard-form">
              <div className="wizard-field-row">
                <div className="wizard-field">
                  <label className="wizard-label">名字 *</label>
                  <input
                    className="wizard-input"
                    value={profile.identity.displayName}
                    onChange={(e) => updateIdentity({ displayName: e.target.value })}
                    placeholder="例如：张三"
                    autoFocus
                  />
                </div>
                <div className="wizard-field">
                  <label className="wizard-label">角色/职位 *</label>
                  <select
                    className="wizard-input wizard-select"
                    value={profile.identity.role}
                    onChange={(e) => updateIdentity({ role: e.target.value })}
                  >
                    <option value="">选择角色...</option>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="wizard-field-row">
                <div className="wizard-field">
                  <label className="wizard-label">所属单位</label>
                  <input
                    className="wizard-input"
                    value={profile.identity.organization ?? ''}
                    onChange={(e) => updateIdentity({ organization: e.target.value })}
                    placeholder="例如：西安电子科技大学"
                  />
                </div>
                <div className="wizard-field">
                  <label className="wizard-label">经验水平</label>
                  <div className="wizard-choice-row">
                    {EXPERIENCE_LEVELS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`wizard-choice-btn ${profile.identity.experience === opt.value ? 'active' : ''}`}
                        onClick={() => updateIdentity({ experience: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="wizard-section">
                <Text strong>研究方向</Text>
                <Text type="secondary">选择你关心的密码学领域。</Text>
                <div className="wizard-chip-grid">
                  {DOMAINS.map((d) => {
                    const sel = (profile.identity.researchFields ?? []).includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`wizard-chip ${sel ? 'active' : ''}`}
                        onClick={() => toggleResearch(d)}
                      >
                        {sel ? '✓ ' : ''}{d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Requirements */}
          {step === 1 && (
            <div className="agent-wizard-form">
              <div className="wizard-section">
                <Text strong>回复风格</Text>
                <div className="wizard-choice-row wizard-choice-padded">
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`wizard-choice-btn ${profile.requirements.tone === t ? 'active' : ''}`}
                      onClick={() => updateReq({ tone: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="wizard-section">
                <Text strong>分析深度</Text>
                <div className="wizard-choice-row wizard-choice-padded">
                  {DEPTH_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`wizard-choice-btn ${profile.requirements.depth === d ? 'active' : ''}`}
                      onClick={() => updateReq({ depth: d })}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="wizard-section">
                <Text strong>关注的密码学领域</Text>
                <Text type="secondary">选中后玄知会在相关任务中自动切换专家模式。</Text>
                <div className="wizard-chip-grid wizard-choice-padded">
                  {DOMAINS.map((d) => {
                    const sel = (profile.requirements.expertDomains ?? []).includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`wizard-chip ${sel ? 'active' : ''}`}
                        onClick={() => toggleDomain(d)}
                      >
                        {sel ? '✓ ' : ''}{d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Agent Naming */}
          {step === 2 && (
            <div className="agent-wizard-form">
              <div className="wizard-field">
                <label className="wizard-label">给你的助手起个名字 *</label>
                <input
                  className="wizard-input"
                  value={profile.agentName}
                  onChange={(e) => setProfile((p) => ({ ...p, agentName: e.target.value }))}
                  placeholder="例如：张三的密码助手、密码分析专家"
                  autoFocus
                />
                <Text type="secondary">这个名字会出现在侧边栏和对话中，和你的登录用户名是分开的。</Text>
              </div>
              <div className="wizard-section wizard-choice-padded">
                <Text strong>助手头像</Text>
                <div className="wizard-choice-row">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={`wizard-choice-btn ${emoji === e ? 'active' : ''}`}
                      onClick={() => setEmoji(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="agent-wizard-form">
              <div className="wizard-summary">
                <div className="wizard-summary-group">
                  <Text strong>你的助手</Text>
                  <div className="wizard-summary-grid">
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">助手名</span>
                      <span>{emoji} {profile.agentName || '—'}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">工作区</span>
                      <span className="mono" style={{ fontSize: 12 }}>{workspaceName}</span>
                    </div>
                  </div>
                </div>
                <div className="wizard-summary-group">
                  <Text strong>你的身份</Text>
                  <div className="wizard-summary-grid">
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">名字</span>
                      <span>{profile.identity.displayName || '—'}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">角色</span>
                      <span>{profile.identity.role || '—'}</span>
                    </div>
                    {profile.identity.organization && (
                      <div className="wizard-summary-item">
                        <span className="wizard-summary-label">单位</span>
                        <span>{profile.identity.organization}</span>
                      </div>
                    )}
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">经验</span>
                      <span>{EXPERIENCE_LEVELS.find((e) => e.value === profile.identity.experience)?.label}</span>
                    </div>
                  </div>
                </div>
                <div className="wizard-summary-group">
                  <Text strong>风格偏好</Text>
                  <div className="wizard-summary-grid">
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">回复风格</span>
                      <span>{profile.requirements.tone}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">分析深度</span>
                      <span>{profile.requirements.depth}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="agent-wizard-footer">
          <div>
            {step > 0 && (
              <Button onClick={() => setStep((s) => s - 1)}>
                ← 上一步
              </Button>
            )}
          </div>
          <div className="wizard-footer-right">
            {step === 0 && (
              <Button onClick={onCancel}>取消</Button>
            )}
            {step < 3 ? (
              <Button type="primary" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
                下一步 →
              </Button>
            ) : (
              <Button type="primary" loading={saving} disabled={!profile.agentName.trim()} onClick={handleCreate}>
                创建智能体
              </Button>
            )}
          </div>
        </footer>
      </div>
    </section>
  );
}
