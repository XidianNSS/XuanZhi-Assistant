import { useState } from 'react';
import { Avatar, Button, Modal, Popover, Typography } from 'antd';
import { Conversations } from '@ant-design/x';
import { LogoutOutlined, MoreOutlined, PlusOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';

import { BrandLockup } from '../brand/BrandLockup';
import { conversationItems } from '../../data/assistantData';

const { Text } = Typography;

type SidebarProps = {
  activeKey: string;
  collapsed: boolean;
  onActiveChange: (key: string) => void;
  onCreateConversation: () => void;
  onLogout: () => void;
};

export function Sidebar({ activeKey, collapsed, onActiveChange, onCreateConversation, onLogout }: SidebarProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openSettings = () => {
    setAccountMenuOpen(false);
    setSettingsOpen(true);
  };

  const logout = () => {
    setAccountMenuOpen(false);
    onLogout();
  };

  const accountMenu = (
    <div className="sidebar-user-menu">
      <Button type="text" icon={<SettingOutlined />} className="sidebar-user-menu-item" onClick={openSettings}>
        设置
      </Button>
      <Button
        type="text"
        danger
        icon={<LogoutOutlined />}
        className="sidebar-user-menu-item"
        onClick={logout}
      >
        退出登录
      </Button>
    </div>
  );

  return (
    <aside className="assistant-sidebar" aria-hidden={collapsed}>
      <div className="assistant-sidebar-panel">
        <BrandLockup />

        <Button icon={<PlusOutlined />} className="new-chat-button" onClick={onCreateConversation}>
          新对话
        </Button>

        <Conversations
          className="conversation-list"
          activeKey={activeKey}
          items={conversationItems}
          groupable={{
            collapsible: true,
            defaultExpandedKeys: ['今天', '昨天'],
          }}
          menu={{
            items: [
              { key: 'rename', label: '重命名' },
              { key: 'archive', label: '归档' },
            ],
            trigger: <MoreOutlined />,
          }}
          onActiveChange={onActiveChange}
        />

        <div className="sidebar-footer">
          <Avatar size={28} icon={<UserOutlined />} />
          <div className="sidebar-footer-copy">
            <Text strong>张工</Text>
            <Text type="secondary">企业空间</Text>
          </div>
          <Popover
            trigger="click"
            placement="topRight"
            open={accountMenuOpen}
            onOpenChange={setAccountMenuOpen}
            content={accountMenu}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label="账户菜单" />
          </Popover>
        </div>
      </div>

      <Modal
        title="设置"
        open={settingsOpen}
        footer={null}
        width={360}
        centered
        onCancel={() => setSettingsOpen(false)}
      >
        <div className="sidebar-settings-panel">
          <div>
            <Text type="secondary">当前账号</Text>
            <Text strong>张工</Text>
          </div>
          <div>
            <Text type="secondary">空间</Text>
            <Text strong>企业空间</Text>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
