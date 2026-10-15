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

  it("saves the latest committed value after rerender and follows the active draft key", () => {
    type Draft = { title: string; api_key: string };
    const initial: Draft = { title: "Before edit", api_key: "initial-secret" };
    const changed: Draft = { title: "Latest edit", api_key: "updated-secret" };
    const { rerender, result } = renderHook(
      ({ draftKey, value }: { draftKey: string; value: Draft }) =>
        useFormDraft(draftKey, value, undefined, { autoRestore: false }),
      { initialProps: { draftKey: "provider-one", value: initial } },
    );

    act(() => window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT)));
    expect(getFormDraft("provider-one")).toEqual(initial);

    rerender({ draftKey: "provider-one", value: changed });
    act(() => window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT)));
    expect(getFormDraft("provider-one")).toEqual(changed);

    const second: Draft = { title: "Other provider", api_key: "second-secret" };
    rerender({ draftKey: "provider-two", value: second });
    act(() => window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT)));

    expect(getFormDraft("provider-one")).toEqual(changed);
    expect(getFormDraft("provider-two")).toEqual(second);

    act(() => result.current.saveDraft({ title: "Explicit", api_key: "manual" }));
    expect(getFormDraft("provider-two")).toEqual({
      title: "Explicit",
      api_key: "manual",
    });
    clearFormDraft("provider-two");
    expect(getFormDraft("provider-two")).toBeNull();
  });

  it("never snapshots a disabled editor during Step-Up or manual save", () => {
    const current = { title: "Private unsaved input" };
    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useFormDraft("disabled-credential", current, undefined, {
          enabled,
          autoRestore: false,
        }),
      { initialProps: { enabled: false } },
    );
    act(() => {
      result.current.saveDraft();
      window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT));
    });
    expect(getFormDraft("disabled-credential")).toBeNull();

    rerender({ enabled: true });
    act(() => window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT)));
    expect(getFormDraft("disabled-credential")).toEqual(current);

    clearFormDraft("disabled-credential");
    rerender({ enabled: false });
    act(() => window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT)));
    expect(getFormDraft("disabled-credential")).toBeNull();
  });

});
