import type { MessagePlanStep } from '../../types/protocol';

type PlanStepsProps = {
  steps: MessagePlanStep[];
};

const statusLabel: Record<MessagePlanStep['status'], string> = {
  pending: '等待',
  running: '进行中',
  done: '完成',
  error: '异常',
};

export function PlanSteps({ steps }: PlanStepsProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ol className="plan-steps">
      {steps.map((step) => (
        <li key={step.id} className={`plan-step is-${step.status}`}>
          <span className="plan-step-dot" aria-hidden="true" />
          <span className="plan-step-text">{step.text}</span>
          <span className="plan-step-status">{statusLabel[step.status]}</span>
        </li>
      ))}
    </ol>
  );
}
