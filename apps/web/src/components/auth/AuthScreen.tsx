import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, Button, Checkbox, Input, toast } from '../ui';
import { Icon } from '../ui/icons';
import { BrandLockup } from '../brand/BrandLockup';
import { ProductLogo } from './ProductLogo';
import type { AuthMode } from '../../types/chat';

type GatewayState = {
  status: 'checking' | 'online' | 'offline';
  detail?: string;
};

type AuthScreenProps = {
  gatewayState?: GatewayState;
  loading?: boolean;
  onCheckGateway?: () => Promise<void>;
  onLogin: (values: { email: string; password: string }) => Promise<void>;
  onRegister: (values: { email: string; name: string; password: string }) => Promise<void>;
};

const recentAccountKey = 'xuanzhi.auth.recentAccounts';

const initialForm = {
  confirmPassword: '',
  email: '',
  name: '',
  password: '',
};

function loadRecentAccounts() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentAccountKey) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.includes('@')).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function saveRecentAccount(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;
  const next = [normalizedEmail, ...loadRecentAccounts().filter((item) => item !== normalizedEmail)].slice(0, 5);
  window.localStorage.setItem(recentAccountKey, JSON.stringify(next));
}

export function AuthScreen({ gatewayState, loading, onCheckGateway, onLogin, onRegister }: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [formValues, setFormValues] = useState(initialForm);
  const [recentAccounts, setRecentAccounts] = useState<string[]>(() => loadRecentAccounts());

  const selectedRecentAccount = useMemo(
    () => recentAccounts.find((email) => email === formValues.email.trim().toLowerCase()),
    [formValues.email, recentAccounts],
  );

  const switchAuthMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setFormValues((current) => ({
      ...initialForm,
      email: nextMode === 'login' ? current.email : '',
    }));
    setAuthMode(nextMode);
  };

  const chooseAccount = (email: string) => {
    setAuthMode('login');
    setFormValues({
      ...initialForm,
      email,
      password: '',
    });
  };

  const updateField = (field: keyof typeof formValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authMode === 'register') {
      if (formValues.password !== formValues.confirmPassword) {
        toast.error('两次输入的密码不一致');
        return;
      }
      saveRecentAccount(formValues.email);
      setRecentAccounts(loadRecentAccounts());
      void onRegister({
        email: formValues.email.trim(),
        name: formValues.name.trim(),
        password: formValues.password,
      });
      return;
    }

    saveRecentAccount(formValues.email);
    setRecentAccounts(loadRecentAccounts());
    void onLogin({
      email: formValues.email.trim(),
      password: formValues.password,
    });
  };

  const gatewayStatus = gatewayState?.status ?? 'checking';

  return (
    <main className={`auth-shell auth-mode-${authMode}`}>
      <section className="auth-layout">
        <div className="auth-visual">
          <ProductLogo />
          <div className="auth-intro">
            <h2>小团队的安全 Agent 工作台</h2>
            <p>先用团队账号登录，进入后系统会按当前用户加载对应的玄知 Agent 和 OpenClaw workspace。</p>
          </div>
        </div>

        <section className="auth-card" aria-label={authMode === 'login' ? '登录' : '注册'}>
          <BrandLockup className="auth-brand" />

          <div className={`auth-gateway auth-gateway-${gatewayStatus}`}>
            <span className="auth-gateway-dot" aria-hidden="true" />
            <span>
              {gatewayStatus === 'online'
                ? '后端与 OpenClaw 已连接'
                : gatewayStatus === 'offline'
                  ? '后端或 OpenClaw 未连接'
                  : '正在检查后端连接'}
            </span>
            {onCheckGateway ? (
              <Button type="text" className="auth-gateway-retry" onClick={() => void onCheckGateway()}>
                重新检查
              </Button>
            ) : null}
          </div>

          {gatewayStatus === 'offline' ? (
            <Alert
              type="warning"
              message="登录前需要先启动玄知后端"
              description={gatewayState?.detail ?? '前端会把 /api 请求代理到 127.0.0.1:3000。'}
            />
          ) : null}

          <div className="auth-copy">
            <h1>{authMode === 'login' ? '账号登录' : '创建团队账号'}</h1>
            <p>
              {authMode === 'login'
                ? '切换账号只会切换登录身份；进入后才展示该用户绑定的 Agent。'
                : '注册成功后首次进入会完成个人 Agent 配置。'}
            </p>
          </div>

          {authMode === 'login' && recentAccounts.length > 0 ? (
            <div className="auth-team" aria-label="最近登录账号">
              {recentAccounts.map((email) => (
                <button
                  className={`auth-member ${selectedRecentAccount === email ? 'is-selected' : ''}`}
                  key={email}
                  type="button"
                  onClick={() => chooseAccount(email)}
                >
                  <span className="auth-member-avatar">{email.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{email}</strong>
                    <small>选择后请输入密码</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div
            className={`auth-switch ${authMode === 'register' ? 'is-register' : ''}`}
            role="tablist"
            aria-label="切换登录和注册"
          >
            <Button
              type="text"
              role="tab"
              aria-selected={authMode === 'login'}
              className={`auth-switch-button ${authMode === 'login' ? 'is-active' : ''}`}
              onClick={() => switchAuthMode('login')}
            >
              登录
            </Button>
            <Button
              type="text"
              role="tab"
              aria-selected={authMode === 'register'}
              className={`auth-switch-button ${authMode === 'register' ? 'is-active' : ''}`}
              onClick={() => switchAuthMode('register')}
            >
              新账号
            </Button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <div
              className={`auth-extra-field ${authMode === 'register' ? 'is-visible' : ''}`}
              aria-hidden={authMode !== 'register'}
            >
              <label className="auth-field">
                <span>姓名</span>
                <Input
                  prefix={<Icon name="user" />}
                  placeholder="请输入姓名"
                  autoComplete="name"
                  disabled={authMode !== 'register'}
                  required={authMode === 'register'}
                  value={formValues.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </label>
            </div>

            <label className="auth-field">
              <span>邮箱</span>
              <Input
                prefix={<Icon name="mail" />}
                placeholder="name@company.com"
                autoComplete="email"
                required
                value={formValues.email}
                onChange={(event) => updateField('email', event.target.value)}
              />
            </label>

            <label className="auth-field">
              <span>密码</span>
              <Input.Password
                prefix={<Icon name="lock" />}
                placeholder="请输入密码"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                required
                value={formValues.password}
                onChange={(event) => updateField('password', event.target.value)}
              />
            </label>

            <div
              className={`auth-extra-field ${authMode === 'register' ? 'is-visible' : ''}`}
              aria-hidden={authMode !== 'register'}
            >
              <label className="auth-field">
                <span>确认密码</span>
                <Input.Password
                  prefix={<Icon name="lock" />}
                  placeholder="请再次输入密码"
                  autoComplete="new-password"
                  disabled={authMode !== 'register'}
                  required={authMode === 'register'}
                  value={formValues.confirmPassword}
                  onChange={(event) => updateField('confirmPassword', event.target.value)}
                />
              </label>
            </div>

            <div className="auth-options">
              <Checkbox defaultChecked>{authMode === 'login' ? '记住这个账号' : '注册后创建我的 Agent'}</Checkbox>
              {authMode === 'login' ? (
                <Button type="link" className="auth-link">
                  忘记密码请联系管理员
                </Button>
              ) : null}
            </div>

            <Button type="primary" htmlType="submit" size="large" block className="auth-submit" loading={loading}>
              {authMode === 'login' ? '登录并进入工作台' : '注册并进入首次配置'}
            </Button>
          </form>
        </section>
      </section>
    </main>
  );
}
