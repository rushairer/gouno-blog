import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { I18nProvider } from "../../../i18n";
import AISettings from "../AISettings";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return {
    apiFetch,
    gossoClient: createMockGossoClient(apiFetch),
    canManageBlog: vi.fn(() => true),
    isLoggedIn: vi.fn(() => true),
    redirectToAuthorize: vi.fn(),
  };
});

const provider = {
  id: 1,
  name: "OpenAI",
  provider_type: "openai",
  base_url: "https://api.openai.com",
  model: "gpt-5-mini",
  api_key_last4: "1234",
  has_api_key: true,
  enabled: true,
  request_timeout_seconds: 60,
  max_output_tokens: 2000,
  created_at: "2026-07-30T00:00:00Z",
  updated_at: "2026-07-30T00:00:00Z",
};

const skill = {
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
  system_key: "weekly_operations",
  input_schema: { type: "object" },
  allowed_triggers: ["manual"],
  created_at: "2026-07-30T00:00:00Z",
  updated_at: "2026-07-30T00:00:00Z",
};

const agent = {
  id: 1,
  name: "Weekly Operations",
  description: "Weekly report",
  provider_profile_id: 1,
  skill_version_id: 1,
  skill,
  enabled: true,
  trigger_type: "manual",
  timezone: "Asia/Shanghai",
  daily_run_limit: 10,
  monthly_token_budget: 1000000,
  created_at: "2026-07-30T00:00:00Z",
  updated_at: "2026-07-30T00:00:00Z",
};

function responseFor(url: string) {
  if (url === "/api/admin/provider-profiles") return [provider];
  if (url === "/api/admin/embedding-profiles") return [];
  if (url === "/api/admin/ai-index/status")
    return { queued: 0, failed: 0, chunks: 0 };
  if (url === "/api/admin/agents") return [agent];
  if (url.startsWith("/api/admin/agent-runs")) return { list: [] };
  if (url === "/api/admin/agent-tools")
    return [
      {
        name: "content.list_posts",
        description: "List posts",
        parameters: {},
        risk_level: "read",
      },
    ];
  if (url === "/api/admin/agent-skills") return [skill];
  throw new Error(`unexpected URL: ${url}`);
}

function renderSettings() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AISettings />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("AISettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/admin/ai-settings");
    localStorage.setItem("gouno-blog:locale", "en");
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));
    vi.mocked(apiFetch).mockImplementation(async (input) =>
      Response.json({ data: responseFor(input.toString()) }),
    );
  });

  it("loads stable configuration dependencies without operations feeds", async () => {
    renderSettings();
    expect(
      await screen.findByRole("button", { name: "Create Agent" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(7));
    expect(screen.getAllByText("Weekly Operations").length).toBeGreaterThan(0);

    const urls = vi
      .mocked(apiFetch)
      .mock.calls.map(([input]) => input.toString());
    expect(urls).not.toContain(
      "/api/admin/agent-approvals?status=pending&pageSize=100",
    );
    expect(urls).not.toContain("/api/admin/ai-workflows");
    expect(urls).not.toContain("/api/admin/ai-suggestions?status=all");
  });

  it("copies a Skill from the dedicated Skills settings section", async () => {
    const user = userEvent.setup();
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue("Weekly Operations Copy");
    vi.mocked(apiFetch).mockImplementation(async (input, init) => {
      const url = input.toString();
      if (url === "/api/admin/agent-skills/1/copy" && init?.method === "POST") {
        return Response.json({
          data: { id: 2, name: "Weekly Operations Copy" },
        });
      }
      return Response.json({ data: responseFor(url) });
    });

    renderSettings();
    await user.click(await screen.findByRole("tab", { name: "Skills" }));
    await user.click(screen.getByRole("button", { name: "Copy Skill" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/admin/agent-skills/1/copy",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Weekly Operations Copy" }),
        }),
      ),
    );
    prompt.mockRestore();
  });

  it("opens Provider management from the dedicated settings section", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole("tab", { name: "Providers" }));
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Provider" }));
    expect(
      screen.getByRole("heading", { name: "Add Provider" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toBeRequired();
  });

  it("closes a section-scoped editor when changing AI Settings sections", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("button", { name: "Create Agent" });
    await user.click(screen.getByRole("button", { name: "Create Agent" }));
    expect(
      screen.getByRole("heading", { name: "Create Agent" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(
      screen.queryByRole("heading", { name: "Create Agent" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Skills" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("uses tab-owned navigation and avoids duplicate section headings", async () => {
    const user = userEvent.setup();
    renderSettings();
    const agentsTab = await screen.findByRole("tab", { name: "Agents" });
    expect(agentsTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("heading", { name: "Agents" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tools" }));
    expect(screen.getByRole("tab", { name: "Tools" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("heading", { name: "Tools" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("content.list_posts")).toBeInTheDocument();
    expect(window.location.search).toBe("?section=tools");
  });

  it("uses canonical protected Provider and Knowledge surfaces", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("tab", { name: "Providers" }));
    expect(screen.getByRole("tab", { name: "Providers" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("heading", { name: "Providers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Default Purposes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Knowledge index" }));
    expect(
      screen.getByRole("tab", { name: "Knowledge index" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("heading", { name: "Knowledge index" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Chunks")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(window.location.search).toBe("?section=knowledge");
  });
});
