import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { WorkflowRunRecords } from "../WorkflowRunRecords";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

const workflow = {
  id: 4,
  name: "AI 每日资讯",
  description: "Daily AI news",
  enabled: true,
  timezone: "Asia/Shanghai",
  current_version: 2,
  version_id: 8,
  input_schema: { type: "object" },
  steps: [],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const failedRun = {
  id: 6,
  workflow_id: 4,
  workflow_version_id: 8,
  dry_run: false,
  status: "failed",
  input: { trigger: "manual" },
  error_code: "provider_timeout",
  error_message: "Provider timeout",
  input_tokens: 120,
  output_tokens: 340,
  started_at: "2026-08-01T01:00:00Z",
  finished_at: "2026-08-01T01:00:02Z",
  created_at: "2026-08-01T01:00:00Z",
};

const latestRun = {
  ...failedRun,
  id: 7,
  status: "succeeded",
  error_code: undefined,
  error_message: undefined,
  input_tokens: 200,
  output_tokens: 500,
  started_at: "2026-08-01T02:00:00Z",
  finished_at: "2026-08-01T02:00:03Z",
  created_at: "2026-08-01T02:00:00Z",
};

describe("WorkflowRunRecords canonical master detail", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/ai-ops?tab=records");
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async () =>
      Response.json({ data: [] }),
    );
  });

  it("keeps the Run rail visible while switching execution evidence", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkflowRunRecords
        locale="zh"
        workflows={[workflow]}
        runs={[failedRun, latestRun]}
        formatDateTime={(value) => value}
      />,
    );

    const rail = screen.getByRole("complementary", { name: "Workflow Runs" });
    const frame = container.querySelector('[data-slot="ops-master-detail"]');
    expect(frame).toHaveAttribute("data-mobile-pane", "master");
    expect(new URL(window.location.href).searchParams.get("run")).toBeNull();
    const latestButton = within(rail).getByRole("button", { name: /Run #7/ });
    const failedButton = within(rail).getByRole("button", { name: /Run #6/ });

    await waitFor(() => expect(latestButton).not.toBeDisabled());
    await user.click(latestButton);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "Run #7 · AI 每日资讯" }),
      ).toBeInTheDocument(),
    );
    expect(latestButton).toHaveAttribute("aria-pressed", "true");
    expect(frame).toHaveAttribute("data-mobile-pane", "detail");
    expect(new URL(window.location.href).searchParams.get("run")).toBe("7");

    await user.click(screen.getByRole("button", { name: "返回运行列表" }));
    expect(frame).toHaveAttribute("data-mobile-pane", "master");
    expect(new URL(window.location.href).searchParams.get("run")).toBeNull();

    await user.click(failedButton);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "Run #6 · AI 每日资讯" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("complementary", { name: "Workflow Runs" }),
    ).toBeInTheDocument();
    expect(failedButton).toHaveAttribute("aria-pressed", "true");
    expect(latestButton).toHaveAttribute("aria-pressed", "false");
    expect(frame).toHaveAttribute("data-mobile-pane", "detail");
    expect(new URL(window.location.href).searchParams.get("run")).toBe("6");
    expect(screen.getByRole("alert")).toHaveTextContent("Provider timeout");
  });
});
