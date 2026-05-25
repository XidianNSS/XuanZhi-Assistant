import { RobotOutlined } from '@ant-design/icons';
import { Prompts } from '@ant-design/x';

import { promptItems } from '../../data/assistantData';
import { ChatComposer } from './ChatComposer';

type ChatHomeProps = {
  inputValue: string;
  onInputChange: (value: string) => void;
  onPromptSelect: (key: string) => void;
  onSubmitMessage: (value: string) => void;
};

export function ChatHome({ inputValue, onInputChange, onPromptSelect, onSubmitMessage }: ChatHomeProps) {
  return (
    <div className="home-canvas">
      <span className="welcome-avatar">
        <RobotOutlined />
      </span>
      <h1>我是玄知助手，很高兴见到你</h1>
      <p>你可以直接提问，或开启知识库、联网搜索和工具调用来完成更复杂的任务。</p>

      <ChatComposer value={inputValue} variant="home" onChange={onInputChange} onSubmit={onSubmitMessage} />

      <Prompts
        wrap
        items={promptItems}
        className="quick-prompts"
        onItemClick={({ data }) => onPromptSelect(String(data.key))}
      />
    </div>
  );
}
