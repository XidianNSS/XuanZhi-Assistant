import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Checkbox, Input, toast } from '../ui';
import { Icon } from '../ui/icons';
import { BrandLockup } from '../brand/BrandLockup';
import { ProductLogo } from './ProductLogo';
import type { AuthMode } from '../../types/chat';

type AuthScreenProps = {
  loading?: boolean;
  onLogin: (values: { email: string; password: string }) => Promise<void>;
  onRegister: (values: { email: string; name: string; password: string }) => Promise<void>;
};

const initialForm = {
  confirmPassword: '',
  email: 'user-a@example.com',
  name: '',
  password: 'dev-password',
};

export function AuthScreen({ loading, onLogin, onRegister }: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [formValues, setFormValues] = useState(initialForm);

  const switchAuthMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setFormValues({
      ...initialForm,
      email: nextMode === 'login' ? 'user-a@example.com' : '',
      password: nextMode === 'login' ? 'dev-password' : '',
    });
    setAuthMode(nextMode);
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
      void onRegister({
        email: formValues.email,
        name: formValues.name,
        password: formValues.password,
      });
      return;
    }

    void onLogin({
      email: formValues.email,
      password: formValues.password,
    });
  };

  return (
    <main className={`auth-shell auth-mode-${authMode}`}>
      <section className="auth-layout">
        <div className="auth-visual">
          <ProductLogo />
          <div className="auth-intro">
            <h2>企业知识与工具的统一入口</h2>
            <p>每个用户拥有独立 Agent 和 OpenClaw workspace，对话、文件和执行上下文互相隔离。</p>
          </div>
        </div>

        <section className="auth-card" aria-label={authMode === 'login' ? '登录' : '注册'}>
          <BrandLockup className="auth-brand" />

          <div className="auth-copy">
            <h1>{authMode === 'login' ? '登录玄知助理' : '创建玄知账号'}</h1>
            <p>
              {authMode === 'login'
                ? '进入你的专属 Agent 工作区。'
                : '注册后系统会自动创建专属 Agent 和隔离 workspace。'}
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
              注册
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
              <Checkbox defaultChecked>{authMode === 'login' ? '记住登录状态' : '同意服务条款'}</Checkbox>
              {authMode === 'login' ? (
                <Button type="link" className="auth-link">
                  忘记密码
                </Button>
              ) : null}
            </div>

            <Button type="primary" htmlType="submit" size="large" block className="auth-submit" loading={loading}>
              {authMode === 'login' ? '登录' : '注册并进入初始化'}
            </Button>
          </form>
        </section>
      </section>
    </main>
  );
}
