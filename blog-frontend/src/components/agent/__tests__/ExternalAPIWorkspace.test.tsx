import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sudoActive: true,
  getClients: vi.fn(),
  getCapabilities: vi.fn(),
  getAudits: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  rotateClientKey: vi.fn(),
  revokeClient: vi.fn(),
}));

vi.mock("../../../hooks/useSudoMode", () => ({
  useSudoMode: () => ({
    isSudoActive: mocks.sudoActive,
    isSudoExpiring: false,
    remainingMs: mocks.sudoActive ? 600000 : 0,
    remainingMinutes: mocks.sudoActive ? 10 : 0,
    activating: false,
    activateSudo: vi.fn(),
    recordSudoSuccess: vi.fn(),
    clearSudo: vi.fn(),
  }),
}));

vi.mock("../../../api/external-capabilities", () => ({
  externalCapabilityApi: {
    getClients: mocks.getClients,
    getCapabilities: mocks.getCapabilities,
    getAudits: mocks.getAudits,
    createClient: mocks.createClient,
    updateClient: mocks.updateClient,
    rotateClientKey: mocks.rotateClientKey,
    revokeClient: mocks.revokeClient,
  },
}));

import { ExternalAPIWorkspace } from "../ExternalAPIWorkspace";

const client = {
  id: 91,
  name: "Editorial Reporting SDK",
  key_prefix: "gouno_live_A7k3Q2p9",
  capabilities: ["content.list_published_posts"],
  enabled: true,
  rate_limit_per_minute: 120,
  expires_at: null,
  last_used_at: "2026-09-28T13:42:00Z",
  revoked_at: null,
  created_at: "2026-09-28T12:00:00Z",
  updated_at: "2026-09-28T12:00:00Z",
};

const capability = {
  name: "content.list_published_posts",
  description: "List published posts.",
  description_zh: "读取已发布文章。",
  surfaces: ["external"],
  risk_level: "read",
};

describe("ExternalAPIWorkspace", () => {
  beforeEach(() => {
    mocks.sudoActive = true;
    mocks.getClients.mockReset().mockResolvedValue([client]);
    mocks.getCapabilities.mockReset().mockResolvedValue([capability]);
    mocks.getAudits.mockReset().mockResolvedValue([]);
    mocks.createClient.mockReset().mockResolvedValue({
      client: { ...client, id: 92, name: "Partner Worker" },
      api_key: "gouno_live_one-time-secret",
    });
    mocks.updateClient.mockReset();
    mocks.rotateClientKey.mockReset();
    mocks.revokeClient.mockReset().mockResolvedValue({ revoked: true });
  });

  afterEach(cleanup);

  it("does not load protected client or audit data before sudo mode is active", async () => {
    mocks.sudoActive = false;
    render(<ExternalAPIWorkspace locale="zh" formatDateTime={(value) => value} />);

    expect(screen.getByText("高权限操作需要身份验证")).toBeInTheDocument();
    await Promise.resolve();
    expect(mocks.getClients).not.toHaveBeenCalled();
    expect(mocks.getAudits).not.toHaveBeenCalled();
  });

  it("creates a client and exposes the returned key only in the one-time modal", async () => {
    render(<ExternalAPIWorkspace locale="zh" formatDateTime={(value) => value} />);

    await screen.findByText("Editorial Reporting SDK");
    fireEvent.click(screen.getByRole("button", { name: "创建 API Client" }));
    const drawer = screen.getByRole("dialog", { name: "创建 API Client" });
    fireEvent.change(within(drawer).getByLabelText(/Client 名称/), {
      target: { value: "Partner Worker" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "保存 API Client" }));

    await waitFor(() => expect(mocks.createClient).toHaveBeenCalledOnce());
    const keyModal = await screen.findByRole("dialog", { name: "保存一次性 API Key" });
    expect(
      (within(keyModal).getByLabelText("一次性 API Key") as HTMLInputElement).value,
    ).toBe("gouno_live_one-time-secret");
  });

  it("requires destructive confirmation before revoking a client", async () => {
    render(<ExternalAPIWorkspace locale="zh" formatDateTime={(value) => value} />);

    await screen.findByText("Editorial Reporting SDK");
    fireEvent.click(screen.getByRole("button", { name: "撤销 Editorial Reporting SDK" }));
    expect(mocks.revokeClient).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "确认撤销 API Client" });
    fireEvent.click(within(dialog).getByRole("button", { name: "撤销并使 Key 失效" }));

    await waitFor(() => expect(mocks.revokeClient).toHaveBeenCalledWith(91));
  });
});
