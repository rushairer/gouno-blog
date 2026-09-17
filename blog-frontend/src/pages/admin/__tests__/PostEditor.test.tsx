import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GossoProvider } from "@gosso/client/react";

import PostEditor from "../PostEditor";
import { agentApi } from "../../../api/agent";
import { postsApi } from "../../../api/posts";
import { siteApi } from "../../../api/site";
import type { Post } from "../../../types/blog";
import { AppFeedbackProvider } from "../../../components/feedback/AppFeedbackProvider";

const snapshot = {
  loggedIn: true,
  isAdmin: true,
  profile: {
    sub: "admin",
    roles: ["admin"],
    permissions: ["content.manage", "ai.manage"],
  },
};
const mockClient = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
} as any;

function renderEditor(path = "/admin/posts/new", client = mockClient) {
  return render(
    <GossoProvider client={client}>
      <AppFeedbackProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/posts/new" element={<PostEditor />} />
            <Route path="/admin/posts/:id/edit" element={<PostEditor />} />
          </Routes>
        </MemoryRouter>
      </AppFeedbackProvider>
    </GossoProvider>,
  );
}

const draftPost: Post = {
  id: 5,
  title: "每日AI资讯：2026年8月21日",
  slug: "daily-ai-news-2026-08-21",
  summary: "AI 资讯摘要",
  content: "## 今日要点\n\nAI 运营生成的正文内容。",
  tags: ["AI", "资讯"],
  status: "draft",
  created_at: new Date().toISOString(),
};

describe("PostEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(siteApi, "getCategories").mockResolvedValue([
      { id: 9, name: "AI 工程", slug: "ai-engineering" },
    ]);
    vi.spyOn(postsApi, "getVersions").mockResolvedValue([]);
  });

  it("loads draft posts through the admin API and renders the canonical MarkdownEditor", async () => {
    const getAdminPostSpy = vi
      .spyOn(postsApi, "getAdminPost")
      .mockResolvedValue(draftPost);
    const getPostSpy = vi.spyOn(postsApi, "getPost");

    renderEditor("/admin/posts/5/edit");

    await waitFor(() => expect(getAdminPostSpy).toHaveBeenCalledWith("5"));
    expect(getPostSpy).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue(draftPost.title)).toBeInTheDocument();
    expect(screen.getByDisplayValue("AI 资讯摘要")).toBeInTheDocument();
    expect(screen.getByDisplayValue("daily-ai-news-2026-08-21")).toBeInTheDocument();
    expect(screen.getByLabelText("文章正文 Markdown")).toHaveValue(draftPost.content);
    expect(screen.getByRole("button", { name: "编辑" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "预览" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "AI 写作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插图" })).toBeInTheDocument();
  });

  it("keeps unsaved input mounted when the responsive layout changes", async () => {
    const user = userEvent.setup();
    renderEditor();

    const title = await screen.findByPlaceholderText("写一个清晰、具体的标题");
    const body = screen.getByLabelText("文章正文 Markdown");
    await user.type(title, "不会丢失的草稿");
    await user.type(body, "```ts\nconst wide = true;\n```");

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    fireEvent(window, new Event("resize"));

    expect(title).toHaveValue("不会丢失的草稿");
    expect(body).toHaveValue("```ts\nconst wide = true;\n```");
    expect(screen.getByText("有未保存的更改")).toBeInTheDocument();
  });

  it("uses AISuggestionPicker and makes regenerate issue a new AI request", async () => {
    const user = userEvent.setup();
    const assistSpy = vi
      .spyOn(agentApi, "getDraftAssist")
      .mockResolvedValueOnce({ suggestions: ["标题候选 A", "标题候选 B"] })
      .mockResolvedValueOnce({ suggestions: ["重新生成的标题"] });
    renderEditor();

    await user.type(await screen.findByLabelText("文章正文 Markdown"), "先写一点正文");
    await user.click(screen.getByRole("button", { name: "AI 生成标题候选" }));
    expect(await screen.findByRole("radio", { name: "标题候选 A" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "重新生成 AI 建议" }));
    expect(await screen.findByRole("radio", { name: "重新生成的标题" })).toBeChecked();
    expect(assistSpy).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "使用所选" }));
    expect(screen.getByLabelText("标题")).toHaveValue("重新生成的标题");
  });

  it("reviews SEO suggestions and applies only checked fields", async () => {
    const user = userEvent.setup();
    vi.spyOn(postsApi, "getAdminPost").mockResolvedValue(draftPost);
    vi.spyOn(agentApi, "getDraftAssist").mockResolvedValue({
      suggestions: [],
      metadata: {
        slug: "reviewed-slug",
        seo_title: "Reviewed SEO title",
        seo_description: "Reviewed SEO description",
      },
    });
    renderEditor("/admin/posts/5/edit");

    await screen.findByDisplayValue(draftPost.title);
    await user.click(screen.getByRole("button", { name: "AI 优化路径与 SEO" }));
    await screen.findByRole("checkbox", { name: "应用 SEO 描述 建议" });
    await user.click(screen.getByRole("checkbox", { name: "应用 SEO 描述 建议" }));
    await user.click(screen.getByRole("button", { name: "应用 2 项建议" }));

    expect(screen.getByLabelText("访问路径 (Slug)")).toHaveValue("reviewed-slug");
    expect(screen.getByLabelText("SEO 标题")).toHaveValue("Reviewed SEO title");
    expect(screen.getByLabelText("SEO 描述")).toHaveValue("");
  });

  it("only accepts existing categories and additively merges reviewed tag suggestions", async () => {
    const user = userEvent.setup();
    vi.spyOn(postsApi, "getAdminPost").mockResolvedValue(draftPost);
    vi.spyOn(agentApi, "getDraftAssist").mockResolvedValue({
      suggestions: [],
      metadata: { category: "AI 工程", tags: ["AI", "Agent", "治理"] },
    });
    renderEditor("/admin/posts/5/edit");

    await screen.findByDisplayValue(draftPost.title);
    await user.click(screen.getByRole("button", { name: "AI 推荐分类与标签" }));
    await screen.findByRole("checkbox", { name: "应用 分类 建议" });
    await user.click(screen.getByRole("button", { name: "应用 2 项建议" }));

    expect(screen.getByRole("combobox", { name: "分类" })).toHaveValue("9");
    expect(screen.getByLabelText("标签")).toHaveValue("AI, 资讯, Agent, 治理");
  });

  it("saves a draft without changing the existing create payload contract", async () => {
    const user = userEvent.setup();
    const createPostSpy = vi.spyOn(postsApi, "createPost").mockResolvedValue({
      ...draftPost,
      title: "新草稿",
      content: "草稿正文",
    });
    renderEditor();

    await user.type(await screen.findByPlaceholderText("写一个清晰、具体的标题"), "新草稿");
    await user.type(screen.getByLabelText("文章正文 Markdown"), "草稿正文");
    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() =>
      expect(createPostSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: "新草稿", content: "草稿正文", status: "draft", tags: [] }),
      ),
    );
    expect(await screen.findByText("草稿已保存。")).toBeInTheDocument();
  });

  it("publishes with the selected status and exposes save conflicts", async () => {
    const user = userEvent.setup();
    vi.spyOn(postsApi, "getAdminPost").mockResolvedValue(draftPost);
    const updatePostSpy = vi
      .spyOn(postsApi, "updatePost")
      .mockRejectedValue(new Error("内容已被其他编辑者更新（409 冲突）"));
    renderEditor("/admin/posts/5/edit");

    await screen.findByDisplayValue(draftPost.title);
    await user.click(screen.getByRole("combobox", { name: "状态" }));
    await user.click(screen.getByRole("option", { name: "立即发布" }));
    await user.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() =>
      expect(updatePostSpy).toHaveBeenCalledWith(5, expect.objectContaining({ status: "published" })),
    );
    expect(await screen.findAllByText("内容已被其他编辑者更新（409 冲突）")).not.toHaveLength(0);
    expect(screen.getByText("文章已有新版本")).toBeInTheDocument();
  });

  it("restores a selected history version after confirmation", async () => {
    const user = userEvent.setup();
    const version = {
      ...draftPost,
      id: 42,
      post_id: 5,
      title: "历史标题",
      content: "历史正文",
    };
    vi.spyOn(postsApi, "getAdminPost").mockResolvedValue(draftPost);
    vi.spyOn(postsApi, "getVersions").mockResolvedValue([version]);
    const restoreSpy = vi.spyOn(postsApi, "restoreVersion").mockResolvedValue(version);
    renderEditor("/admin/posts/5/edit");

    await user.click(await screen.findByRole("tab", { name: /历史 1/ }));
    await user.click(screen.getByRole("button", { name: /历史标题.*历史版本/ }));
    await user.click(screen.getByRole("button", { name: "恢复版本" }));

    await waitFor(() => expect(restoreSpy).toHaveBeenCalledWith(5, 42));
    expect(await screen.findByDisplayValue("历史标题")).toBeInTheDocument();
    expect(await screen.findByText("已成功恢复历史版本。")).toBeInTheDocument();
  });

  it("renders wide preview content in internal scroll containers", async () => {
    const user = userEvent.setup();
    vi.spyOn(postsApi, "getAdminPost").mockResolvedValue({
      ...draftPost,
      content:
        "```ts\nconst veryWideValue = 'abcdefghijklmnopqrstuvwxyz';\n```\n\n| A | B |\n| - | - |\n| one | two |",
    });
    const { container } = renderEditor("/admin/posts/5/edit");

    await screen.findByDisplayValue(draftPost.title);
    await user.click(screen.getByRole("button", { name: "预览" }));

    expect(container.querySelector(".editor-preview pre")).toHaveClass("overflow-auto");
    const previewTable = container.querySelector(".editor-preview table");
    expect(previewTable).toHaveClass("min-w-[36rem]");
    expect(previewTable?.parentElement).toHaveClass("overflow-x-auto");
  });

  it("keeps another author's post read-only for content authors", async () => {
    const authorSnapshot = {
      loggedIn: true,
      isAdmin: true,
      profile: {
        sub: "author",
        roles: ["author"],
        permissions: ["content.author"],
        principal: { id: 7 },
      },
    };
    const authorClient = {
      subscribe: () => () => {},
      getSnapshot: () => authorSnapshot,
    } as any;
    vi.spyOn(postsApi, "getAdminPost").mockResolvedValue({
      ...draftPost,
      created_by_principal_id: 8,
    });
    renderEditor("/admin/posts/5/edit", authorClient);

    expect(await screen.findByText(/只读模式/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(draftPost.title)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "保存草稿" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI 写作" })).not.toBeInTheDocument();
  });
});
