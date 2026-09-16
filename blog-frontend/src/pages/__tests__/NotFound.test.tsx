import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NotFound from "../NotFound";
import { I18nProvider } from "../../i18n";

function renderWithProviders() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/missing-page"]}>
        <NotFound />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("NotFound Page", () => {
  it("uses the canonical Showcase result surface and navigation actions", () => {
    renderWithProviders();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAttribute("data-slot", "result-title");
    expect(heading.closest('[data-slot="card"]')).toHaveClass("max-w-[760px]");

    expect(screen.getByRole("link", { name: /首页|home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: /浏览文章|browse articles/i }),
    ).toHaveAttribute("href", "/articles");
    expect(
      screen.getByRole("link", { name: /搜索内容|search content/i }),
    ).toHaveAttribute("href", "/search");
    expect(
      screen.getByRole("button", { name: /返回|back/i }),
    ).toBeInTheDocument();
  });

  it("does not duplicate the global public search form inside the result card", () => {
    renderWithProviders();

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /搜索内容|search content/i }),
    ).toHaveAttribute("href", "/search");
  });
});
