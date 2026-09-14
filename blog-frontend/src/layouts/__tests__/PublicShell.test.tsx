import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@gouno/ui/theme";
import PublicShell from "../PublicShell";

vi.mock("../../api/site", () => ({
  siteApi: {
    getSiteSettings: () =>
      Promise.resolve({
        site_title: "Configured Site",
        site_description: "A configured description.",
        rss_url: "/feed.xml",
      }),
  },
}));
vi.mock("../../api/pages", () => ({
  pagesApi: { getNavPages: () => Promise.resolve([]) },
}));

function renderPublicShell(children: React.ReactNode, initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider brand="blog" storageKey="gouno-blog:theme">
        <PublicShell>{children}</PublicShell>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="当前位置">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe("PublicShell theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("restores, exposes, and persists the canonical public theme state", async () => {
    localStorage.setItem("gouno-blog:theme", "dark");
    const user = userEvent.setup();

    renderPublicShell(<h1>Public content</h1>);

    const toggle = screen.getByRole("button", { name: "切换主题" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(toggle);
    await user.click(
      await screen.findByRole("menuitemradio", { name: "浅色" }),
    );

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("gouno-blog:theme")).toBe("light");
  });

  it("renders the Showcase brand lockup with configured title and canonical product mark", async () => {
    renderPublicShell(<h1>Public content</h1>);

    const headerBrand = await screen.findByRole("link", {
      name: "Configured Site 首页",
    });
    const headerMark = headerBrand.querySelector('span[aria-hidden="true"]');
    expect(headerMark).toBeInTheDocument();
    expect(headerMark).toHaveClass(
      "inline-block",
      "shrink-0",
      "bg-current",
      "size-8",
    );
    expect(headerMark?.getAttribute("style")).toContain("mask");
    expect(headerBrand).toHaveClass("inline-flex", "items-center", "gap-2");

    const footerBrand = screen.getByRole("link", { name: "Configured Site" });
    const footerMark = footerBrand.querySelector('span[aria-hidden="true"]');
    expect(footerMark).toBeInTheDocument();
    expect(footerMark).toHaveClass("size-7", "text-primary");
    expect(footerBrand).not.toHaveClass("text-primary");
  });

  it("renders configured or fallback footer meta text", async () => {
    const currentYear = new Date().getFullYear();
    renderPublicShell(<h1>Public content</h1>);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(`© ${currentYear}`);
  });

  it("submits search with Enter and keeps the admin action aligned with header icon controls", async () => {
    const user = userEvent.setup();
    renderPublicShell(<LocationProbe />);

    expect(
      screen.queryByRole("button", { name: /提交.*搜索/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入内容后台" })).toHaveClass(
      "!size-9",
      "!rounded-full",
      "!p-0",
    );

    await user.type(
      screen.getByRole("textbox", { name: "搜索文章" }),
      "OAuth2{Enter}",
    );

    expect(screen.getByRole("status", { name: "当前位置" })).toHaveTextContent(
      "/search?q=OAuth2",
    );
  });

  it.each([
    ["/search?q=ui", "文章"],
    ["/tags/react", "文章"],
    ["/categories/design-systems", "文章"],
    ["/categories", "分类"],
    ["/archive", "归档"],
  ])(
    "matches Showcase active navigation semantics for %s",
    async (initialEntry, activeLabel) => {
      renderPublicShell(<h1>Public content</h1>, initialEntry);
      await screen.findByRole("link", { name: "Configured Site 首页" });

      const mainNavigation = screen.getByRole("navigation", { name: "主导航" });
      const activeLink = within(mainNavigation).getByRole("link", {
        name: activeLabel,
      });
      expect(activeLink).toHaveAttribute("aria-current", "page");

      for (const label of ["文章", "分类", "归档"]) {
        if (label === activeLabel) continue;
        expect(
          within(mainNavigation).getByRole("link", { name: label }),
        ).not.toHaveAttribute("aria-current");
      }
    },
  );
});
