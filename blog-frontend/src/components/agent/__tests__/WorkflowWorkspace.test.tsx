import {
  render as renderWithRouter,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WorkflowWorkspace } from "../WorkflowWorkspace";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../../../auth", async () => {
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

const workflow = {
  id: 7,
  name: "Daily digest",
  description: "Summarize the day.",
  enabled: true,
  cron_expression: "0 9 * * *",
  timezone: "Asia/Shanghai",
  current_version: 1,
  version_id: 11,
  input_schema: { type: "object", additionalProperties: false },
  steps: [{ id: "result", type: "output" as const, output_pointer: "/input" }],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

function render(ui: React.ReactElement) {
  return renderWithRouter(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("WorkflowWorkspace", () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue(Response.json({ data: {} }));
    window.history.replaceState(null, "", "/");
  });
  it("sorts workflows by enabled first then newest timestamp, and filters the list", async () => {
    const user = userEvent.setup();
    const olderEnabled = {
      ...workflow,
      id: 1,
      name: "Older enabled",
      enabled: true,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    };
    const newerEnabled = {
      ...workflow,
      id: 2,
      name: "Newer enabled",
      enabled: true,
      created_at: "2026-08-02T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
    };
    const disabledWorkflow = {
      ...workflow,
      id: 3,
      name: "Disabled workflow",
      enabled: false,
      created_at: "2026-08-05T00:00:00Z",
      updated_at: "2026-08-05T00:00:00Z",
    };

    render(
      <WorkflowWorkspace
        workflows={[olderEnabled, disabledWorkflow, newerEnabled]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const list = screen.getByRole("table");
    // Enabled workflows come before disabled workflow despite disabled having a newer timestamp
    expect(list.textContent?.indexOf("Newer enabled")).toBeLessThan(
      list.textContent?.indexOf("Older enabled"),
    );
    expect(list.textContent?.indexOf("Older enabled")).toBeLessThan(
      list.textContent?.indexOf("Disabled workflow"),
    );

    // Test search filter
    await user.type(
      screen.getByRole("searchbox", { name: "搜索 Workflow" }),
      "Newer",
    );
    expect(
      screen.getByRole("button", { name: /Newer enabled/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Older enabled/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Disabled workflow/ }),
    ).not.toBeInTheDocument();
  });

  it("filters by status chips", async () => {
    const user = userEvent.setup();
    const active = {
      ...workflow,
      id: 1,
      name: "Active workflow",
      enabled: true,
    };
    const paused = {
      ...workflow,
      id: 2,
      name: "Paused workflow",
      enabled: false,
    };

    render(
      <WorkflowWorkspace
        workflows={[active, paused]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /已启用/ }));
    expect(
      screen.getByRole("button", { name: /Active workflow/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Paused workflow/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /已停用/ }));
    expect(
      screen.queryByRole("button", { name: /Active workflow/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Paused workflow/ }),
    ).toBeInTheDocument();
  });

  it("confirms and soft-deletes a workflow", async () => {
    const user = userEvent.setup();
    const onMutate = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="en"
        onMutate={onMutate}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "Deleting “Daily digest” stops future runs. Version history and run audits are retained.",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete workflow" }),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/admin/ai-workflows/7", {
        method: "DELETE",
      }),
    );
  });

  it("navigates to detail view, shows progress immediately and success feedback after a run completes", async () => {
    const user = userEvent.setup();
    let complete!: (value: unknown) => void;
    const onRun = vi.fn().mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          complete = resolve;
        }),
    );
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={onRun}
        onSave={vi.fn()}
      />,
    );

    // Click workflow name to enter detail view
    await user.click(screen.getByRole("button", { name: /Daily digest/ }));
    expect(
      screen.getByRole("button", { name: "返回工作流列表" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "运行" }));
    expect(screen.getByRole("button", { name: "运行中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dry-run" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Workflow 正在执行");
    expect(screen.getByRole("status")).toHaveTextContent(
      "完成后会自动刷新状态和运行记录",
    );

    complete({
      id: 21,
      workflow_id: 7,
      workflow_version_id: 11,
      dry_run: false,
      status: "succeeded",
      input: {},
      input_tokens: 0,
      output_tokens: 0,
      created_at: "2026-08-01T10:00:00Z",
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "今日已有成功运行 Run #21，本次未重复执行",
      ),
    );
    expect(screen.getByRole("link", { name: "查看运行中心" })).toHaveAttribute(
      "href",
      "/admin/ai-ops?tab=records&record=workflow&workflow=7&run=21",
    );
    expect(screen.getByRole("button", { name: "运行" })).toBeEnabled();
    expect(onRun).toHaveBeenCalledWith(7, false, {});

    // Can navigate back to list view
    await user.click(screen.getByRole("button", { name: "返回工作流列表" }));
    expect(
      screen.getByRole("searchbox", { name: "搜索 Workflow" }),
    ).toBeInTheDocument();
  });

  it("shows an actionable failure message and restores the run button", async () => {
    const user = userEvent.setup();
    const onRun = vi
      .fn()
      .mockRejectedValue(new Error("Provider request timeout"));
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={onRun}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Daily digest/ }));
    await user.click(screen.getByRole("button", { name: "运行" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "运行失败：Provider request timeout",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "运行中心 → Workflow 任务",
    );
    expect(screen.getByRole("button", { name: "运行" })).toBeEnabled();
  });

  it("stops a run when the server-side preflight finds a missing dependency", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={onRun}
        onSave={vi.fn()}
        onPreflight={vi.fn().mockResolvedValue({
          ready: false,
          checks: [
            {
              key: "agent_bindings",
              status: "error",
              message: 'linked Agent "Reviewer" is disabled',
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Daily digest/ }));
    await user.click(screen.getByRole("button", { name: "运行" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'linked Agent "Reviewer" is disabled',
    );
    expect(onRun).not.toHaveBeenCalled();
  });

  it("does not report success when the backend returns a failed run", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue({
      id: 22,
      workflow_id: 7,
      workflow_version_id: 11,
      dry_run: false,
      status: "failed",
      input: {},
      input_tokens: 0,
      output_tokens: 0,
      error_message: "RSS source validation failed",
      created_at: "2026-08-01T10:01:00Z",
    });
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={onRun}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Daily digest/ }));
    await user.click(screen.getByRole("button", { name: "运行" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "运行失败：RSS source validation failed",
    );
    expect(screen.getByRole("link", { name: "查看运行中心" })).toHaveAttribute(
      "href",
      "/admin/ai-ops?tab=records&record=workflow&workflow=7&run=22",
    );
    expect(screen.queryByText(/运行成功/)).not.toBeInTheDocument();
  });

  it("links a run-owned image task directly to its continuation workspace without approval", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue({
      id: 31,
      workflow_id: 7,
      workflow_version_id: 11,
      dry_run: false,
      status: "waiting_for_user",
      input: {},
      input_tokens: 100,
      output_tokens: 80,
      created_at: "2026-08-01T10:02:00Z",
    });
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={onRun}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Daily digest/ }));
    await user.click(screen.getByRole("button", { name: "运行" }));

    const link = await screen.findByRole("link", {
      name: "继续生成、选择和应用图片",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "无需前往“待我处理”审批",
    );
    expect(link).toHaveAttribute(
      "href",
      "/admin/ai-ops?tab=records&record=workflow&workflow=7&run=31",
    );
  });

  it("does not let a successful dry-run hide a failed live run in detail view", async () => {
    const user = userEvent.setup();
    const failedRun = {
      id: 6,
      workflow_id: 7,
      workflow_version_id: 11,
      dry_run: false,
      status: "failed",
      input: {},
      input_tokens: 0,
      output_tokens: 0,
      error_message: "Provider failed",
      created_at: "2026-08-01T09:00:00Z",
    };
    const dryRun = {
      ...failedRun,
      id: 19,
      dry_run: true,
      status: "succeeded",
      error_message: undefined,
      created_at: "2026-08-01T10:00:00Z",
    };
    render(
      <WorkflowWorkspace
        workflows={[workflow]}
        runs={[dryRun, failedRun]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Daily digest/ }));
    expect(
      screen.getByText("最近正式运行").nextElementSibling,
    ).toHaveTextContent("失败");
    expect(screen.getByText("最近试运行：成功")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
  });

  it("keeps tool authorization in the structured scope editor", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowWorkspace
        workflows={[]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "创建 Workflow" }));
    expect(screen.getByText(/只展示当前绑定 Skill 已授权/)).toBeInTheDocument();
    expect(screen.queryByText("rss.fetch")).not.toBeInTheDocument();
  });

  it("adds a visual resource query before model steps and saves its filters", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editable = {
      ...workflow,
      steps: [
        { id: "writer", type: "model" as const, agent_id: 5 },
        {
          id: "result",
          type: "output" as const,
          output_pointer: "/steps/writer",
        },
      ],
    };
    const agent = { id: 5, name: "Editor", enabled: true };
    render(
      <WorkflowWorkspace
        workflows={[editable]}
        runs={[]}
        metrics={[]}
        agents={[agent] as never[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "添加动态资源筛选" }));
    await user.selectOptions(screen.getByLabelText("状态"), "published");
    await user.clear(screen.getByLabelText("距今未更新天数"));
    await user.type(screen.getByLabelText("距今未更新天数"), "180");
    await user.selectOptions(screen.getByLabelText("空结果策略"), "fail");
    await user.click(screen.getByRole("button", { name: "保存 Workflow" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.scope_policy.mode).toBe("strict");
    expect(saved.resource_query_empty_policy).toBe("fail");
    expect(saved.steps[0]).toMatchObject({
      id: "select_resources",
      type: "resource_query",
      resource_type: "post",
      max_items: 20,
      filter: { status: "published", updated_before_days: 180 },
    });
    expect(saved.steps[1]).toMatchObject({
      id: "writer",
      type: "model",
      agent_id: 5,
    });
  });

  it("configures partial failures and preserves nested Agent bindings", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editable = {
      ...workflow,
      steps: [
        {
          id: "select",
          type: "resource_query" as const,
          resource_type: "post" as const,
          filter: {},
          max_items: 3,
        },
        {
          id: "batch",
          type: "for_each" as const,
          collection_pointer: "/steps/select",
          max_items: 3,
          steps: [{ id: "writer", type: "model" as const, agent_id: 5 }],
        },
        {
          id: "result",
          type: "output" as const,
          output_pointer: "/steps/batch",
        },
      ],
    };
    const agent = { id: 5, name: "Editor", enabled: true };
    render(
      <WorkflowWorkspace
        workflows={[editable]}
        runs={[]}
        metrics={[]}
        agents={[agent] as never[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByLabelText("批量绑定 Agent")).toHaveValue("5");
    await user.selectOptions(screen.getByLabelText("单项失败处理"), "continue");
    await user.click(screen.getByRole("button", { name: "保存 Workflow" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.steps[1]).toMatchObject({
      type: "for_each",
      continue_on_error: true,
      steps: [{ type: "model", agent_id: 5 }],
    });
  });

  it("shows only discovery tools authorized by the bound Agent skill", async () => {
    const user = userEvent.setup();
    const editable = {
      ...workflow,
      steps: [
        { id: "writer", type: "model" as const, agent_id: 5 },
        {
          id: "result",
          type: "output" as const,
          output_pointer: "/steps/writer",
        },
      ],
    };
    const agent = {
      id: 5,
      name: "Editor",
      enabled: true,
      skill: { capabilities: ["content.find_related"] },
    };
    render(
      <WorkflowWorkspace
        workflows={[editable]}
        runs={[]}
        metrics={[]}
        agents={[agent] as never[]}
        tools={[
          {
            name: "content.find_related",
            description: "Find related content",
            risk_level: "read",
            surfaces: ["agent"],
            parameters: {},
            scope: { discovery: true },
          },
          {
            name: "content.propose_update",
            description: "Propose update",
            risk_level: "propose",
            surfaces: ["agent"],
            parameters: {},
            scope: { discovery: true },
          },
          {
            name: "content.search_knowledge",
            description: "Search knowledge",
            risk_level: "read",
            surfaces: ["agent"],
            parameters: {},
            scope: { discovery: true },
          },
        ]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByText("content.find_related")).toBeInTheDocument();
    expect(
      screen.queryByText("content.propose_update"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("content.search_knowledge"),
    ).not.toBeInTheDocument();
  });

  it("builds a resource input field without JSON editing", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowWorkspace
        workflows={[]}
        runs={[]}
        metrics={[]}
        agents={[]}
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "创建 Workflow" }));
    await user.click(screen.getByRole("button", { name: "添加字段" }));
    const selects = screen.getAllByLabelText("资源类型");
    await user.selectOptions(selects[0], "post");
    expect(screen.getByLabelText("最少数量")).toBeInTheDocument();
    expect(screen.getByLabelText("最多数量")).toBeInTheDocument();
  });

  it("applies the generated cron schedule and preserves multi-Agent bindings", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const generatedWorkflow = {
      ...workflow,
      id: 0,
      name: "每日 Golang 技术文章",
      enabled: false,
      cron_expression: "0 4 * * *",
      input_schema: { type: "object", additionalProperties: false },
      steps: [
        { id: "write", type: "model" as const, agent_id: 5 },
        { id: "cover", type: "model" as const, agent_id: 6 },
        {
          id: "result",
          type: "output" as const,
          output_pointer: "/steps/cover",
        },
      ],
    };
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/ai-workflows/draft")
        return Promise.resolve(
          Response.json({
            data: {
              workflow: generatedWorkflow,
              provider: "Writer",
              model: "writer-model",
              selected_agents: [
                { id: 5, name: "Writer Agent" },
                { id: 6, name: "Image Agent" },
              ],
              readiness: { message: "ready" },
            },
          }),
        );
      return Promise.resolve(Response.json({ data: {} }));
    });

    render(
      <WorkflowWorkspace
        workflows={[]}
        runs={[]}
        metrics={[]}
        agents={
          [
            { id: 5, name: "Writer Agent", enabled: true },
            { id: 6, name: "Image Agent", enabled: true },
          ] as never[]
        }
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "创建 Workflow" }));
    await user.type(
      screen.getByPlaceholderText(/描述目标、频率/),
      "每天凌晨4点生成 Golang 文章和封面",
    );
    await user.click(
      screen.getByRole("button", { name: "用 AI 生成 Workflow 草案" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Cron 执行计划")).toHaveValue("0 4 * * *"),
    );
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/api/admin/ai-automation-plans/draft",
      expect.anything(),
    );
    expect(screen.getByLabelText("批量绑定 Agent")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "保存 Workflow" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      cron_expression: "0 4 * * *",
      timezone: "Asia/Shanghai",
      steps: [
        { id: "write", agent_id: 5 },
        { id: "cover", agent_id: 6 },
        { id: "result" },
      ],
    });
  });

  it("keeps enum and default constraints synchronized when saving a visual schema field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const imageBrief = {
      ...workflow,
      steps: [
        {
          id: "writer",
          type: "model" as const,
          agent_id: 5,
          input_pointer: "/input",
        },
        {
          id: "result",
          type: "output" as const,
          output_pointer: "/steps/writer",
        },
      ],
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["post_ids", "format"],
        properties: {
          format: {
            type: "string",
            enum: ["image_brief"],
            default: "image_brief",
          },
          post_ids: {
            type: "array",
            items: { type: "integer" },
            minItems: 1,
            maxItems: 20,
            "x-gouno-resource": "post",
            "x-gouno-widget": "entity-multi-select",
          },
        },
      },
    };
    render(
      <WorkflowWorkspace
        workflows={[imageBrief]}
        runs={[]}
        metrics={[]}
        agents={
          [{ id: 5, name: "Image brief agent", enabled: true }] as never[]
        }
        locale="zh"
        onMutate={vi.fn()}
        onRun={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByLabelText("枚举值")).toHaveValue("image_brief");
    expect(screen.getByLabelText("默认值")).toHaveValue("image_brief");
    await user.click(screen.getByRole("button", { name: "保存 Workflow" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(
      onSave.mock.calls[0][0].input_schema.properties.format,
    ).toMatchObject({
      type: "string",
      enum: ["image_brief"],
      default: "image_brief",
    });
  });
});
