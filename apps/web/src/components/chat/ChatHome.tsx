import { Prompts } from '@ant-design/x';

import { promptItems } from '../../data/assistantData';
import { ChatComposer } from './ChatComposer';
import type { ComposerCommand } from './ChatComposer';

type ChatHomeProps = {
  inputValue: string;
  onInputChange: (value: string) => void;
  onCommand?: (command: ComposerCommand) => void;
  onPromptSelect: (key: string) => void;
  onSubmitMessage: (value: string) => void;
};

export function ChatHome({ inputValue, onInputChange, onCommand, onPromptSelect, onSubmitMessage }: ChatHomeProps) {
  return (
    <div className="home-canvas">
      <div className="home-title-wrap">
        <h1>
          Hi，我是玄知助手
          <span aria-hidden="true">*</span>
        </h1>
        <span className="title-underline" aria-hidden="true" />
      </div>
      <p>随时随地，帮你高效干活</p>

      <Prompts
        wrap
        items={promptItems}
        className="quick-prompts"
        classNames={{ item: 'quick-prompt-card' }}
        onItemClick={({ data }) => onPromptSelect(String(data.key))}
      />

      <ChatComposer
        commandsEnabled={false}
        value={inputValue}
        variant="home"
        onChange={onInputChange}
        onCommand={onCommand}
        onSubmit={onSubmitMessage}
      />
    </div>
  );
}
