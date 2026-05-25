type JsonObject = Record<string, unknown>;

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details: unknown;
};

type XuanzhiTool = {
  description: string;
  parameters: JsonObject;
  execute: (toolCallId: string, params: JsonObject) => Promise<ToolResult>;
};

type OpenClawPluginApi = {
  registerTool?: (factory: () => XuanzhiTool, options: { name: string }) => void;
  logger?: {
    info?: (message: string) => void;
  };
};

function xuanzhiApiBaseUrl() {
  return process.env.XUANZHI_API_BASE_URL ?? 'http://127.0.0.1:3000';
}

function xuanzhiApiToken() {
  return process.env.XUANZHI_API_TOKEN ?? 'dev-token';
}

function requireString(params: JsonObject, key: string) {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(params: JsonObject, key: string) {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function requestXuanzhi(path: string, init: { method?: string; body?: unknown }) {
  // 插件只持有服务级 token，用于证明“调用方是受信任的运行时”；
  // 数据最终归属必须由玄知后端按 taskId 反查，不能由工具参数中的 userId 决定。
  const response = await fetch(`${xuanzhiApiBaseUrl()}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${xuanzhiApiToken()}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xuanzhi API request failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<unknown>;
}

function textResult(details: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
    details,
  };
}

export async function xuanzhi_emit_event(params: JsonObject) {
  const taskId = requireString(params, 'taskId');
  return requestXuanzhi(`/api/tasks/${encodeURIComponent(taskId)}/events`, {
    body: {
      type: requireString(params, 'type'),
      title: requireString(params, 'title'),
      message: optionalString(params, 'message'),
      status: optionalString(params, 'status'),
      payload: params.payload,
    },
  });
}

export async function xuanzhi_create_artifact(params: JsonObject) {
  const taskId = requireString(params, 'taskId');
  return requestXuanzhi(`/api/tasks/${encodeURIComponent(taskId)}/artifacts`, {
    body: {
      type: requireString(params, 'type'),
      title: requireString(params, 'title'),
      format: requireString(params, 'format'),
      content: params.content,
    },
  });
}

export async function xuanzhi_request_approval(params: JsonObject) {
  const taskId = requireString(params, 'taskId');
  return requestXuanzhi(`/api/tasks/${encodeURIComponent(taskId)}/approvals`, {
    body: {
      title: requireString(params, 'title'),
      description: requireString(params, 'description'),
      action: requireString(params, 'action'),
      payload: params.payload,
    },
  });
}

export async function xuanzhi_update_task_status(params: JsonObject) {
  const taskId = requireString(params, 'taskId');
  return requestXuanzhi(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    body: {
      status: requireString(params, 'status'),
    },
  });
}

const stringSchema = { type: 'string' };

function createTool(description: string, parameters: JsonObject, handler: (params: JsonObject) => Promise<unknown>) {
  return {
    description,
    parameters,
    async execute(_toolCallId: string, params: JsonObject) {
      return textResult(await handler(params));
    },
  };
}

const tools = {
  // Agent 暴露工具刻意不设计 userId 参数，减少模型或插件伪造归属的入口。
  xuanzhi_emit_event: () =>
    createTool(
      'Emit a Xuanzhi task event. Do not include userId; Xuanzhi resolves ownership by taskId.',
      {
        type: 'object',
        properties: {
          taskId: stringSchema,
          type: stringSchema,
          title: stringSchema,
          message: stringSchema,
          status: stringSchema,
          payload: { type: 'object' },
        },
        required: ['taskId', 'type', 'title'],
      },
      xuanzhi_emit_event,
    ),
  xuanzhi_create_artifact: () =>
    createTool(
      'Create a Xuanzhi artifact for the task. Do not include userId.',
      {
        type: 'object',
        properties: {
          taskId: stringSchema,
          type: stringSchema,
          title: stringSchema,
          format: stringSchema,
          content: {},
        },
        required: ['taskId', 'type', 'title', 'format'],
      },
      xuanzhi_create_artifact,
    ),
  xuanzhi_request_approval: () =>
    createTool(
      'Request user approval for an external or high-impact action. Do not include userId.',
      {
        type: 'object',
        properties: {
          taskId: stringSchema,
          title: stringSchema,
          description: stringSchema,
          action: stringSchema,
          payload: { type: 'object' },
        },
        required: ['taskId', 'title', 'description', 'action'],
      },
      xuanzhi_request_approval,
    ),
  xuanzhi_update_task_status: () =>
    createTool(
      'Update a Xuanzhi task status after a meaningful execution transition.',
      {
        type: 'object',
        properties: {
          taskId: stringSchema,
          status: stringSchema,
        },
        required: ['taskId', 'status'],
      },
      xuanzhi_update_task_status,
    ),
};

export default {
  id: 'xuanzhi-artifacts',
  name: 'Xuanzhi Artifacts',
  description: 'Emit Xuanzhi task events, artifacts, approvals, and task status updates.',
  register(api: OpenClawPluginApi) {
    // 保持普通对象形式可以先完成本地插件验证，后续接入正式 OpenClaw SDK 时再收敛类型。
    for (const [name, factory] of Object.entries(tools)) {
      api.registerTool?.(factory, { name });
    }
    api.logger?.info?.('[xuanzhi-artifacts] registered Xuanzhi reporting tools');
  },
};
