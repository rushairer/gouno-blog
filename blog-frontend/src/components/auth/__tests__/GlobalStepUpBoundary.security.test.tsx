import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalStepUpBoundary } from "../GlobalStepUpBoundary";
import {
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_MFA_REQUIRED_EVENT,
} from "../../../mfa";
import { stepUpMfa } from "../../../auth";
import { AppFeedbackProvider } from "../../feedback/AppFeedbackProvider";

vi.mock("../../../auth", () => ({
  stepUpMfa: vi.fn(),
  getGossoAdminURL: () => "https://auth.example.com",
}));

const safeMessage = "操作未完成，请稍后重试。";
const secret = "SYNTHETIC_PRIVATE_DIAGNOSTIC";

function boundary(enabled = true) {
  return (
    <AppFeedbackProvider>
      {enabled ? (
        <GlobalStepUpBoundary>
          <div>AI console</div>
        </GlobalStepUpBoundary>
      ) : (
        <div>Boundary unmounted</div>
      )}
    </AppFeedbackProvider>
  );
}

function dispatchRejection(reason: unknown): Event {
  // Dispatch an event, not a rejected Promise that the test runner handles.
  const event = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(event, "reason", { value: reason });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const privateReasons: Array<[string, unknown]> = [
  ["Error", new Error(secret)],
  ["string", `Provider failed: ${secret}`],
  ["URL", `https://private.example/path?token=${secret}`],
  ["wrapped Error", new Error(secret, { cause: new Error(secret) })],
  ["message-shaped object", { message: secret }],
  ["empty string", ""],
  ["null", null],
  ["undefined", undefined],
  ["number", 42],
  ["symbol", Symbol(secret)],
];

describe("GlobalStepUpBoundary confidentiality and lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/admin/ai-settings");
  });

  it.each(privateReasons)(
    "does not render private diagnostics from %s rejections",
    async (_kind, reason) => {
      render(boundary());
      const event = dispatchRejection(reason);

      expect(await screen.findByText(safeMessage)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(secret);
      expect(event.defaultPrevented).toBe(true);
      expect(screen.queryByText("高权限安全验证")).not.toBeInTheDocument();
      expect(stepUpMfa).not.toHaveBeenCalled();
    },
  );

  it("does not invoke an unknown object's coercion hooks", async () => {
    const toString = vi.fn(() => {
      throw new Error(secret);
    });
    render(boundary());
    const event = dispatchRejection({ toString });

    expect(await screen.findByText(safeMessage)).toBeInTheDocument();
    expect(toString).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(document.body.textContent).not.toContain(secret);
  });

  it("does not derive an MFA prompt from object coercion", async () => {
    const toString = vi.fn(() => "recent_mfa_required");
    render(boundary());
    dispatchRejection({ toString });

    expect(await screen.findByText(safeMessage)).toBeInTheDocument();
    expect(toString).not.toHaveBeenCalled();
    expect(screen.queryByText("高权限安全验证")).not.toBeInTheDocument();
  });

  it("contains a throwing Error message getter", async () => {
    const reason = new Error();
    Object.defineProperty(reason, "message", {
      get() {
        throw new Error(secret);
      },
    });
    render(boundary());
    const event = dispatchRejection(reason);

    expect(await screen.findByText(safeMessage)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
    expect(event.defaultPrevented).toBe(true);
  });

  it("contains a revoked proxy", async () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    render(boundary());
    const event = dispatchRejection(proxy);

    expect(await screen.findByText(safeMessage)).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ["Error", new Error(`recent_mfa_required: ${secret}`)],
    ["string", `recent_mfa_required: ${secret}`],
  ])(
    "keeps the existing %s MFA prompt separate from error feedback",
    async (_kind, reason) => {
      render(boundary());
      const event = dispatchRejection(reason);

      expect(await screen.findByText("高权限安全验证")).toBeInTheDocument();
      expect(screen.queryByText(safeMessage)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain(secret);
      expect(event.defaultPrevented).toBe(true);
      expect(stepUpMfa).not.toHaveBeenCalled();

      act(() => {
        window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));
      });
      await waitFor(() => {
        expect(screen.queryByText("高权限安全验证")).not.toBeInTheDocument();
      });
    },
  );

  it("preserves one-shot navigation state under StrictMode", async () => {
    const historyState = { editor: "draft-7" };
    window.history.replaceState(
      historyState,
      "",
      "/admin/ai-settings?section=api-access&mfa_step_up=1#details",
    );
    const view = render(boundary(), { wrapper: StrictMode });

    expect(await screen.findByText("高权限安全验证")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/ai-settings");
    expect(window.location.search).toBe("?section=api-access");
    expect(window.location.hash).toBe("#details");
    expect(window.history.state).toEqual(historyState);

    act(() => {
      window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));
    });
    view.rerender(boundary());
    await waitFor(() => {
      expect(screen.queryByText("高权限安全验证")).not.toBeInTheDocument();
    });
  });

  it.each(["", "0", "true"])(
    "does not open the modal for a non-triggering flag %s",
    (flag) => {
      window.history.replaceState({}, "", `/admin?mfa_step_up=${flag}`);
      render(boundary());

      expect(screen.queryByText("高权限安全验证")).not.toBeInTheDocument();
      expect(window.location.search).toBe(`?mfa_step_up=${flag}`);
    },
  );

  it("keeps one listener across StrictMode and rerenders", async () => {
    const view = render(boundary(), { wrapper: StrictMode });
    view.rerender(boundary());
    dispatchRejection(new Error(secret));

    expect(await screen.findAllByText(safeMessage)).toHaveLength(1);
    expect(document.body.textContent).not.toContain(secret);
  });

  it("removes its listener when only the boundary unmounts", () => {
    const view = render(boundary());
    view.rerender(boundary(false));
    const event = dispatchRejection(new Error(secret));

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByText(safeMessage)).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT));
      window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));
    });
    expect(screen.queryByText("高权限安全验证")).not.toBeInTheDocument();
  });
});
