import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n";
import { MarkdownRenderer } from "../MarkdownRenderer";

function renderMarkdown(content: string) {
  return render(
    <I18nProvider>
      <MarkdownRenderer content={content} />
    </I18nProvider>,
  );
}

describe("MarkdownRenderer URL policy", () => {
  it("removes executable and data URLs from links and images", () => {
    renderMarkdown(
      "[unsafe](javascript:alert(1)) ![unsafe](data:text/html,<script>alert(1)</script>)",
    );

    expect(screen.getByText("unsafe").closest("a")).not.toHaveAttribute(
      "href",
      "javascript:alert(1)",
    );
    expect(screen.getByRole("img")).not.toHaveAttribute(
      "src",
      expect.stringContaining("data:"),
    );
  });

  it("keeps relative and explicitly supported external URLs", () => {
    renderMarkdown(
      "[relative](/articles/example) [external](https://example.com) ![image](https://example.com/image.png)",
    );

    expect(screen.getByRole("link", { name: "relative" })).toHaveAttribute(
      "href",
      "/articles/example",
    );
    expect(screen.getByRole("link", { name: "external" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/image.png",
    );
  });
});
