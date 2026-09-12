import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@gouno/ui/core";
import { AppFeedbackProvider, useAppFeedback } from "../AppFeedbackProvider";

function FeedbackActions() {
  const { notify } = useAppFeedback();
  return (
    <div>
      <Button onClick={() => notify("已保存")}>成功</Button>
      <Button onClick={() => notify("需要确认", "warning", { duration: 0 })}>
        警告
      </Button>
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AppFeedbackProvider", () => {
  it("preserves status/alert semantics and supports manual dismissal", async () => {
    const user = userEvent.setup();
    render(
      <AppFeedbackProvider>
        <FeedbackActions />
      </AppFeedbackProvider>,
    );

    await user.click(screen.getByRole("button", { name: "成功" }));
    await user.click(screen.getByRole("button", { name: "警告" }));

    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(screen.getByRole("alert")).toHaveTextContent("需要确认");

    await user.click(screen.getAllByRole("button", { name: "关闭提示" })[0]);
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
    expect(screen.getByText("需要确认")).toBeInTheDocument();
  });

  it("keeps duration-zero feedback visible while default feedback expires", () => {
    vi.useFakeTimers();
    render(
      <AppFeedbackProvider>
        <FeedbackActions />
      </AppFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "成功" }));
    fireEvent.click(screen.getByRole("button", { name: "警告" }));
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(screen.getByText("需要确认")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
    expect(screen.getByText("需要确认")).toBeInTheDocument();
  });

  it("reuses the outer feedback channel for nested providers", async () => {
    const user = userEvent.setup();
    render(
      <AppFeedbackProvider>
        <AppFeedbackProvider>
          <FeedbackActions />
        </AppFeedbackProvider>
      </AppFeedbackProvider>,
    );

    await user.click(screen.getByRole("button", { name: "成功" }));
    expect(screen.getAllByText("已保存")).toHaveLength(1);
    expect(screen.getAllByLabelText("应用提示")).toHaveLength(1);
  });
});
