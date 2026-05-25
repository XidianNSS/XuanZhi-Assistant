import type { Task } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from './store.js';
import type { StreamHub } from './stream.js';

// NOTE(mock-agent): 这是接入 OpenClaw 前的可演示执行器，用同一套 event/artifact/approval
// 写入路径验证权限、SSE 和审批闭环。所有生成数据都必须继承 task.userId。
export function runMockAgent(task: Task, store: MemoryStore, stream: StreamHub) {
  const publishTask = (status: Task['status']) => {
    const updated = store.updateTaskStatus(task.id, status);
    if (updated) {
      stream.broadcast(task.id, { type: 'task.updated', data: updated });
    }
  };

  const publishEvent = (input: Parameters<MemoryStore['addEvent']>[0]) => {
    const event = store.addEvent(input);
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
    return event;
  };

  const publishArtifact = (input: Parameters<MemoryStore['addArtifact']>[0]) => {
    const artifact = store.addArtifact(input);
    stream.broadcast(task.id, { type: 'artifact.created', data: artifact });
    return artifact;
  };

  const publishApproval = (input: Parameters<MemoryStore['addApproval']>[0]) => {
    const approval = store.addApproval(input);
    stream.broadcast(task.id, { type: 'approval.requested', data: approval });
    return approval;
  };

  publishTask('running');
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'task.input.received',
    title: '已收到用户输入',
    message: task.userInput,
    status: 'success',
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'agent.analysis.started',
    title: '正在分析任务',
    message: 'Agent 正在分析会议目标、时间和参会人。',
    status: 'running',
  });
  publishArtifact({
    userId: task.userId,
    taskId: task.id,
    type: 'plan',
    title: '执行计划',
    format: 'markdown',
    content: [
      '1. 确认会议主题为项目复盘会。',
      '2. 识别参会人为张三。',
      '3. 暂定时间为下周三上午。',
      '4. 请求用户确认后再创建会议。',
    ].join('\n'),
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'agent.plan.created',
    title: '已生成执行计划',
    status: 'success',
  });
  publishArtifact({
    userId: task.userId,
    taskId: task.id,
    type: 'meeting_draft',
    title: '会议草稿',
    format: 'json',
    content: {
      title: '项目复盘会',
      time: '下周三上午',
      attendees: ['张三'],
      agenda: ['回顾项目目标', '复盘关键问题', '确认后续行动'],
    },
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'agent.meeting_draft.created',
    title: '已生成会议草稿',
    status: 'success',
  });
  publishTask('waiting_approval');
  publishApproval({
    userId: task.userId,
    taskId: task.id,
    title: '确认创建会议',
    description: '是否确认创建项目复盘会？',
    action: 'calendar.create_meeting',
    payload: {
      title: '项目复盘会',
      time: '下周三上午',
      attendees: ['张三'],
    },
  });
  publishEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'approval.requested',
    title: '等待用户确认是否创建会议',
    status: 'waiting',
  });
}
