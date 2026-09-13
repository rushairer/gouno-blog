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
    expect(heading).toHaveTextContent(/页面未找到|Page Not Found/);
    expect(heading.closest('[data-slot="card"]')).toHaveClass(
      "max-w-[760px]",
    );

    expect(screen.getByRole("link", { name: /首页|Home/ })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: /全部文章|All Articles/ }),
    ).toHaveAttribute("href", "/articles");
    expect(
      screen.getByRole("link", { name: /搜索文章|Search Posts/ }),
    ).toHaveAttribute("href", "/search");
    expect(screen.getByRole("button", { name: /返回|Back/ })).toBeInTheDocument();
  });

  it("does not duplicate the global public search form inside the result card", () => {
    renderWithProviders();

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /搜索文章|Search Posts/ }),
    ).toHaveAttribute("href", "/search");
  });
});
