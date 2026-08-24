import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectorWorkspace } from "../ConnectorWorkspace";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../../../auth", () => ({ apiFetch }));

function response(data: unknown, ok = true) {
  return new Response(JSON.stringify({ data, message: ok ? "" : "failed" }), {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ConnectorWorkspace", () => {
  it("loads sandbox profiles and keeps OAuth, approval and delivery on mock APIs", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/admin/ai-connectors")
        return Promise.resolve(
          response([
            {
              id: 3,
              name: "Newsletter sandbox",
              kind: "newsletter",
              sandbox: true,
              enabled: true,
              config: {},
              has_credential: true,
              credential_last4: "1234",
              created_at: "",
              updated_at: "",
            },
          ]),
        );
      if (path === "/api/admin/ai-connector-outbox")
        return Promise.resolve(
          response([
            {
              id: 9,
              connector_profile_id: 3,
              idempotency_key: "run-1",
              payload: {},
              status: "awaiting_approval",
              attempts: 0,
              created_at: "",
            },
          ]),
        );
      return Promise.resolve(response({ state: "mock-state" }));
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <ConnectorWorkspace
        locale="en"
        readData={async <T,>(res: Response) => (await res.json()).data as T}
        onRefresh={onRefresh}
      />,
    );
    expect(
      (await screen.findAllByText("Newsletter sandbox")).length,
    ).toBeGreaterThan(0);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Start mock OAuth" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/admin/ai-connectors/3/oauth/start",
        { method: "POST" },
      ),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/admin/ai-connector-outbox/9/approve",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
