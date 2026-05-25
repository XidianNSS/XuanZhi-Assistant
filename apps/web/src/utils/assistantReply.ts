export const buildAssistantReply = (question: string) =>
  `我会围绕“${question}”先拆成目标、上下文、执行步骤和输出结果。Web 端建议保持对话主线足够干净，把知识库、联网搜索和工具调用放在输入区附近作为能力开关，避免把首页做成复杂控制台。`;
