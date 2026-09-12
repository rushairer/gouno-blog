import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { WorkflowLauncher } from "../WorkflowLauncher";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

const workflow = {
  id: 38,
  name: "生成封面/文配图（手选）",
  description: "为所选文章生成图片候选。",
  enabled: true,
  timezone: "Asia/Shanghai",
  current_version: 1,
  version_id: 38,
  input_schema: {
    type: "object",
    required: ["format", "post_ids"],
    properties: {
      format: {
        type: "string",
        title: "图片任务",
        enum: ["image_brief"],
        default: "image_brief",
      },
      post_ids: {
        type: "array",
        title: "文章",
        items: { type: "integer" },
        "x-gouno-resource": "post",
      },
    },
  },
  steps: [],
  created_at: "2026-08-16T00:00:00Z",
  updated_at: "2026-08-16T00:00:00Z",
};

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function resourceResponse(label: string) {
  return jsonResponse({
    list: [
      {
        type: "post",
        key: "17",
        label,
        version_token: "v1",
        metadata: {},
      },
    ],
    total: 1,
    unavailable_keys: [],
  });
}

describe("WorkflowLauncher", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("uses the canonical Showcase modal composition and locks source-page scope", async () => {
    const longTitle =
      "AI 每日资讯：Gemini 3.7 Flash 发布、GPT-5.6 提速 14 倍、SpaceX 完成收购 Cursor";
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (String(path) === "/api/admin/ai-workflows")
        return jsonResponse([workflow]);
      if (String(path).startsWith("/api/admin/ai-resources/post?"))
        return resourceResponse(longTitle);
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    render(
      <WorkflowLauncher
        open
        resourceType="post"
        resourceKeys={[17]}
        title="将所选文章交给 AI"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "将所选文章交给 AI" });
    expect(dialog).not.toHaveClass("workflow-launcher-modal");
    expect(dialog.querySelector(".workflow-launcher__body")).toBeNull();
    expect(dialog.querySelector(".workflow-launcher__footer")).toBeNull();

    expect(
      await within(dialog).findByRole("combobox", { name: "Workflow" }),
    ).toBeInTheDocument();
    expect(await within(dialog).findByText(longTitle)).toBeInTheDocument();
    expect(
      within(dialog).getByText("范围来自当前页面选择，启动后不可在此修改"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: `移除 ${longTitle}` }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "关闭" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "运行" })).toBeEnabled();

    await waitFor(() => {
      expect(
        vi
          .mocked(apiFetch)
          .mock.calls.some(
            ([path]) =>
              String(path) === "/api/admin/ai-resources/post?key=17",
          ),
      ).toBe(true);
    });
  });

  it("renders the Showcase warning state when no compatible workflow exists", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (String(path) === "/api/admin/ai-workflows") return jsonResponse([]);
      if (String(path).startsWith("/api/admin/ai-resources/post?"))
        return resourceResponse("测试文章");
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    render(
      <WorkflowLauncher
        open
        resourceType="post"
        resourceKeys={[17]}
        title="将所选文章交给 AI"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "将所选文章交给 AI" });
    expect(
      await within(dialog).findByText("没有兼容 Workflow"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /真实产品只显示 input schema 声明了当前资源类型/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "运行" })).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "关闭" }),
    ).toBeInTheDocument();
  });
});
