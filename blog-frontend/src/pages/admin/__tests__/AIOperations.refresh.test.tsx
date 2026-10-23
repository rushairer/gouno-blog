import { StrictMode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { I18nProvider } from "../../../i18n";
import AIOperations from "../AIOperations";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return {
    apiFetch,
    gossoClient: createMockGossoClient(apiFetch),
    canManageBlog: () => true,
    isLoggedIn: () => true,
    redirectToAuthorize: vi.fn(),
  };
});

function run(id: number) {
  return {
    id,
    agent_id: 1,
    status: "succeeded",
    trigger_type: "manual",
    provider: "test",
    model: "test-model",
    input_tokens: 1,
    output_tokens: 2,
    created_at: "2026-10-23T00:00:00Z",
    started_at: "2026-10-23T00:00:00Z",
    output_summary: `Snapshot ${id}`,
  };
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type Pending = ReturnType<typeof deferredResponse>;
let pending: Pending[];
let deletion: Pending | null;
let deleteCount: number;

async function finish(index: number, id: number) {
  await waitFor(() => expect(pending[index]).toBeDefined());
  await act(async () => {
    pending[index].resolve(Response.json({ data: { list: [run(id)] } }));
  });
}

async function fail(index: number, message: string) {
  await waitFor(() => expect(pending[index]).toBeDefined());
  await act(async () => {
    pending[index].reject(new Error(message));
  });
}

async function refresh() {
  const button = screen.getByRole("button", { name: "Refresh", exact: true });
  await userEvent.setup().click(button);
}

function row(id: number) {
  return screen.queryByRole("button", { name: `Inspect Run #${id}` });
}

async function expectRow(id: number) {
  await waitFor(() => expect(row(id)).toBeInTheDocument());
}

function renderConsole(strict = false) {
  const app = (
    <I18nProvider>
      <MemoryRouter>
        <AIOperations />
      </MemoryRouter>
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{app}</StrictMode> : app);
}

async function startDeletion() {
  const user = userEvent.setup();
  const button = await screen.findByRole("button", {
    name: "Delete record",
    exact: true,
  });
  await user.click(button);
  const modal = screen.getByRole("dialog", {
    name: "Delete Agent run record",
  });
  await user.click(
    within(modal).getByRole("button", { name: "Delete record", exact: true }),
  );
  await waitFor(() => expect(deleteCount).toBe(1));
}

async function finishDeletion() {
  await act(async () => {
    deletion!.resolve(Response.json({ data: null }));
  });
}

describe("AI Operations refresh ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pending = [];
    deletion = null;
    deleteCount = 0;
    localStorage.setItem("gouno-blog:locale", "en");
    window.history.replaceState(
      null,
      "",
      "/admin/ai-ops?tab=records&record=agent",
    );
    vi.mocked(apiFetch).mockImplementation(async (input, init) => {
      const url = input.toString();
      const detail = /^\/api\/admin\/agent-runs\/(\d+)$/.exec(url);
      if (detail && init?.method === "DELETE") {
        deleteCount += 1;
        deletion = deferredResponse();
        return deletion.promise;
      }
      if (init?.method && init.method !== "GET") {
        throw new Error(`Unexpected mutation: ${init.method} ${url}`);
      }
      if (detail) {
        return Response.json({
          data: { run: run(Number(detail[1])), tool_calls: [] },
        });
      }
      if (url.startsWith("/api/admin/agent-runs")) {
        const item = deferredResponse();
        pending.push(item);
        return item.promise;
      }
      if (url.startsWith("/api/admin/agent-approvals"))
        return Response.json({ data: { list: [] } });
      if (url === "/api/admin/ai-workflow-metrics")
        return Response.json({ data: { workflows: [] } });
      return Response.json({ data: [] });
    });
  });

  it("lets a newer refresh finish initial loading without the old read", async () => {
    renderConsole();
    await refresh();
    await finish(1, 2);
    await expectRow(2);
    await finish(0, 1);
    expect(row(2)).toBeInTheDocument();
    expect(row(1)).not.toBeInTheDocument();
  });

  it("keeps the newer snapshot when two manual refreshes finish in reverse", async () => {
    renderConsole();
    await finish(0, 1);
    await expectRow(1);
    await refresh();
    await refresh();
    await finish(2, 3);
    await expectRow(3);
    await finish(1, 2);
    expect(row(3)).toBeInTheDocument();
    expect(row(2)).not.toBeInTheDocument();
  });

  it("does not report an obsolete refresh error over a newer snapshot", async () => {
    renderConsole();
    await finish(0, 1);
    await expectRow(1);
    await refresh();
    await refresh();
    await finish(2, 3);
    await fail(1, "Obsolete refresh failure");
    expect(row(3)).toBeInTheDocument();
    expect(screen.queryByText("Obsolete refresh failure")).toBeNull();
  });

  it("does not accept an older success after the current refresh fails", async () => {
    renderConsole();
    await finish(0, 1);
    await expectRow(1);
    await refresh();
    await refresh();
    await fail(2, "Current refresh failure");
    expect(screen.getByText("Current refresh failure")).toBeInTheDocument();
    await finish(1, 2);
    expect(row(1)).toBeInTheDocument();
    expect(row(2)).not.toBeInTheDocument();
  });

  it("keeps the current failure visible and permits an explicit read retry", async () => {
    renderConsole();
    await finish(0, 1);
    await expectRow(1);
    await refresh();
    await fail(1, "Current refresh unavailable");
    const notice = screen.getByText("Current refresh unavailable");
    expect(notice).toBeInTheDocument();
    expect(pending).toHaveLength(2);
    await refresh();
    await finish(2, 3);
    await expectRow(3);
    expect(pending).toHaveLength(3);
    expect(deleteCount).toBe(0);
  });

  it("fences the retired StrictMode setup even when it completes last", async () => {
    renderConsole(true);
    await waitFor(() => expect(pending).toHaveLength(2));
    await finish(1, 2);
    await expectRow(2);
    await finish(0, 1);
    expect(row(2)).toBeInTheDocument();
    expect(row(1)).not.toBeInTheDocument();
  });

  it("does not start a retired page refresh after a delayed deletion", async () => {
    const view = renderConsole();
    await finish(0, 1);
    await expectRow(1);
    await startDeletion();
    view.unmount();
    await finishDeletion();
    expect(pending).toHaveLength(1);
    expect(deleteCount).toBe(1);
  });

  it("never replays a successful deletion when its read refresh fails", async () => {
    renderConsole();
    await finish(0, 1);
    await expectRow(1);
    await startDeletion();
    await finishDeletion();
    await fail(1, "Post-deletion refresh unavailable");
    const notice = screen.getByText("Post-deletion refresh unavailable");
    expect(notice).toBeInTheDocument();
    await refresh();
    await finish(2, 2);
    await expectRow(2);
    expect(deleteCount).toBe(1);
  });
});
