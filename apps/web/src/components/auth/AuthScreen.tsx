import { useState } from 'react';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input } from 'antd';

import { BrandLockup } from '../brand/BrandLockup';
import { ProductLogo } from './ProductLogo';
import type { AuthMode } from '../../types/chat';

type AuthScreenProps = {
  onAuthenticated: () => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [form] = Form.useForm();
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const switchAuthMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) {
      return;
    }

    form.resetFields();
    setAuthMode(nextMode);
  };

  return (
    <main className={`auth-shell auth-mode-${authMode}`}>
      <section className="auth-layout">
        <div className="auth-visual">
          <ProductLogo />
          <div className="auth-intro">
            <h2>企业知识与工具的统一入口</h2>
            <p>将知识库问答、联网检索和 Agent 工具调用收束到一条清晰对话主线。</p>
          </div>
        </div>

        <section className="auth-card" aria-label={authMode === 'login' ? '登录' : '注册'}>
          <BrandLockup className="auth-brand" />

          <div className="auth-copy">
            <h1>{authMode === 'login' ? '登录玄知助手' : '创建玄知账号'}</h1>
            <p>进入简洁、专注的企业智能助手工作台。</p>
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

          <Form form={form} className="auth-form" layout="vertical" requiredMark={false} onFinish={onAuthenticated}>
            <div
              className={`auth-extra-field ${authMode === 'register' ? 'is-visible' : ''}`}
              aria-hidden={authMode !== 'register'}
            >
              <Form.Item
                label="姓名"
                name="name"
                rules={[{ required: authMode === 'register', message: '请输入姓名' }]}
              >
                <Input
                  size="large"
                  placeholder="请输入姓名"
                  autoComplete="name"
                  disabled={authMode !== 'register'}
                />
              </Form.Item>
            </div>

            <Form.Item label="邮箱" name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
              <Input
                size="large"
                prefix={<MailOutlined />}
                placeholder="name@company.com"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              />
            </Form.Item>

            <div
              className={`auth-extra-field ${authMode === 'register' ? 'is-visible' : ''}`}
              aria-hidden={authMode !== 'register'}
            >
              <Form.Item
                label="确认密码"
                name="confirmPassword"
                rules={[{ required: authMode === 'register', message: '请再次输入密码' }]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined />}
                  placeholder="请再次输入密码"
                  autoComplete="new-password"
                  disabled={authMode !== 'register'}
                />
              </Form.Item>
            </div>

            <div className="auth-options">
              <Checkbox defaultChecked>{authMode === 'login' ? '记住登录状态' : '同意服务条款'}</Checkbox>
              {authMode === 'login' ? (
                <Button type="link" className="auth-link">
                  忘记密码
                </Button>
              ) : null}
            </div>

            <Button type="primary" htmlType="submit" size="large" block className="auth-submit">
              {authMode === 'login' ? '登录' : '注册并进入'}
            </Button>
          </Form>
        </section>
      </section>
    </main>
  );
}
