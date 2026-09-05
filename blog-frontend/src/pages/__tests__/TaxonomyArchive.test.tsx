import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import Archive from "../Archive";
import Categories from "../Categories";
import Tags from "../Tags";

const renderPage = (page: React.ReactElement) =>
  render(
    <I18nProvider>
      <MemoryRouter>{page}</MemoryRouter>
    </I18nProvider>,
  );

describe("public taxonomy and archive pages", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders category descriptions, counts, and links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: [
              {
                id: 1,
                name: "Engineering",
                slug: "engineering",
                description: "Build notes",
                post_count: 3,
              },
              { id: 2, name: "Other", slug: "other", post_count: 0 },
            ],
          }),
        ),
      ),
    );
    renderPage(<Categories />);
    expect(
      await screen.findByRole("heading", { name: "Engineering" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Build notes")).toBeInTheDocument();
    expect(
      screen.getByText("Explore all articles and practices under this topic."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Engineering/ })).toHaveAttribute(
      "href",
      "/categories/engineering",
    );
  });
  it("renders an empty category state after an API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    renderPage(<Categories />);
    expect(
      await screen.findByText(
        "Category schema is ready. New categories will appear here.",
      ),
    ).toBeInTheDocument();
  });
  it("counts tags and renders the empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        input.toString().includes("/api/tags")
          ? Promise.resolve(Response.json({ data: ["go", "rust"] }))
          : Promise.resolve(
              Response.json({
                data: {
                  list: [
                    {
                      id: 1,
                      slug: "one",
                      title: "One",
                      tags: ["go"],
                      created_at: "2026-01-01",
                    },
                  ],
                },
              }),
            ),
      ),
    );
    renderPage(<Tags />);
    expect(await screen.findByText("go")).toBeInTheDocument();
    expect(screen.getByText(/1 篇|1 post/)).toBeInTheDocument();
    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ data: [] }))),
    );
    renderPage(<Tags />);
    expect(
      await screen.findByText("No articles associated with tags yet."),
    ).toBeInTheDocument();
  });
  it("renders archive groups and the empty archive state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: {
              list: [
                {
                  id: 1,
                  slug: "first",
                  title: "First",
                  tags: ["go", "web"],
                  published_at: "2026-01-02",
                  created_at: "2026-01-01",
                },
                {
                  id: 2,
                  slug: "draft-date",
                  title: "Draft Date",
                  tags: [],
                  created_at: "2025-12-01",
                },
              ],
            },
          }),
        ),
      ),
    );
    renderPage(<Archive />);
    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /First/ })).toHaveAttribute(
      "href",
      "/articles/first",
    );
    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ data: { list: [] } }))),
    );
    renderPage(<Archive />);
    expect(
      await screen.findByText("No articles available for archiving yet."),
    ).toBeInTheDocument();
  });
});
