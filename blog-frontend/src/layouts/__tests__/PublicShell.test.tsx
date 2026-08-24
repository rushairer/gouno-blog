import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("PublicShell theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("restores, exposes, and persists the public theme state", async () => {
    localStorage.setItem("gouno-blog:theme", "dark");
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PublicShell>
          <h1>Public content</h1>
        </PublicShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "切换主题" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("gouno-blog:theme")).toBe("light");
  });

  it("renders configured or fallback footer meta text", async () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(
      <MemoryRouter>
        <PublicShell>
          <h1>Public content</h1>
        </PublicShell>
      </MemoryRouter>,
    );

    const footer = container.querySelector(".footer-meta");
    expect(footer).toBeInTheDocument();
    // Initially renders default fallback or configured settings
    expect(footer?.textContent).toContain(`© ${currentYear}`);
  });
});
