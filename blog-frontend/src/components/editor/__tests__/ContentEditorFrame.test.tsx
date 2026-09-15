import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Alert } from "@gouno/ui/core";
import { AiSuggestionControl } from "../AiSuggestionControl";
import {
  AiImageGenerationPanel,
  AiWritingPanel,
  ContentEditorFrame,
  EditorCommandActions,
  EditorCommandBar,
} from "../ContentEditorFrame";

describe("editor presentation components", () => {
  it(
    "keeps page feedback outside the editor card and preserves the stable frame",
    () => {
      const { container } = render(
        <ContentEditorFrame className="custom-frame">
          <EditorCommandBar>
            <span>保存状态</span>
            <EditorCommandActions>操作</EditorCommandActions>
          </EditorCommandBar>
          <Alert
            className="editor-page-feedback"
            type="error"
            title="保存失败"
          />
          <main>正文</main>
          <AiWritingPanel>写作</AiWritingPanel>
          <AiImageGenerationPanel>生图</AiImageGenerationPanel>
        </ContentEditorFrame>,
      );

      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveClass("editor-page", "flex", "gap-6");
      expect(wrapper?.children[0]).toHaveClass("editor-page-feedback");
      expect(wrapper?.children[1]).toHaveAttribute("data-slot", "card");

      const card = wrapper?.children[1];
      expect(card).toHaveClass(
        "min-w-0",
        "gap-0",
        "overflow-clip",
        "custom-frame",
      );
      expect(container.querySelector(".editor-commandbar")).toHaveClass(
        "border-b",
        "px-6",
        "py-4",
        "lg:flex-row",
      );
      expect(
        container.querySelector(".editor-command-actions"),
      ).toHaveTextContent("操作");
      expect(container.querySelector(".editor-command-actions")).toHaveClass(
        "flex-wrap",
        "lg:justify-end",
      );
      expect(
        screen.getByRole("region", { name: "AI 写作与润色" }),
      ).toHaveTextContent("写作");
      expect(
        screen.getByRole("region", { name: "AI 文生图插画" }),
      ).toHaveTextContent("生图");
    },
  );

  it("requests and applies an AI suggestion through shared buttons", async () => {
    const user = userEvent.setup();
    const onRequest = vi.fn();
    const onApply = vi.fn();
    render(
      <AiSuggestionControl
        label="生成 Slug"
        candidates={["stable-editor"]}
        open
        mono
        onRequest={onRequest}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "生成 Slug" }));
    const candidate = screen.getByRole("button", {
      name: /stable-editor.*应用/,
    });
    expect(candidate).toHaveClass("editor-ai-candidate");
    expect(
      candidate.querySelector(".editor-ai-candidate__content"),
    ).toBeInTheDocument();
    await user.click(candidate);

    expect(onRequest).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith("stable-editor");
  });

  it("prevents duplicate AI requests while loading", () => {
    render(
      <AiSuggestionControl
        label="生成标题"
        candidates={[]}
        loading
        onRequest={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "正在生成候选…" }),
    ).toBeDisabled();
  });
});
