import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DashboardTemplate,
  EditorWorkspaceTemplate,
  ListPageTemplate,
} from "./pro";

describe("Gouno Pro page templates", () => {
  it("renders dashboard chrome and state controls", () => {
    render(
      <DashboardTemplate
        title="Dashboard"
        stateControls={<button>状态</button>}
      >
        <div>指标内容</div>
      </DashboardTemplate>,
    );
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "状态" })).toBeTruthy();
    expect(screen.getByText("指标内容")).toBeTruthy();
  });

  it("renders list page action and content without forcing a panel", () => {
    render(
      <ListPageTemplate
        title="Posts"
        action={<button>新建</button>}
        panel={false}
      >
        <div>列表内容</div>
      </ListPageTemplate>,
    );
    expect(screen.getByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建" })).toBeTruthy();
    expect(screen.getByText("列表内容")).toBeTruthy();
  });

  it("renders editor outline, canvas and inspector regions", () => {
    render(
      <EditorWorkspaceTemplate
        outline={<div>大纲</div>}
        canvas={<div>画布</div>}
        inspector={<div>Inspector</div>}
      />,
    );
    expect(screen.getByText("大纲")).toBeTruthy();
    expect(screen.getByText("画布")).toBeTruthy();
    expect(screen.getByText("Inspector")).toBeTruthy();
  });
});
