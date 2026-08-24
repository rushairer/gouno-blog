import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import ArticleIndex from "../ArticleIndex";

const posts = [
  {
    id: 1,
    title: "Article With Cover",
    slug: "article-with-cover",
    summary: "Summary 1",
    cover_url: "/media/cover1.jpg",
    cover_alt: "Alt 1",
    tags: ["architecture"],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    title: "Article Without Cover",
    slug: "article-without-cover",
    summary: "Summary 2",
    tags: ["design"],
    created_at: "2026-01-02T00:00:00Z",
  },
];

function renderArticleIndex() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ArticleIndex />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("ArticleIndex", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders article list and displays cover image when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/api/tags"))
          return Response.json({ data: ["architecture", "design"] });
        return Response.json({
          data: { list: posts, total: 2, page: 1, pageSize: 10 },
        });
      }),
    );

    renderArticleIndex();

    expect(
      await screen.findByRole("heading", { name: "全部文章" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Article With Cover")).toBeInTheDocument();
    expect(screen.getByText("Article Without Cover")).toBeInTheDocument();

    const img = screen.getByAltText("Alt 1");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/media/cover1.jpg");
  });
});
