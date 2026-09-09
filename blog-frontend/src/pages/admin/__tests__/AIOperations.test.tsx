import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  canManageBlog,
  isLoggedIn,
  redirectToAuthorize,
} from "../../../auth";
import { I18nProvider } from "../../../i18n";
import AIOperations from "../AIOperations";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return {
    apiFetch,
    gossoClient: createMockGossoClient(apiFetch),
    canManageBlog: vi.fn(),
    isLoggedIn: vi.fn(),
    redirectToAuthorize: vi.fn(),
  };
});

const agent = {
  id: 1,
  name: "Weekly Operations",
  description: "Weekly report",
  provider_profile_id: 1,
  skill_version_id: 1,
  skill: {
    id: 1,
    name: "Weekly Operations",
    description: "Weekly report",
    system_prompt: "Report",
    capabilities: ["content.list_posts"],
    execution_mode: "advisory",
    content_publish_mode: "approval",
    max_steps: 6,
    max_input_tokens: 16000,
    max_output_tokens: 2000,
    default_daily_run_limit: 10,
    default_monthly_token_budget: 1000000,
    version: 1,
    version_id: 1,
    input_schema: { type: "object" },
    allowed_triggers: ["manual"],
    created_at: "2026-07-30T00:00:00Z",
    updated_at: "2026-07-30T00:00:00Z",
  },
  enabled: true,
  trigger_type: "manual",
  timezone: "Asia/Shanghai",
  daily_run_limit: 10,
  monthly_token_budget: 1000000,
  created_at: "2026-07-30T00:00:00Z",
  updated_at: "2026-07-30T00:00:00Z",
};

function responseFor(url: string) {
  if (url === "/api/admin/agents") return [agent];
  if (url.startsWith("/api/admin/agent-runs")) return { list: [] };
  if (url.startsWith("/api/admin/agent-approvals")) return { list: [] };
  if (url === "/api/admin/agent-tools")
    return [
      {
        name: "content.list_posts",
        description: "List posts",
        parameters: {},
        risk_level: "read",
      },
    ];
  if (url === "/api/admin/ai-workflows") return [];
  if (url === "/api/admin/ai-workflow-runs") return [];
  if (url === "/api/admin/ai-workflow-metrics") return { workflows: [] };
  if (url === "/api/admin/ai-suggestions?status=all") return [];
  if (url === "/api/admin/ai-candidates") return [];
  if (url === "/api/admin/ai-media-candidates") return [];
  if (url === "/api/admin/ai-editorial-tasks") return [];
  throw new Error(`unexpected URL: ${url}`);
}

function renderConsole() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AIOperations />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("AIOperations", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/ai-ops");
    localStorage.setItem("gouno-blog:locale", "en");
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(canManageBlog).mockReturnValue(true);
    vi.mocked(apiFetch).mockImplementation(async (input) =>
      Response.json({ data: responseFor(input.toString()) }),
    );
  });

  it("loads only operational dependencies and exposes four operational tabs", async () => {
    renderConsole();
    expect(
      await screen.findByRole("heading", {
        name: "Start with what you want to improve",
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(11));

    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /To review/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Automation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Run center" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Advanced settings" }),
    ).not.toBeInTheDocument();

    const urls = vi
      .mocked(apiFetch)
      .mock.calls.map(([input]) => input.toString());
    expect(urls).not.toContain("/api/admin/provider-profiles");
    expect(urls).not.toContain("/api/admin/embedding-profiles");
    expect(urls).not.toContain("/api/admin/ai-index/status");
    expect(urls).not.toContain("/api/admin/agent-skills");
  });

  it("renders a governed content proposal as a readable preview with raw JSON retained for audit", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const url = input.toString();
      if (url.startsWith("/api/admin/agent-approvals"))
        return Response.json({
          data: {
            list: [
              {
                id: 4,
                run_id: 12,
                tool_call_id: 8,
                action_type: "create_draft",
                target_type: "post",
                status: "pending",
                proposed_payload: {
                  title: "AI Daily Briefing",
                  slug: "ai-daily-briefing",
                  summary: "Today's verified AI news.",
                  tags: ["AI", "Daily news"],
                  content: "## Headlines\n\nA readable **Markdown** preview.",
                },
                expires_at: "2026-08-03T00:00:00Z",
                created_at: "2026-08-02T00:00:00Z",
              },
            ],
          },
        });
      return Response.json({ data: responseFor(url) });
    });

    renderConsole();
    await user.click(await screen.findByRole("tab", { name: /To review/ }));
    expect(
      await screen.findByRole("region", { name: "Content proposal preview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "AI Daily Briefing" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Today's verified AI news.")).toBeInTheDocument();
    const technicalDetails = screen
      .getByText("View technical details")
      .closest("details");
    await user.click(screen.getByText("View technical details"));
    expect(technicalDetails).toHaveTextContent('"slug": "ai-daily-briefing"');
  });

  it("keeps a failed approval actionable and retries the same proposal", async () => {
    const user = userEvent.setup();
    const failedApproval = {
      id: 1,
      run_id: 3,
      tool_call_id: 3,
      action_type: "create_draft",
      target_type: "post",
      status: "failed",
      review_note: 'column reference "event_key" is ambiguous',
      proposed_payload: {
        title: "AI Daily News",
        slug: "ai-daily-news",
        content: "# AI Daily News",
      },
      expires_at: "2026-08-20T00:00:00Z",
      created_at: "2026-08-16T00:00:00Z",
    };
    vi.mocked(apiFetch).mockImplementation(async (input, init) => {
      const url = input.toString();
      if (url.startsWith("/api/admin/agent-approvals")) {
        if (
          url === "/api/admin/agent-approvals/1/approve" &&
          init?.method === "POST"
        )
          return Response.json({ data: null });
        return Response.json({ data: { list: [failedApproval] } });
      }
      return Response.json({ data: responseFor(url) });
    });

    renderConsole();
    await user.click(await screen.findByRole("tab", { name: /To review/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'column reference "event_key" is ambiguous',
    );
    await user.click(
      screen.getByRole("button", { name: "Retry approval and execution" }),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/admin/agent-approvals/1/approve",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("redirects legacy Advanced deep links to the dedicated AI Settings route", async () => {
    window.history.replaceState(
      null,
      "",
      "/admin/ai-ops?tab=advanced&section=providers",
    );
    render(
      <I18nProvider>
        <MemoryRouter
          initialEntries={["/admin/ai-ops?tab=advanced&section=providers"]}
        >
          <Routes>
            <Route path="/admin/ai-ops" element={<AIOperations />} />
            <Route
              path="/admin/ai-settings"
              element={<div>AI settings target</div>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByText("AI settings target")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("leaves authorization to the route-level admin boundary", async () => {
    vi.mocked(canManageBlog).mockReturnValue(false);
    renderConsole();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "AI Operations" }),
      ).toBeInTheDocument(),
    );
    expect(redirectToAuthorize).not.toHaveBeenCalled();
  });
});
