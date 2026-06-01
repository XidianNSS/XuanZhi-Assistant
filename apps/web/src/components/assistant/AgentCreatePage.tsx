import { agentTemplates } from '../../data/assistantData';
import type { AgentTemplate } from '../../data/assistantData';
import { Text } from '../ui';

type AgentCreatePageProps = {
  onSelectTemplate: (template: AgentTemplate) => void;
};

export function AgentCreatePage({ onSelectTemplate }: AgentCreatePageProps) {
  return (
    <section className="agent-create-page">
      <div className="agent-create-inner">
        <header className="agent-create-header">
          <h1>
            <span aria-hidden="true">🎁</span>
            选择一种方式，开始创建你的 Agent
          </h1>
          <Text type="secondary">选择一个模板后，会在左侧 Agent 列表中新建专属 Agent。</Text>
        </header>

        <div className="agent-template-grid">
          {agentTemplates.map((template) => (
            <button
              key={template.key}
              className={`agent-template-card is-${template.tone}`}
              type="button"
              onClick={() => onSelectTemplate(template)}
            >
              <span className="agent-template-copy">
                <Text strong>{template.name}</Text>
                <span>{template.description}</span>
                <ul>
                  {template.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </span>
              <span className="agent-template-image" aria-hidden="true">
                {template.image}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
