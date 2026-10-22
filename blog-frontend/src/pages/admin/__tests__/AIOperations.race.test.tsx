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

async function select(id: number) {
  const button = await screen.findByRole("button", {
    name: `Inspect Run #${id}`,
  });
  await userEvent.setup().click(button);
}

function heading(id: number) {
  return screen.queryByRole("heading", { name: new RegExp(`Run #${id}`) });
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

  it("keeps the latest selection when the initial request finishes last", async () => {
    renderConsole();
    const first = await request(1);
    await select(2);
    await finish(await request(2), 2, "Current detail");
    await waitFor(() => expect(heading(2)).toBeInTheDocument());
    await finish(first, 1, "Obsolete detail");
    expect(heading(2)).toBeInTheDocument();
    expect(heading(1)).not.toBeInTheDocument();
  });

  it("ignores failure from an obsolete selection", async () => {
    renderConsole();
    const first = await request(1);
    await select(2);
    await finish(await request(2), 2, "Current detail");
    await fail(first, "Obsolete detail failure");
    const notice = screen.queryByText("Obsolete detail failure");
    expect(notice).not.toBeInTheDocument();
    expect(heading(2)).toBeInTheDocument();
  });

  it("allows explicit retry after the current request fails", async () => {
    renderConsole();
    await fail(await request(1), "Current detail unavailable");
    const notice = await screen.findByText("Current detail unavailable");
    expect(notice).toBeInTheDocument();
    await select(1);
    await finish(await request(1, 1), 1, "Explicit retry result");
    await waitFor(() => expect(heading(1)).toBeInTheDocument());
    expect(pending.get(1)).toHaveLength(2);
  });

  it("fences URL-only lookup against later list selection", async () => {
    window.history.replaceState(
      null,
      "",
      "/admin/ai-ops?tab=records&record=agent&run=99",
    );
    renderConsole();
    const deepLink = await request(99);
    await select(2);
    await finish(await request(2), 2, "Current detail");
    await finish(deepLink, 99, "Obsolete URL detail");
    expect(heading(2)).toBeInTheDocument();
    expect(heading(99)).not.toBeInTheDocument();
  });

  it("ignores pending failures after switching record type", async () => {
    renderConsole();
    const first = await request(1);
    const button = screen.getByRole("button", { name: "Workflow tasks" });
    await userEvent.setup().click(button);
    await fail(first, "Inactive Agent failure");
    expect(screen.queryByText("Inactive Agent failure")).toBeNull();
    expect(heading(1)).not.toBeInTheDocument();
  });

  it("ignores pending failures after leaving the run center", async () => {
    renderConsole();
    const first = await request(1);
    const tab = screen.getByRole("tab", { name: "Overview" });
    await userEvent.setup().click(tab);
    await fail(first, "Inactive tab failure");
    expect(screen.queryByText("Inactive tab failure")).toBeNull();
  });

  it("retains working initial selection under StrictMode", async () => {
    renderConsole(true);
    await request(1);
    for (const item of pending.get(1)!) {
      await finish(item, 1, "StrictMode detail");
    }
    await waitFor(() => expect(heading(1)).toBeInTheDocument());
  });
});
