import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

function renderPublicShell(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ThemeProvider brand="blog" storageKey="gouno-blog:theme">
        <PublicShell>{children}</PublicShell>
      </ThemeProvider>
    </MemoryRouter>,
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

  it("renders the Showcase brand lockup with configured title and fallback icon", async () => {
    renderPublicShell(<h1>Public content</h1>);

    const headerBrand = await screen.findByRole("link", {
      name: "Configured Site 首页",
    });
    expect(
      headerBrand.querySelector('img[src="/favicon.svg"]'),
    ).toBeInTheDocument();
    expect(headerBrand).toHaveClass("inline-flex", "items-center", "gap-2");

    const footerBrand = screen.getByRole("link", { name: "Configured Site" });
    expect(
      footerBrand.querySelector('img[src="/favicon.svg"]'),
    ).toBeInTheDocument();
  });

  it("renders configured or fallback footer meta text", async () => {
    const currentYear = new Date().getFullYear();
    const { container } = renderPublicShell(<h1>Public content</h1>);

    const footer = container.querySelector(".footer-meta");
    expect(footer).toBeInTheDocument();
    expect(footer?.textContent).toContain(`© ${currentYear}`);
  });
});
