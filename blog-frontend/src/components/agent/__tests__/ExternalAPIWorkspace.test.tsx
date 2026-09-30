import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExternalAPIAccessWorkspaceGate,
  ExternalAPIWorkspace,
} from "../ExternalAPIWorkspace";

const mocks = vi.hoisted(() => ({
  listCapabilities: vi.fn(),
  listClients: vi.fn(),
  listAudits: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  rotateClientKey: vi.fn(),
  revokeClient: vi.fn(),
  sudoActive: false,
}));

vi.mock("../../../api/externalCapability", () => ({
  externalCapabilityApi: {
    listCapabilities: mocks.listCapabilities,
    listClients: mocks.listClients,
    listAudits: mocks.listAudits,
    createClient: mocks.createClient,
    updateClient: mocks.updateClient,
    rotateClientKey: mocks.rotateClientKey,
    revokeClient: mocks.revokeClient,
  },
}));

vi.mock("../../../hooks/useSudoMode", () => ({
  useSudoMode: () => ({
    isSudoActive: mocks.sudoActive,
    isSudoExpiring: false,
    remainingMs: mocks.sudoActive ? 600_000 : 0,
    remainingMinutes: mocks.sudoActive ? 10 : 0,
    activating: false,
    activateSudo: vi.fn().mockResolvedValue(false),
    recordSudoSuccess: vi.fn(),
    clearSudo: vi.fn(),
  }),
}));

const capabilities = [
  {
    name: "content.list_published_posts",
    description: "List published posts.",
    description_zh: "列出已发布文章。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read" as const,
  },
  {
    name: "content.search_knowledge",
    description: "Search indexed published content.",
    description_zh: "检索已发布知识索引。",
    parameters: {},
    surfaces: ["external"],
    risk_level: "read" as const,
  },
];

const clients = [
  {
    id: 91,
    name: "Editorial Reporting SDK",
    key_prefix: "gouno_live_A7k3Q2p9",
    capabilities: ["content.list_published_posts"],
    enabled: true,
    rate_limit_per_minute: 120,
    expires_at: "2026-12-31T15:59:00Z",
    last_used_at: "2026-09-28T05:42:00Z",
    revoked_at: null,
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  },
];

const audits = [
  {
    id: 701,
    client_id: 91,
    request_id: "request-701",
    capability: "content.list_published_posts",
    result: "success" as const,
    status_code: 200,
    source_ip: "203.0.113.7",
    input_digest: "a".repeat(64),
    duration_ms: 42,
    created_at: "2026-09-28T05:42:18Z",
  },
];

function seedReads() {
  mocks.listCapabilities.mockResolvedValue(capabilities);
  mocks.listClients.mockResolvedValue(clients);
  mocks.listAudits.mockResolvedValue(audits);
}

describe("ExternalAPIWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sudoActive = false;
    seedReads();
  });

  it("does not mount or fetch sensitive API Access data while sudo is locked", async () => {
    render(<ExternalAPIAccessWorkspaceGate locale="zh" />);

    expect(
      screen.getByText("高权限操作需要身份验证"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "API Clients" }),
    ).not.toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.listCapabilities).not.toHaveBeenCalled();
    expect(mocks.listClients).not.toHaveBeenCalled();
    expect(mocks.listAudits).not.toHaveBeenCalled();
  });

  it("renders the real server invocation contract and external read catalog", async () => {
    render(<ExternalAPIWorkspace locale="zh" />);

    expect(
      await screen.findByRole("heading", { name: "调用协议" }),
    ).toBeInTheDocument();
    expect(screen.getByText("GET /api/external/v1/capabilities")).toBeInTheDocument();
    expect(
      screen.getByText("POST /api/external/v1/capabilities/{name}/invoke"),
    ).toBeInTheDocument();
    expect(screen.getByText("Editorial Reporting SDK")).toBeInTheDocument();
    expect(screen.getAllByText("content.list_published_posts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("read-only").length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue(/gouno_live_.+secret/i)).not.toBeInTheDocument();
  });

  it("creates a scoped client and shows the returned key exactly as one-time state", async () => {
    mocks.createClient.mockResolvedValue({
      client: {
        ...clients[0],
        id: 93,
        name: "Partner Reporting Worker",
        key_prefix: "gouno_live_demo_93",
      },
      api_key: "gouno_live_secret-once-93",
    });
    const user = userEvent.setup();
    render(<ExternalAPIWorkspace locale="zh" />);

    await screen.findByText("Editorial Reporting SDK");
    await user.click(screen.getByRole("button", { name: "创建 API Client" }));

    const drawer = screen.getByRole("dialog", { name: "创建 API Client" });
    await user.type(
      within(drawer).getByLabelText(/Client 名称/),
      "Partner Reporting Worker",
    );
    await user.click(
      within(drawer).getByText("content.list_published_posts").closest("label")!
        .querySelector("input")!,
    );
    await user.click(
      within(drawer).getByRole("button", { name: "保存 API Client" }),
    );

    await waitFor(() =>
      expect(mocks.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Partner Reporting Worker",
          capabilities: ["content.list_published_posts"],
          enabled: true,
          rate_limit_per_minute: 60,
        }),
      ),
    );

    const keyDialog = await screen.findByRole("dialog", {
      name: "保存一次性 API Key",
    });
    expect(
      (within(keyDialog).getByLabelText("一次性 API Key") as HTMLInputElement)
        .value,
    ).toBe("gouno_live_secret-once-93");
    expect(within(keyDialog).getByText("不要放入浏览器代码")).toBeInTheDocument();
  });

  it("requires destructive confirmation before revoking a client", async () => {
    mocks.revokeClient.mockResolvedValue({ revoked: true });
    const user = userEvent.setup();
    render(<ExternalAPIWorkspace locale="zh" />);

    await screen.findByText("Editorial Reporting SDK");
    await user.click(
      screen.getByRole("button", { name: "撤销 Editorial Reporting SDK" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "确认撤销 API Client",
    });
    expect(mocks.revokeClient).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "撤销并使 Key 失效" }),
    );
    await waitFor(() => expect(mocks.revokeClient).toHaveBeenCalledWith(91));
  });
});
