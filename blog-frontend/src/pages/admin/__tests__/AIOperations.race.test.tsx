import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
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

function run(id: number, summary = `List summary ${id}`) {
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
    output_summary: summary,
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
let pending: Map<number, Pending[]>;

async function request(id: number, index = 0) {
  await waitFor(() => expect(pending.get(id)?.[index]).toBeDefined());
  return pending.get(id)![index];
}

async function finish(item: Pending, id: number, summary: string) {
  await act(async () => {
    item.resolve(
      Response.json({ data: { run: run(id, summary), tool_calls: [] } }),
    );
  });
}

async function fail(item: Pending, message: string) {
  await act(async () => {
    item.reject(new Error(message));
  });
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

describe("AI Operations latest Agent detail intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pending = new Map();
    localStorage.setItem("gouno-blog:locale", "en");
    window.history.replaceState(
      null,
      "",
      "/admin/ai-ops?tab=records&record=agent",
    );
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const url = input.toString();
      const detail = /^\/api\/admin\/agent-runs\/(\d+)$/.exec(url);
      if (detail) {
        const id = Number(detail[1]);
        const item = deferredResponse();
        pending.set(id, [...(pending.get(id) || []), item]);
        return item.promise;
      }
      if (url.startsWith("/api/admin/agent-runs"))
        return Response.json({ data: { list: [run(1), run(2)] } });
      if (url.startsWith("/api/admin/agent-approvals"))
        return Response.json({ data: { list: [] } });
      if (url === "/api/admin/ai-workflow-metrics")
        return Response.json({ data: { workflows: [] } });
      return Response.json({ data: [] });
    });
  });

  it("keeps the latest selected detail when the initial request finishes last", async () => {
    const user = userEvent.setup();
    renderConsole();
    const first = await request(1);
    await user.click(
      await screen.findByRole("button", { name: "Inspect Run #2" }),
    );
    const second = await request(2);
    await finish(second, 2, "Current detail");
    expect(
      await screen.findByRole("heading", { name: /Run #2/ }),
    ).toBeInTheDocument();
    await finish(first, 1, "Obsolete detail");
    expect(
      screen.getByRole("heading", { name: /Run #2/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Run #1/ }),
    ).not.toBeInTheDocument();
  });

  it("does not report a failure belonging to an obsolete selection", async () => {
    const user = userEvent.setup();
    renderConsole();
    const first = await request(1);
    await user.click(
      await screen.findByRole("button", { name: "Inspect Run #2" }),
    );
    await finish(await request(2), 2, "Current detail");
    await fail(first, "Obsolete detail failure");
    expect(
      screen.queryByText("Obsolete detail failure"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Run #2/ }),
    ).toBeInTheDocument();
  });

  it("allows the latest failure to be retried by an explicit new selection", async () => {
    const user = userEvent.setup();
    renderConsole();
    const first = await request(1);
    await fail(first, "Current detail unavailable");
    expect(
      await screen.findByText("Current detail unavailable"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect Run #1" }));
    await finish(await request(1, 1), 1, "Explicit retry result");
    expect(
      await screen.findByRole("heading", { name: /Run #1/ }),
    ).toBeInTheDocument();
    expect(pending.get(1)).toHaveLength(2);
  });

  it("fences a URL-only lookup against a subsequent list selection", async () => {
    window.history.replaceState(
      null,
      "",
      "/admin/ai-ops?tab=records&record=agent&run=99",
    );
    const user = userEvent.setup();
    renderConsole();
    const deepLink = await request(99);
    await user.click(
      await screen.findByRole("button", { name: "Inspect Run #2" }),
    );
    await finish(await request(2), 2, "Current detail");
    await finish(deepLink, 99, "Obsolete URL detail");
    expect(
      screen.getByRole("heading", { name: /Run #2/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Run #99/ }),
    ).not.toBeInTheDocument();
  });

  it("does not surface a pending detail failure after switching record type", async () => {
    const user = userEvent.setup();
    renderConsole();
    const first = await request(1);
    await user.click(screen.getByRole("button", { name: "Workflow tasks" }));
    await fail(first, "Inactive Agent failure");
    expect(
      screen.queryByText("Inactive Agent failure"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Run #1/ }),
    ).not.toBeInTheDocument();
  });

  it("does not surface a pending detail failure after leaving the run center", async () => {
    const user = userEvent.setup();
    renderConsole();
    const first = await request(1);
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await fail(first, "Inactive tab failure");
    expect(
      screen.queryByText("Inactive tab failure"),
    ).not.toBeInTheDocument();
  });

  it("retains working initial selection under StrictMode", async () => {
    renderConsole(true);
    await request(1);
    for (const item of pending.get(1)!)
      await finish(item, 1, "StrictMode detail");
    expect(
      await screen.findByRole("heading", { name: /Run #1/ }),
    ).toBeInTheDocument();
  });
});
