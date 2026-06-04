import type { ReactNode } from 'react';
import { Sender } from '@ant-design/x';

import { Button, Tooltip } from '../ui';
import { Icon } from '../ui/icons';
import type { ComposerVariant } from '../../types/chat';

export type ComposerCommand = '/compact' | '/reset' | '/help';

type ChatComposerProps = {
  commandsEnabled?: boolean;
  value: string;
  variant: ComposerVariant;
  onChange: (value: string) => void;
  onCommand?: (command: ComposerCommand) => void;
  onSubmit: (value: string) => void;
};

const commandItems: Array<{ command: ComposerCommand; label: string; icon: ReactNode }> = [
  { command: '/compact', label: '压缩上下文', icon: <Icon name="database" /> },
  { command: '/reset', label: '重置会话', icon: <Icon name="x-circle" /> },
  { command: '/help', label: '指令帮助', icon: <Icon name="bulb" /> },
];

export function ChatComposer({
  commandsEnabled = true,
  value,
  variant,
  onChange,
  onCommand,
  onSubmit,
}: ChatComposerProps) {
  const renderFooter = (actionNode: ReactNode) => (
    <div className="sender-footer">
      <div className="sender-command-bar" aria-label="OpenClaw 快捷指令">
        {commandItems.map((item) => (
          <Tooltip key={item.command} title={`${item.command} - ${item.label}`}>
            <button
              className="sender-command-button"
              disabled={!commandsEnabled}
              type="button"
              onClick={() => onCommand?.(item.command)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="sender-footer-actions">
        <Tooltip title="添加附件">
          <Button
            aria-label="添加附件"
            type="text"
            icon={<Icon name="paperclip" />}
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
