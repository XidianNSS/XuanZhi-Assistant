import type { ReactNode } from 'react';
import { PaperClipOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Tooltip } from 'antd';
import { Sender } from '@ant-design/x';

import { toolTags } from '../../data/assistantData';
import type { ComposerVariant } from '../../types/chat';

type ChatComposerProps = {
  value: string;
  variant: ComposerVariant;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function ChatComposer({ value, variant, onChange, onSubmit }: ChatComposerProps) {
  const renderFooter = (actionNode: ReactNode) => (
    <div className="sender-footer">
      <Space className="sender-footer-tools" size={6} wrap>
        {toolTags.map((item) => (
          <Tag key={item.label} icon={item.icon}>
            {item.label}
          </Tag>
        ))}
      </Space>
      <div className="sender-footer-actions">
        <Tooltip title="添加附件">
          <Button
            aria-label="添加附件"
            type="text"
            icon={<PaperClipOutlined />}
            className="sender-action-button"
          />
        </Tooltip>
        {actionNode}
      </div>
    </div>
  );

  return (
    <div className={`composer-wrap ${variant}`}>
      <Sender
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="给玄知助手发送消息"
        submitType="enter"
        autoSize={{ minRows: 1, maxRows: 5 }}
        allowSpeech
        className="assistant-sender"
        suffix={false}
        footer={renderFooter}
      />
    </div>
  );
}
