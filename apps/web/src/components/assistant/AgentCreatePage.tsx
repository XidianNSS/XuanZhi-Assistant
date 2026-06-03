import { useMemo, useState } from 'react';

import { Button, Text, toast } from '../ui';
import * as agentApi from '../../services/agentApi';
import type { Agent, XuanzhiAgentProfile } from '../../types/protocol';

type AgentCreatePageProps = {
  currentUserId: string;
  isAdmin: boolean;
  existingAgent?: Agent;
  onCreated: (agentId: string) => void;
  onCancel: () => void;
};

const STEPS = ['身份信息', '偏好设置', '助理命名', '确认'] as const;

const ROLE_OPTIONS = [
  '密码学研究员',
  '密评工程师',
  '安全架构师',
  '研究生/博士生',
  '高校教师',
  '产品经理',
  '软件工程师',
  '其他',
] as const;

const DOMAIN_OPTIONS = [
  '对称密码分析',
  '公钥密码分析',
  '后量子密码',
  '侧信道分析',
  '密评合规',
  '密码协议',
  'SM 系列算法',
  '轻量级密码',
  'AI + 密码',
  '芯片安全',
] as const;

const TONE_OPTIONS = ['严谨学术', '工程务实', '简洁高效'] as const;
const DEPTH_OPTIONS = ['快速概览', '标准分析', '深度研究'] as const;

const EXPERIENCE_LEVELS = [
  { value: 'beginner' as const, label: '初级' },
  { value: 'intermediate' as const, label: '中级' },
  { value: 'expert' as const, label: '专家' },
] as const;

function createDefaultProfile(isAdmin: boolean, existingAgent?: Agent): XuanzhiAgentProfile {
  const displayName = existingAgent?.profile?.identity.displayName ?? '';
  return existingAgent?.profile ?? {
    version: 1,
    agentName: existingAgent?.name ?? (displayName ? `${displayName}的玄知助理` : '我的玄知助理'),
    identity: {
      displayName,
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
      isolatedWorkspace: true,
    },
  };
}

function toggleValue(values: string[] | undefined, value: string) {
  const current = values ?? [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function AgentCreatePage({
  currentUserId,
  isAdmin,
  existingAgent,
  onCreated,
  onCancel,
}: AgentCreatePageProps) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<XuanzhiAgentProfile>(() => createDefaultProfile(isAdmin, existingAgent));
  const [saving, setSaving] = useState(false);

  const workspaceName = existingAgent?.workspace || '由后端在 OpenClaw 中分配';
  const isInitialSetup = !existingAgent?.profile;

  const updateIdentity = (patch: Partial<XuanzhiAgentProfile['identity']>) => {
    setProfile((current) => ({ ...current, identity: { ...current.identity, ...patch } }));
  };

  const updateRequirements = (patch: Partial<XuanzhiAgentProfile['requirements']>) => {
    setProfile((current) => ({ ...current, requirements: { ...current.requirements, ...patch } }));
  };

  const canNext = useMemo(() => {
    if (step === 0) {
      return profile.identity.displayName.trim().length > 0 && profile.identity.role.trim().length > 0;
    }
    if (step === 2) {
      return profile.agentName.trim().length > 0;
    }
    return true;
  }, [profile, step]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      let targetAgent = existingAgent;

      if (!targetAgent) {
        const agents = await agentApi.listAgents();
        targetAgent = agents.find((agent) => agent.userId === currentUserId);
      }

      if (!targetAgent && isAdmin) {
        targetAgent = await agentApi.createAgent({
          name: profile.agentName.trim(),
          profile,
        });
      }

      if (!targetAgent) {
        toast.error('没有找到当前用户的 Agent，请重新登录后再试');
        return;
      }

      const normalizedProfile: XuanzhiAgentProfile = {
        ...profile,
        agentName: profile.agentName.trim(),
        identity: {
          ...profile.identity,
          displayName: profile.identity.displayName.trim(),
          role: profile.identity.role.trim(),
          organization: profile.identity.organization?.trim(),
        },
        access: {
          role: isAdmin ? 'admin' : 'user',
          isolatedWorkspace: true,
        },
      };

      const updated = await agentApi.updateAgentProfile(targetAgent.id, normalizedProfile);
      onCreated(updated.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存初始化信息失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="agent-wizard-page">
      <div className="agent-wizard-inner">
        <header className="agent-wizard-header">
          <h1>{isInitialSetup ? '初始化你的专属 Agent' : '编辑 Agent 信息'}</h1>
          <Text type="secondary">
            这些信息会写入当前用户的独立 workspace，帮助 OpenClaw 在对话中保持身份、领域和风格偏好。
          </Text>
        </header>

        <div className="agent-wizard-steps">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`agent-wizard-step-dot ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
            >
              <span className="agent-wizard-step-num">{index + 1}</span>
              <span className="agent-wizard-step-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="agent-wizard-body">
          {step === 0 ? (
            <div className="agent-wizard-form">
              <div className="wizard-field-row">
                <label className="wizard-field">
                  <span className="wizard-label">你的名字 *</span>
                  <input
                    className="wizard-input"
                    value={profile.identity.displayName}
                    onChange={(event) => updateIdentity({ displayName: event.target.value })}
                    placeholder="例如：张三"
                    autoFocus
                  />
                </label>
                <label className="wizard-field">
                  <span className="wizard-label">角色/职位 *</span>
                  <select
                    className="wizard-input wizard-select"
                    value={profile.identity.role}
                    onChange={(event) => updateIdentity({ role: event.target.value })}
                  >
                    <option value="">选择角色...</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="wizard-field-row">
                <label className="wizard-field">
                  <span className="wizard-label">所属单位</span>
                  <input
                    className="wizard-input"
                    value={profile.identity.organization ?? ''}
                    onChange={(event) => updateIdentity({ organization: event.target.value })}
                    placeholder="例如：西安电子科技大学"
                  />
                </label>
                <div className="wizard-field">
                  <span className="wizard-label">经验水平</span>
                  <div className="wizard-choice-row">
                    {EXPERIENCE_LEVELS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`wizard-choice-btn ${profile.identity.experience === option.value ? 'active' : ''}`}
                        onClick={() => updateIdentity({ experience: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="wizard-section">
                <Text strong>研究方向</Text>
                <Text type="secondary">选择你经常处理的密码学方向。</Text>
                <div className="wizard-chip-grid">
                  {DOMAIN_OPTIONS.map((domain) => {
                    const selected = (profile.identity.researchFields ?? []).includes(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        className={`wizard-chip ${selected ? 'active' : ''}`}
                        onClick={() => updateIdentity({ researchFields: toggleValue(profile.identity.researchFields, domain) })}
                      >
                        {selected ? '已选 ' : ''}{domain}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="agent-wizard-form">
              <div className="wizard-section">
                <Text strong>回复风格</Text>
                <div className="wizard-choice-row wizard-choice-padded">
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      className={`wizard-choice-btn ${profile.requirements.tone === tone ? 'active' : ''}`}
                      onClick={() => updateRequirements({ tone })}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wizard-section">
                <Text strong>分析深度</Text>
                <div className="wizard-choice-row wizard-choice-padded">
                  {DEPTH_OPTIONS.map((depth) => (
                    <button
                      key={depth}
                      type="button"
                      className={`wizard-choice-btn ${profile.requirements.depth === depth ? 'active' : ''}`}
                      onClick={() => updateRequirements({ depth })}
                    >
                      {depth}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wizard-section">
                <Text strong>重点领域</Text>
                <Text type="secondary">这些领域会作为 Agent 的长期偏好。</Text>
                <div className="wizard-chip-grid wizard-choice-padded">
                  {DOMAIN_OPTIONS.map((domain) => {
                    const selected = (profile.requirements.expertDomains ?? []).includes(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        className={`wizard-chip ${selected ? 'active' : ''}`}
                        onClick={() => updateRequirements({ expertDomains: toggleValue(profile.requirements.expertDomains, domain) })}
                      >
                        {selected ? '已选 ' : ''}{domain}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="agent-wizard-form">
              <label className="wizard-field">
                <span className="wizard-label">助理名称 *</span>
                <input
                  className="wizard-input"
                  value={profile.agentName}
                  onChange={(event) => setProfile((current) => ({ ...current, agentName: event.target.value }))}
                  placeholder="例如：张三的密码分析助理"
                  autoFocus
                />
              </label>
              <Text type="secondary">这个名字会显示在侧边栏和对话中，和你的登录用户名分开保存。</Text>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="agent-wizard-form">
              <div className="wizard-summary">
                <div className="wizard-summary-group">
                  <Text strong>Agent 与 workspace</Text>
                  <div className="wizard-summary-grid">
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">助理名</span>
                      <span>{profile.agentName || '-'}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">隔离空间</span>
                      <span className="mono">{workspaceName}</span>
                    </div>
                  </div>
                </div>
                <div className="wizard-summary-group">
                  <Text strong>身份与偏好</Text>
                  <div className="wizard-summary-grid">
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">姓名</span>
                      <span>{profile.identity.displayName || '-'}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">角色</span>
                      <span>{profile.identity.role || '-'}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">风格</span>
                      <span>{profile.requirements.tone}</span>
                    </div>
                    <div className="wizard-summary-item">
                      <span className="wizard-summary-label">深度</span>
                      <span>{profile.requirements.depth}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="agent-wizard-footer">
          <div>
            {step > 0 ? (
              <Button onClick={() => setStep((current) => current - 1)}>
                上一步
              </Button>
            ) : null}
          </div>
          <div className="wizard-footer-right">
            {step === 0 && !isInitialSetup ? <Button onClick={onCancel}>取消</Button> : null}
            {step < 3 ? (
              <Button type="primary" disabled={!canNext} onClick={() => setStep((current) => current + 1)}>
                下一步
              </Button>
            ) : (
              <Button type="primary" loading={saving} disabled={!profile.agentName.trim()} onClick={saveProfile}>
                保存并进入对话
              </Button>
            )}
          </div>
        </footer>
      </div>
    </section>
  );
}
