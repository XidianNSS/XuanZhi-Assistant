import { afterEach, describe, expect, it, vi } from "vitest";

import plugin from "./index.js";
import manifest from "../openclaw.plugin.json" with { type: "json" };

type RegisteredTool = {
  name: string;
  parameters: {
    type: "object";
    additionalProperties?: boolean;
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (...args: unknown[]) => Promise<unknown>;
};

function createPluginApi(config: Record<string, unknown> = {}) {
  const tools: RegisteredTool[] = [];
  const api = {
    pluginConfig: config,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    registerTool: vi.fn((tool: RegisteredTool) => {
      tools.push(tool);
    }),
  };

  plugin.register(api);

  return { api, tools };
}

function stubFetch(response: { ok?: boolean; status?: number; text?: string; json?: unknown } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    text: async () => response.text ?? "",
    json: async () => response.json ?? { ok: true },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("xuanzhi-artifacts plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("registers exactly the manifest tool contracts with strict parameter schemas", () => {
    const { api, tools } = createPluginApi();

    expect(api.logger.info).toHaveBeenCalledWith(
      "[xuanzhi-artifacts] registering Xuanzhi reporting tools",
    );
    expect(tools.map((tool) => tool.name)).toEqual(manifest.contracts.tools);
    for (const tool of tools) {
      expect(tool.parameters).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("emits events without forwarding spoofed user ownership", async () => {
    const fetchMock = stubFetch({
      json: {
        id: "evt_1",
      },
    });
    const { tools } = createPluginApi({
      baseUrl: "http://xuanzhi.local/",
      token: "plugin-token",
    });

    const result = await tools
      .find((tool) => tool.name === "xuanzhi_emit_event")
      ?.execute("call_1", {
        taskId: "task_1",
        type: "openclaw.smoke",
        title: "OpenClaw smoke",
        message: "connected",
        status: "success",
        payload: { source: "test" },
        userId: "user_b",
      });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ id: "evt_1" }, null, 2),
        },
      ],
      details: { id: "evt_1" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://xuanzhi.local/api/tasks/task_1/events",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer plugin-token",
        },
        body: JSON.stringify({
          type: "openclaw.smoke",
          title: "OpenClaw smoke",
          message: "connected",
          status: "success",
          payload: { source: "test" },
        }),
      }),
    );
  });

  it("supports legacy single-argument tool execution", async () => {
    const fetchMock = stubFetch();
    const { tools } = createPluginApi();

    await tools.find((tool) => tool.name === "xuanzhi_update_task_status")?.execute({
      taskId: "task_2",
      status: "waiting_approval",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/tasks/task_2/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "waiting_approval" }),
      }),
    );
  });

  it("prefers plugin config over environment variables", async () => {
    vi.stubEnv("XUANZHI_API_BASE_URL", "http://env-host");
    vi.stubEnv("XUANZHI_API_TOKEN", "env-token");
    const fetchMock = stubFetch();
    const { tools } = createPluginApi({
      baseUrl: "http://config-host/base",
      token: "config-token",
    });

    await tools.find((tool) => tool.name === "xuanzhi_request_approval")?.execute("call_1", {
      taskId: "task_3",
      title: "Confirm",
      description: "Confirm action",
      action: "test.confirm",
      payload: { ok: true },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://config-host/base/api/tasks/task_3/approvals",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          authorization: "Bearer config-token",
        },
      }),
    );
  });

  it("throws concise API errors with response body text", async () => {
    stubFetch({
      ok: false,
      status: 401,
      text: "unauthorized",
    });
    const { tools } = createPluginApi();

    await expect(
      tools.find((tool) => tool.name === "xuanzhi_create_artifact")?.execute("call_1", {
        taskId: "task_4",
        type: "report",
        title: "Report",
        format: "markdown",
        content: "# Report",
      }),
    ).rejects.toThrow("Xuanzhi API request failed: 401 unauthorized");
  });
});
