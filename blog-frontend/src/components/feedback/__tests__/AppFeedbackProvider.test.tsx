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
  it("delegates rendering and lifecycle to Gouno Notification", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppFeedbackProvider>
        <FeedbackActions />
      </AppFeedbackProvider>,
    );

    await user.click(screen.getByRole("button", { name: "成功" }));
    await user.click(screen.getByRole("button", { name: "警告" }));

    const region = container.querySelector(
      '[data-slot="notification-region"]',
    );
    expect(region).toBeInTheDocument();
    expect(region).toHaveClass(
      "right-4",
      "top-4",
      "z-[100]",
      "w-80",
      "gap-2",
    );
    expect(region).not.toHaveClass("bottom-4");

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("已保存");
    expect(status).toHaveAttribute("data-slot", "notification");
    expect(status).toHaveAttribute("data-type", "success");
    expect(status).toHaveClass("bg-popover", "shadow-overlay");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("需要确认");
    expect(alert).toHaveAttribute("data-type", "warning");
    expect(alert).toHaveAttribute("data-persistent", "true");
    expect(alert).toHaveClass("bg-popover", "shadow-overlay");

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

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText("需要确认")).toBeInTheDocument();
  });

  it("reuses the outer feedback channel for nested providers", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppFeedbackProvider>
        <AppFeedbackProvider>
          <FeedbackActions />
        </AppFeedbackProvider>
      </AppFeedbackProvider>,
    );

    await user.click(screen.getByRole("button", { name: "成功" }));
    expect(screen.getAllByText("已保存")).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-slot="notification-region"]'),
    ).toHaveLength(1);
  });
});
