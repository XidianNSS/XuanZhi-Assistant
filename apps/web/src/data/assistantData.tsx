import type { GetProp } from 'antd';
import {
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  MessageOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Prompts } from '@ant-design/x';

type PromptItem = GetProp<typeof Prompts, 'items'>[number];

export const conversationItems = [
  {
    key: 'today-1',
    label: '助手系统 Web 界面',
    group: '今天',
    icon: <MessageOutlined />,
  },
  {
    key: 'today-2',
    label: '知识库问答流程',
    group: '今天',
    icon: <BookOutlined />,
  },
  {
    key: 'today-3',
    label: 'Agent 工具调用设计',
    group: '今天',
    icon: <ToolOutlined />,
  },
  {
    key: 'yesterday-1',
    label: '检索增强方案',
    group: '昨天',
    icon: <FileSearchOutlined />,
  },
  {
    key: 'yesterday-2',
    label: '多模型路由策略',
    group: '昨天',
    icon: <CloudSyncOutlined />,
  },
];

export const promptItems: PromptItem[] = [
  {
    key: 'prd',
    icon: <BulbOutlined />,
    label: '生成产品方案',
    description: '整理模块、页面和流程',
  },
  {
    key: 'kb',
    icon: <DatabaseOutlined />,
    label: '知识库问答',
    description: '基于资料回答并标注依据',
  },
  {
    key: 'agent',
    icon: <ExperimentOutlined />,
    label: 'Agent 编排',
    description: '拆解步骤并安排工具',
  },
  {
    key: 'review',
    icon: <CheckCircleOutlined />,
    label: '体验检查',
    description: '检查交互、布局和可用性',
  },
];

export const promptDrafts: Record<string, string> = {
  prd: '帮我生成一个企业级助手系统的产品方案，包含核心模块、页面结构和交互流程。',
  kb: '基于上传的知识库资料，回答用户问题时如何展示来源和置信度？',
  agent: '帮我设计一个 Agent 编排流程，包含意图识别、工具选择、执行和结果归纳。',
  review: '检查这个助手界面的信息架构、交互状态和视觉层级，并提出优化建议。',
};

export const toolTags = [
  { label: '深度思考', icon: <ExperimentOutlined /> },
  { label: '联网搜索', icon: <SearchOutlined /> },
  { label: '知识库', icon: <BookOutlined /> },
  { label: '工具调用', icon: <ToolOutlined /> },
];
