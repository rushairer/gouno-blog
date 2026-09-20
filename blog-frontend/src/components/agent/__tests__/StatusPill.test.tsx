import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskPill, StatusPill } from "../StatusPill";

describe("StatusPill", () => {
  it("maps real tool risk semantics onto canonical Showcase risk colors", () => {
    const { rerender } = render(<RiskPill risk="read" locale="zh" />);

    expect(screen.getByText("只读").parentElement).toHaveClass(
      "bg-success-subtle",
      "text-success",
    );

    rerender(<RiskPill risk="propose" locale="zh" />);
    expect(screen.getByText("需审批").parentElement).toHaveClass(
      "bg-warning-subtle",
      "text-warning",
    );

    rerender(<RiskPill risk="write" locale="zh" />);
    expect(screen.getByText("写入").parentElement).toHaveClass(
      "bg-danger-subtle",
      "text-destructive",
    );
  });

  it("localizes the workflow continuation status in both supported locales", () => {
    const { rerender } = render(
      <StatusPill status="waiting_for_user" locale="zh" />,
    );

    expect(screen.getByText("等待你处理").parentElement).toHaveClass(
      "status-pill--waiting_for_user",
    );

    rerender(<StatusPill status="waiting_for_user" locale="en" />);

    expect(screen.getByText("Waiting for you").parentElement).toHaveClass(
      "status-pill--waiting_for_user",
    );
  });
});
