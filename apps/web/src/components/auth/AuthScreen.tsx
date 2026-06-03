import { useState } from 'react';
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
  onLogin: (values: { username: string; password: string }) => Promise<void>;
  onRegister: (values: { username: string; name?: string; password: string }) => Promise<void>;
};

const initialForm = {
  confirmPassword: '',
  displayName: '',
  password: '',
  username: '',
};

export function AuthScreen({ gatewayState, loading, onCheckGateway, onLogin, onRegister }: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [formValues, setFormValues] = useState(initialForm);

  const switchAuthMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setFormValues((current) => ({
      ...initialForm,
      username: current.username,
    }));
    setAuthMode(nextMode);
  };

  const updateField = (field: keyof typeof formValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = formValues.username.trim();
    if (!username) {
      toast.error('请输入用户名');
      return;
    }

    if (authMode === 'register') {
      if (formValues.password !== formValues.confirmPassword) {
        toast.error('两次输入的密码不一致');
        return;
      }
      void onRegister({
        username,
        name: formValues.displayName.trim() || username,
        password: formValues.password,
      });
      return;
    }

    void onLogin({
      username,
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
            <h2>小团队 OpenClaw 助手工作台</h2>
            <p>使用团队用户名登录。后端会按用户名切换对应的 OpenClaw agent 和 workspace。</p>
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
            <h1>{authMode === 'login' ? '用户名登录' : '创建团队用户'}</h1>
            <p>
              {authMode === 'login'
                ? '登录页不选择 agent。进入后只显示当前用户绑定的 agent，避免团队成员之间串号。'
                : '注册后首次进入会创建个人 agent，并进入初始化配置流程。'}
            </p>
          </div>

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
              新用户
            </Button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>用户名</span>
              <Input
                prefix={<Icon name="user" />}
                placeholder="例如 main、alice、研发一组"
                autoComplete="username"
                required
                value={formValues.username}
                onChange={(event) => updateField('username', event.target.value)}
              />
            </label>

            <div
              className={`auth-extra-field ${authMode === 'register' ? 'is-visible' : ''}`}
              aria-hidden={authMode !== 'register'}
            >
              <label className="auth-field">
                <span>显示名称</span>
                <Input
                  prefix={<Icon name="user" />}
                  placeholder="留空则使用用户名"
                  autoComplete="name"
                  disabled={authMode !== 'register'}
                  value={formValues.displayName}
                  onChange={(event) => updateField('displayName', event.target.value)}
                />
              </label>
            </div>

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
              <Checkbox defaultChecked>{authMode === 'login' ? '由后端切换我的 agent' : '注册后创建我的 agent'}</Checkbox>
              {authMode === 'login' ? (
                <Button type="link" className="auth-link">
                  忘记密码请联系 main 管理员
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
