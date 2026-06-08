// Plugin SDK compatible types (matches openclaw/plugin-sdk shapes).
// Replace with real SDK imports once OpenClaw is installed:
//   import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
//   import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

// ---------------------------------------------------------------------------
// SDK-compatible type shapes
// ---------------------------------------------------------------------------

type PluginConfig = Record<string, unknown>;

type ToolParameterSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

type AgentTool = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (...args: unknown[]) => Promise<ToolResult>;
};

type PluginLogger = {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
};

type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  pluginConfig?: PluginConfig;
  logger: PluginLogger;
  registerTool: (tool: AgentTool, opts?: { optional?: boolean }) => void;
};

type PluginEntry = {
  id: string;
  name: string;
  description?: string;
  register: (api: OpenClawPluginApi) => void;
};

function definePluginEntry(entry: PluginEntry): PluginEntry {
  return entry;
}

// ---------------------------------------------------------------------------
// Config resolution (pluginConfig -> env -> defaults)
// ---------------------------------------------------------------------------

function resolveConfig(api: OpenClawPluginApi) {
  return {
    baseUrl: trimTrailingSlash(
      stringOr(
        api.pluginConfig?.baseUrl,
        process.env.XUANZHI_API_BASE_URL,
        "http://127.0.0.1:3000",
      ),
    ),
    token: stringOr(
      api.pluginConfig?.token,
      process.env.XUANZHI_API_TOKEN,
      "dev-token",
    ),
  };
}

function stringOr(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "http://127.0.0.1:3000";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

async function xuanzhiFetch(
  cfg: { baseUrl: string; token: string },
  path: string,
  init: { method?: string; body?: unknown },
) {
  const response = await fetch(`${cfg.baseUrl}${path}`, {
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xuanzhi API request failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<unknown>;
}

function toolParams(args: unknown[]) {
  const candidate = args.length >= 2 ? args[1] : args[0];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate as Record<string, unknown>;
}

function contextObjects(args: unknown[]) {
  return args.filter(
    (arg): arg is Record<string, unknown> => Boolean(arg) && typeof arg === "object" && !Array.isArray(arg),
  );
}

// ---------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------

function requireString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function runtimeString(args: unknown[], key: string) {
  for (const item of contextObjects(args)) {
    const direct = firstString(item[key]);
    if (direct) return direct;

    const session = item.session;
    if (session && typeof session === "object" && !Array.isArray(session)) {
      const nested = firstString((session as Record<string, unknown>)[key]);
      if (nested) return nested;
    }

    const agent = item.agent;
    if (agent && typeof agent === "object" && !Array.isArray(agent)) {
      const nested = firstString((agent as Record<string, unknown>)[key]);
      if (nested) return nested;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

async function wrapResult(
  apiCall: Promise<unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }> {
  const details = await apiCall;
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

// ---------------------------------------------------------------------------
// Tool execute functions (same business logic as before)
// ---------------------------------------------------------------------------

function makeStartTask(cfg: { baseUrl: string; token: string }) {
  return async (...args: unknown[]) => {
    const params = toolParams(args);
    const sessionKey = firstString(
      optionalString(params, "sessionKey"),
      runtimeString(args, "sessionKey"),
      runtimeString(args, "sessionId"),
    );
    if (!sessionKey) {
      throw new Error("sessionKey must be the current OpenClaw session id");
    }

    return wrapResult(
      xuanzhiFetch(cfg, "/api/openclaw/tasks/start", {
        body: {
          sessionKey,
          agentId: firstString(optionalString(params, "agentId"), runtimeString(args, "agentId")),
          agentName: firstString(optionalString(params, "agentName"), runtimeString(args, "agentName"), runtimeString(args, "name")),
          title: requireString(params, "title"),
          intent: optionalString(params, "intent"),
          summary: optionalString(params, "summary"),
        },
      }),
    );
  };
}

function makeEmitEvent(cfg: { baseUrl: string; token: string }) {
  return async (...args: unknown[]) => {
    const params = toolParams(args);
    const taskId = requireString(params, "taskId");
    return wrapResult(
      xuanzhiFetch(cfg, `/api/tasks/${encodeURIComponent(taskId)}/events`, {
        body: {
          type: requireString(params, "type"),
          title: requireString(params, "title"),
          message: optionalString(params, "message"),
          status: optionalString(params, "status"),
          payload: params.payload,
        },
      }),
    );
  };
}

function makeCreateArtifact(cfg: { baseUrl: string; token: string }) {
  return async (...args: unknown[]) => {
    const params = toolParams(args);
    const taskId = requireString(params, "taskId");
    return wrapResult(
      xuanzhiFetch(cfg, `/api/tasks/${encodeURIComponent(taskId)}/artifacts`, {
        body: {
          type: requireString(params, "type"),
          title: requireString(params, "title"),
          format: requireString(params, "format"),
          content: params.content,
          fileName: optionalString(params, "fileName"),
          mimeType: optionalString(params, "mimeType"),
        },
      }),
    );
  };
}

function makeRequestApproval(cfg: { baseUrl: string; token: string }) {
  return async (...args: unknown[]) => {
    const params = toolParams(args);
    const taskId = requireString(params, "taskId");
    return wrapResult(
      xuanzhiFetch(cfg, `/api/tasks/${encodeURIComponent(taskId)}/approvals`, {
        body: {
          title: requireString(params, "title"),
          description: requireString(params, "description"),
          action: requireString(params, "action"),
          payload: params.payload,
        },
      }),
    );
  };
}

function makeUpdateTaskStatus(cfg: { baseUrl: string; token: string }) {
  return async (...args: unknown[]) => {
    const params = toolParams(args);
    const taskId = requireString(params, "taskId");
    return wrapResult(
      xuanzhiFetch(cfg, `/api/tasks/${encodeURIComponent(taskId)}/status`, {
        method: "PATCH",
        body: {
          status: requireString(params, "status"),
        },
      }),
    );
  };
}

// ---------------------------------------------------------------------------
// JSON Schema helpers for tool parameters
// ---------------------------------------------------------------------------

const stringProp = { type: "string" as const };

function buildToolParams(required: string[], extras: Record<string, unknown> = {}) {
  return {
    type: "object" as const,
    additionalProperties: false,
    properties: { ...extras },
    required,
  };
}

function enumProp(values: string[]) {
  return {
    type: "string" as const,
    enum: values,
  };
}

const startTaskParams = buildToolParams(["title", "sessionKey"], {
  title: stringProp,
  intent: enumProp(["meeting", "business", "coding", "qa", "general"]),
  summary: stringProp,
  sessionKey: stringProp,
  agentId: stringProp,
  agentName: stringProp,
});

const eventParams = buildToolParams(["taskId", "type", "title"], {
  taskId: stringProp,
  type: stringProp,
  title: stringProp,
  message: stringProp,
  status: enumProp(["pending", "running", "success", "error", "waiting"]),
  payload: { type: "object" },
});

const artifactParams = buildToolParams(["taskId", "type", "title", "format"], {
  taskId: stringProp,
  type: enumProp(["plan", "meeting_draft", "code_diff", "report", "tool_result", "final_answer"]),
  title: stringProp,
  format: enumProp(["markdown", "json", "diff", "text"]),
  content: {},
  fileName: stringProp,
  mimeType: stringProp,
});

const approvalParams = buildToolParams(["taskId", "title", "description", "action"], {
  taskId: stringProp,
  title: stringProp,
  description: stringProp,
  action: stringProp,
  payload: { type: "object" },
});

const statusParams = buildToolParams(["taskId", "status"], {
  taskId: stringProp,
  status: enumProp(["created", "planning", "running", "waiting_approval", "completed", "failed"]),
});

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

export default definePluginEntry({
  id: "xuanzhi-artifacts",
  name: "Xuanzhi Artifacts",
  description:
    "Emit Xuanzhi task events, artifacts, approvals, and task status updates.",

  register(api) {
    const cfg = resolveConfig(api);
    api.logger.info("[xuanzhi-artifacts] registering Xuanzhi reporting tools");

    api.registerTool({
      name: "xuanzhi_start_task",
      description:
        "Start a new Xuanzhi task for trackable work. Pass sessionKey as the current OpenClaw session id, for example agent:<agentName>:main or agent:<agentName>:task:<taskId>. Do not include userId.",
      parameters: startTaskParams,
      execute: makeStartTask(cfg),
    });

    api.registerTool({
      name: "xuanzhi_emit_event",
      description:
        "Emit a Xuanzhi task progress event for an existing taskId. Do not include userId. Do not use this for chat messages.",
      parameters: eventParams,
      execute: makeEmitEvent(cfg),
    });

    api.registerTool({
      name: "xuanzhi_create_artifact",
      description:
        "Create a Xuanzhi task artifact such as a plan, report, code diff, tool result, or task final summary for an existing taskId. Do not include userId. Do not use this for OpenClaw chat history.",
      parameters: artifactParams,
      execute: makeCreateArtifact(cfg),
    });

    api.registerTool({
      name: "xuanzhi_request_approval",
      description:
        "Request user approval for an external or high-impact task action for an existing taskId. Do not include userId.",
      parameters: approvalParams,
      execute: makeRequestApproval(cfg),
    });

    api.registerTool({
      name: "xuanzhi_update_task_status",
      description:
        "Update a Xuanzhi task status after a meaningful execution transition for an existing taskId. Do not use this for chat delivery state.",
      parameters: statusParams,
      execute: makeUpdateTaskStatus(cfg),
    });
  },
});
