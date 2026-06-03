import type { Agent, XuanzhiAgentProfile } from '@xuanzhi/shared/protocol';

type GatewayClient = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

type ProfileAgent = Pick<Agent, 'id' | 'name' | 'gatewayAgentId' | 'profile' | 'emoji'>;

const experienceLabels: Record<string, string> = {
  beginner: '初级',
  intermediate: '中级',
  expert: '专家',
};

function joinList(values: string[] | undefined) {
  return values?.length ? values.join('、') : '未填写';
}

function valueOrEmpty(value: string | undefined) {
  return value?.trim() || '未填写';
}

function buildUserMd(profile: XuanzhiAgentProfile) {
  const identity = profile.identity;
  const requirements = profile.requirements;

  return [
    '# USER.md - About Your Human',
    '',
    `- **Name:** ${valueOrEmpty(identity.displayName)}`,
    `- **Role:** ${valueOrEmpty(identity.role)}`,
    `- **Organization:** ${valueOrEmpty(identity.organization)}`,
    `- **Experience:** ${experienceLabels[identity.experience ?? ''] ?? '未填写'}`,
    `- **Language:** ${requirements.language ?? 'zh-CN'}`,
    '',
    '## Context',
    '',
    `- **Research fields:** ${joinList(identity.researchFields)}`,
    `- **Expert domains:** ${joinList(requirements.expertDomains)}`,
    '',
    '## Preferences',
    '',
    `- **Tone:** ${requirements.tone ?? '未填写'}`,
    `- **Depth:** ${requirements.depth ?? '未填写'}`,
    `- **Auto mode:** ${requirements.autoMode === false ? '否' : '是'}`,
    '',
    'Use this profile to adapt wording, depth, examples, and assumptions. Do not mention these profile notes unless the user asks.',
    '',
  ].join('\n');
}

function buildAgentsMd(agent: ProfileAgent, profile: XuanzhiAgentProfile) {
  return [
    '# AGENTS.md - XuanZhi Agent Instructions',
    '',
    `You are ${profile.agentName || agent.name}, the dedicated XuanZhi assistant for this workspace.`,
    '',
    '## User Profile',
    '',
    `- User name: ${valueOrEmpty(profile.identity.displayName)}`,
    `- User role: ${valueOrEmpty(profile.identity.role)}`,
    `- Organization: ${valueOrEmpty(profile.identity.organization)}`,
    `- Research fields: ${joinList(profile.identity.researchFields)}`,
    `- Expert domains: ${joinList(profile.requirements.expertDomains)}`,
    `- Preferred tone: ${profile.requirements.tone ?? '未填写'}`,
    `- Preferred depth: ${profile.requirements.depth ?? '未填写'}`,
    '',
    '## Behavior',
    '',
    '- Treat this as an isolated user workspace. Do not reuse context from other users.',
    '- Answer in Chinese by default unless the user asks for another language.',
    '- Match the configured depth and tone while staying concise and practical.',
    '- When the user asks who they are or what preferences are configured, use USER.md and this file as source material.',
    '',
  ].join('\n');
}

export function buildProfileFiles(agent: ProfileAgent) {
  if (!agent.profile) {
    return [];
  }

  return [
    {
      name: 'USER.md',
      content: buildUserMd(agent.profile),
    },
    {
      name: 'AGENTS.md',
      content: buildAgentsMd(agent, agent.profile),
    },
  ];
}

export async function syncAgentProfileFiles(client: GatewayClient, agent: ProfileAgent) {
  if (!agent.gatewayAgentId || !agent.profile) {
    return;
  }

  await client.request('agents.update', {
    agentId: agent.gatewayAgentId,
    name: agent.profile.agentName || agent.name,
    emoji: agent.emoji,
  });

  for (const file of buildProfileFiles(agent)) {
    await client.request('agents.files.set', {
      agentId: agent.gatewayAgentId,
      name: file.name,
      content: file.content,
    });
  }
}
