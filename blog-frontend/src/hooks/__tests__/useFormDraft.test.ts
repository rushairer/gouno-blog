import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import {
  useFormDraft,
  getFormDraft,
  setFormDraft,
  clearFormDraft,
} from "../useFormDraft";
import { STEP_UP_MFA_REQUIRED_EVENT } from "../../mfa";

describe("useFormDraft", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists draft on save and restores it correctly", () => {
    let state = { title: "Draft Post", content: "Hello world" };
    const setState = (
      next: typeof state | ((prev: typeof state) => typeof state),
    ) => {
      state = typeof next === "function" ? next(state) : next;
    };

    const { result } = renderHook(() =>
      useFormDraft("test-post", state, setState, { autoRestore: false }),
    );

    act(() => {
      result.current.saveDraft();
    });

    expect(getFormDraft("test-post")).toEqual({
      title: "Draft Post",
      content: "Hello world",
    });

    // Mutate state locally
    state = { title: "Modified Title", content: "New Content" };

    // Restore manually
    act(() => {
      const restored = result.current.restoreDraft();
      expect(restored).toEqual({ title: "Draft Post", content: "Hello world" });
    });

    expect(state).toEqual({ title: "Draft Post", content: "Hello world" });

    act(() => {
      result.current.clearDraft();
    });

    expect(getFormDraft("test-post")).toBeNull();
  });

  it("automatically snapshots current form state when STEP_UP_MFA_REQUIRED_EVENT fires", () => {
    const state = { setting: "value123" };
    renderHook(() =>
      useFormDraft("auto-save-key", state, undefined, { autoRestore: false }),
    );

    expect(getFormDraft("auto-save-key")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT));
    });

    expect(getFormDraft("auto-save-key")).toEqual({ setting: "value123" });
  });

  it("auto-restores draft upon hook mount when a draft exists in sessionStorage", () => {
    setFormDraft("mount-key", {
      name: "Restored AI Provider",
      model: "gpt-4o",
    });

    let state = { name: "Default", model: "default-model" };
    const setState = (
      next: typeof state | ((prev: typeof state) => typeof state),
    ) => {
      state = typeof next === "function" ? next(state) : next;
    };

    renderHook(() =>
      useFormDraft("mount-key", state, setState, { autoRestore: true }),
    );

    expect(state).toEqual({ name: "Restored AI Provider", model: "gpt-4o" });
  });
});
