import type { ComponentProps } from 'react';
import { Prompts } from '@ant-design/x';

import { Icon } from '../components/ui/icons';

type PromptItem = NonNullable<ComponentProps<typeof Prompts>['items']>[number];
type PromptTone = 'lavender' | 'amber' | 'mint' | 'rose' | 'sky';
export type XuanzhiPromptItem = PromptItem & { tone: PromptTone };
export type AgentTemplate = {
  key: string;
  name: string;
  description: string;
  avatar: string;
  image: string;
  tone: 'blue' | 'violet' | 'amber' | 'mint' | 'rose' | 'slate';
  bullets: string[];
};

export const conversationItems = [
  {
    key: 'today-1',
    label: '助手系统 Web 界面',
    group: '今天',
    icon: <Icon name="message" />,
  },
  {
    key: 'today-2',
    label: '知识库问答流程',
    group: '今天',
    icon: <Icon name="book" />,
  },
  {
    key: 'today-3',
    label: 'Agent 工具调用设计',
    group: '今天',
    icon: <Icon name="tool" />,
  },
  {
    key: 'yesterday-1',
    label: '检索增强方案',
    group: '昨天',
    icon: <Icon name="file-search" />,
  },
  {
    key: 'yesterday-2',
    label: '多模型路由策略',
    group: '昨天',
    icon: <Icon name="cloud" />,
  },
];

export const promptItems: XuanzhiPromptItem[] = [
  {
    key: 'prd',
    icon: <Icon name="bulb" />,
    label: '安排日程',
    description: '一句话约日程会议',
    tone: 'lavender',
  },
  {
    key: 'kb',
    icon: <Icon name="database" />,
    label: '邮件管理',
    description: '帮你高效处理邮件',
    tone: 'amber',
  },
  {
    key: 'agent',
    icon: <Icon name="experiment" />,
    label: '整理桌面',
    description: '还你清爽电脑桌面',
    tone: 'mint',
  },
  {
    key: 'review',
    icon: <Icon name="check-circle" />,
    label: '体验检查',
    description: '检查交互和可用性',
    tone: 'rose',
  },
  {
    key: 'remote',
    icon: <Icon name="cloud" />,
    label: '远程办公',
    description: '随时处理在线任务',
    tone: 'sky',
  },
];

export const promptDrafts: Record<string, string> = {
  prd: '下周三上午帮我预约张三开项目复盘会',
  kb: '基于上传的知识库资料，回答用户问题时如何展示来源和置信度？',
  agent: '帮我设计一个 Agent 编排流程，包含意图识别、工具选择、执行和结果归纳。',
  review: '检查这个助手界面的信息架构、交互状态和视觉层级，并提出优化建议。',
  remote: '帮我整理今天远程办公要处理的任务，并按优先级排序。',
};

export const agentTemplates: AgentTemplate[] = [
  {
    key: 'custom',
    name: '我的Agent',
    description: '新Agent创建中...',
    avatar: '🤖',
    image: '🧑‍💻',
    tone: 'blue',
    bullets: ['网络创建：输入人名或链接生成', '文件创建：上传本地素材生成', 'Skill创建：Skill链接或名称生成', '全新自建：手动编写 Agent 人设'],
  },
  {
    key: 'expert',
    name: 'AI工程师',
    description: '务实的数据驱动派，用工程方式解决问题',
    avatar: '🕶️',
    image: '🧑‍🚀',
    tone: 'violet',
    bullets: ['精选专家模板', '覆盖工程、产品、办公和销售', '适合快速搭建专属工作流'],
  },
  {
    key: 'mail',
    name: '邮件管家',
    description: '整理收件箱、起草回复、跟进待办',
    avatar: '✉️',
    image: '📮',
    tone: 'amber',
    bullets: ['邮件分类', '回复草稿', '日程跟进'],
  },
  {
    key: 'research',
    name: '资料研究员',
    description: '围绕资料做归纳、对比和引用整理',
    avatar: '📚',
    image: '🔎',
    tone: 'mint',
    bullets: ['资料摘要', '来源整理', '结论提炼'],
  },
  {
    key: 'schedule',
    name: '日程小管家',
    description: '规划会议、提醒事项和每日安排',
    avatar: '📅',
    image: '⏰',
    tone: 'rose',
    bullets: ['会议安排', '任务提醒', '时间冲突检查'],
  },
  {
    key: 'writer',
    name: '文案编辑',
    description: '润色表达、整理结构、生成多版本文案',
    avatar: '✍️',
    image: '📝',
    tone: 'slate',
    bullets: ['结构优化', '语气调整', '多版本输出'],
  },
];
