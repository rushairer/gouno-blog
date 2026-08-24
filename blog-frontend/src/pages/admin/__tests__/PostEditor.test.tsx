import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PostEditor from "../PostEditor";
import { ToastProvider } from "../../../components/ui";
import { postsApi } from "../../../api/posts";
import { siteApi } from "../../../api/site";
import * as auth from "../../../auth";
import type { Post } from "../../../types/blog";

describe("PostEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auth, "isLoggedIn").mockReturnValue(true);
    vi.spyOn(auth, "canManageBlog").mockReturnValue(true);
    vi.spyOn(siteApi, "getCategories").mockResolvedValue([]);
    vi.spyOn(postsApi, "getVersions").mockResolvedValue([]);
  });

  it("loads draft posts via getAdminPost and renders fields", async () => {
    const mockDraft: Post = {
      id: 5,
      title: "每日AI资讯：2026年8月21日",
      slug: "daily-ai-news-2026-08-21",
      summary: "AI 资讯摘要",
      content: "AI 运营生成的正文内容。",
      tags: ["AI", "资讯"],
      status: "draft",
      created_at: new Date().toISOString(),
    };

    const getAdminPostSpy = vi
      .spyOn(postsApi, "getAdminPost")
      .mockResolvedValue(mockDraft);
    const getPostSpy = vi.spyOn(postsApi, "getPost");

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/admin/posts/5/edit"]}>
          <Routes>
            <Route path="/admin/posts/:id/edit" element={<PostEditor />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(getAdminPostSpy).toHaveBeenCalledWith("5");
    });

    expect(getPostSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByDisplayValue("每日AI资讯：2026年8月21日"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("AI 资讯摘要")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("daily-ai-news-2026-08-21"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("文章正文 Markdown")).toHaveValue(
      "AI 运营生成的正文内容。",
    );
  });
});
