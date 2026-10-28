import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GossoProvider } from "@gosso/client/react";

import PageEditor from "../PageEditor";
import { agentApi } from "../../../api/agent";
import { pagesApi } from "../../../api/pages";
import type { CustomPage } from "../../../types/blog";
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

function renderEditor(path = "/admin/pages/new", client = mockClient) {
  return render(
    <GossoProvider client={client}>
      <AppFeedbackProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/pages/new" element={<PageEditor />} />
            <Route path="/admin/pages/:id/edit" element={<PageEditor />} />
          </Routes>
        </MemoryRouter>
      </AppFeedbackProvider>
    </GossoProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const draftPage: CustomPage = {
  id: 3,
  title: "关于我们",
  slug: "about-us",
  summary: "本站与团队介绍页面",
  content: "## 关于我们\n\n欢迎来到我们的博客。",
  template: "about",
  status: "draft",
  allow_comments: false,
  show_in_nav: true,
  sort_order: 10,
  seo_title: "关于我们 - 深度技术博客",
  seo_description: "了解博主的背景与愿景。",
  created_at: new Date().toISOString(),
};

describe("PageEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the page and uses DocumentEditorShell + MarkdownEditor without a post navigator", async () => {
    const getAdminPageSpy = vi
      .spyOn(pagesApi, "getAdminPage")
      .mockResolvedValue(draftPage);
    renderEditor("/admin/pages/3/edit");

    await waitFor(() => expect(getAdminPageSpy).toHaveBeenCalledWith("3"));
    expect(await screen.findByDisplayValue("关于我们")).toBeInTheDocument();
    expect(screen.getByDisplayValue("本站与团队介绍页面")).toBeInTheDocument();
    expect(screen.getByDisplayValue("about-us")).toBeInTheDocument();
    expect(screen.getByLabelText("单页正文 Markdown")).toHaveValue(
      draftPage.content,
    );
    expect(screen.getByRole("button", { name: "编辑" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "预览" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "AI 写作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插图" })).toBeInTheDocument();
    expect(screen.queryByLabelText("文档导航视图")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Slug 候选/ }),
    ).not.toBeInTheDocument();
  });

  it("uses AISuggestionPicker for title and regenerates through the real AI endpoint", async () => {
    const user = userEvent.setup();
    const assistSpy = vi
      .spyOn(agentApi, "getDraftAssist")
      .mockResolvedValueOnce({ suggestions: ["关于 Gouno", "团队与项目"] })
      .mockResolvedValueOnce({ suggestions: ["重新生成的单页标题"] });
    renderEditor();

    await user.type(
      await screen.findByLabelText("单页正文 Markdown"),
      "页面正文",
    );
    await user.click(screen.getByRole("button", { name: "AI 生成标题候选" }));
    expect(
      await screen.findByRole("radio", { name: "关于 Gouno" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "重新生成 AI 建议" }));
    expect(
      await screen.findByRole("radio", { name: "重新生成的单页标题" }),
    ).toBeChecked();
    expect(assistSpy).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "使用所选" }));
    expect(screen.getByLabelText("标题")).toHaveValue("重新生成的单页标题");
  });

  it("reviews slug and SEO together instead of exposing a standalone slug AI action", async () => {
    const user = userEvent.setup();
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue(draftPage);
    vi.spyOn(agentApi, "getDraftAssist").mockResolvedValue({
      suggestions: [],
      metadata: {
        slug: "about-gouno",
        seo_title: "About Gouno",
        seo_description: "Gouno project introduction",
      },
    });
    renderEditor("/admin/pages/3/edit");

    await screen.findByDisplayValue(draftPage.title);
    expect(
      screen.queryByRole("button", { name: /生成 Slug/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI 优化路径与 SEO" }));
    await screen.findByRole("checkbox", { name: "应用 Slug 建议" });
    await user.click(screen.getByRole("button", { name: "应用 3 项建议" }));

    expect(screen.getByLabelText("访问路径 (Slug)")).toHaveValue("about-gouno");
    expect(screen.getByLabelText("SEO 标题")).toHaveValue("About Gouno");
    expect(screen.getByLabelText("SEO 描述")).toHaveValue(
      "Gouno project introduction",
    );
  });

  it("matches the post editor publish intent actions", async () => {
    const user = userEvent.setup();
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue(draftPage);
    const updatePageSpy = vi.spyOn(pagesApi, "updatePage").mockResolvedValue({
      ...draftPage,
      status: "published",
    });
    renderEditor("/admin/pages/3/edit");

    await screen.findByDisplayValue("关于我们");
    expect(
      screen.getByRole("button", { name: "保存草稿" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "发布" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "状态" }));
    await user.click(screen.getByRole("option", { name: "立即发布" }));
    await user.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() =>
      expect(updatePageSpy).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ status: "published" }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "更新单页" }),
    ).toBeInTheDocument();
  });

  it("keeps unsaved page fields mounted across responsive reflow", async () => {
    const user = userEvent.setup();
    renderEditor();

    const title =
      await screen.findByPlaceholderText("写一个清晰、具体的单页标题");
    const slug = screen.getByPlaceholderText("about");
    const body = screen.getByLabelText("单页正文 Markdown");
    await user.type(title, "移动端草稿");
    await user.type(slug, "mobile-draft");
    await user.type(body, "尚未保存的正文");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    fireEvent(window, new Event("resize"));

    expect(title).toHaveValue("移动端草稿");
    expect(slug).toHaveValue("mobile-draft");
    expect(body).toHaveValue("尚未保存的正文");
    expect(screen.getByText("有未保存的更改")).toBeInTheDocument();
  });

  it("saves before opening the frontsite preview", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const createPageSpy = vi.spyOn(pagesApi, "createPage").mockResolvedValue({
      ...draftPage,
      title: "预览单页",
      slug: "preview-page",
    });
    renderEditor();

    await user.type(
      await screen.findByPlaceholderText("写一个清晰、具体的单页标题"),
      "预览单页",
    );
    await user.type(screen.getByPlaceholderText("about"), "preview-page");
    await user.click(screen.getByRole("button", { name: "预览前台页面" }));

    await waitFor(() =>
      expect(createPageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "预览单页",
          slug: "preview-page",
          status: "draft",
        }),
      ),
    );
    expect(openSpy).toHaveBeenCalledWith("/preview-page", "_blank");
  });

  it("shows backend save conflicts without masking them", async () => {
    const user = userEvent.setup();
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue(draftPage);
    vi.spyOn(pagesApi, "updatePage").mockRejectedValue(
      new Error("单页已被其他编辑者更新（409 冲突）"),
    );
    renderEditor("/admin/pages/3/edit");

    await screen.findByDisplayValue(draftPage.title);
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(
      await screen.findAllByText("单页已被其他编辑者更新（409 冲突）"),
    ).not.toHaveLength(0);
  });

  it("renders existing pages read-only when content.manage is absent", async () => {
    const viewerSnapshot = {
      loggedIn: true,
      isAdmin: true,
      profile: {
        sub: "author",
        roles: ["author"],
        permissions: ["content.author"],
      },
    };
    const viewerClient = {
      subscribe: () => () => {},
      getSnapshot: () => viewerSnapshot,
    } as any;
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue(draftPage);
    renderEditor("/admin/pages/3/edit", viewerClient);

    expect(await screen.findByText("只读模式")).toBeInTheDocument();
    expect(screen.getByDisplayValue(draftPage.title)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "保存草稿" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "AI 写作" }),
    ).not.toBeInTheDocument();
  });

  it("preserves newer edits after a delayed save ACK", async () => {
    const user = userEvent.setup();
    const pending = deferred<CustomPage>();
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue(draftPage);
    const save = vi
      .spyOn(pagesApi, "updatePage")
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(async (_id, payload) => ({
        ...draftPage,
        ...payload,
      }));

    renderEditor("/admin/pages/3/edit");
    const title = await screen.findByLabelText("标题");
    await user.clear(title);
    await user.type(title, "最初提交的标题");
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    // The editor must remain usable while the previous API request is pending.
    await user.clear(title);
    await user.type(title, "保存请求期间的新标题");
    await act(async () => {
      pending.resolve({ ...draftPage, title: "最初提交的标题" });
    });

    expect(title).toHaveValue("保存请求期间的新标题");
    expect(screen.getByText("有未保存的更改")).toBeInTheDocument();
    expect(screen.queryByText(/已于.*保存/)).not.toBeInTheDocument();
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    fireEvent(window, beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(
      3,
      expect.objectContaining({ title: "保存请求期间的新标题" }),
    );
    await waitFor(() => {
      expect(screen.getByText(/已于.*保存/)).toBeInTheDocument();
    });
    const afterUnload = new Event("beforeunload", { cancelable: true });
    fireEvent(window, afterUnload);
    expect(afterUnload.defaultPrevented).toBe(false);
  });

  it("blocks stale preview while newer edits remain", async () => {
    const user = userEvent.setup();
    const pending = deferred<CustomPage>();
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue(draftPage);
    const save = vi
      .spyOn(pagesApi, "updatePage")
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(async (_id, payload) => ({
        ...draftPage,
        ...payload,
      }));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    renderEditor("/admin/pages/3/edit");
    const slug = await screen.findByLabelText("访问路径 (Slug)");
    await user.clear(slug);
    await user.type(slug, "preview-first");
    await user.click(screen.getByRole("button", { name: "预览前台页面" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    await user.clear(slug);
    await user.type(slug, "preview-newer");
    await act(async () => {
      pending.resolve({ ...draftPage, slug: "preview-first" });
    });
    expect(slug).toHaveValue("preview-newer");
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("有未保存的更改")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "预览前台页面" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(
      3,
      expect.objectContaining({ slug: "preview-newer" }),
    );
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith("/preview-newer", "_blank");
    });
  });

  it("reuses created Page ID after in-flight edits", async () => {
    const user = userEvent.setup();
    const pending = deferred<CustomPage>();
    const created = {
      ...draftPage,
      id: 202,
      title: "新建页面",
      slug: "new-page",
    };
    const create = vi
      .spyOn(pagesApi, "createPage")
      .mockReturnValue(pending.promise);
    const updatePage = vi
      .spyOn(pagesApi, "updatePage")
      .mockImplementation(async (_id, payload) => ({
        ...created,
        ...payload,
      }));
    const load = vi
      .spyOn(pagesApi, "getAdminPage")
      .mockResolvedValue({ ...created, title: "第二版标题" });

    renderEditor();
    const title = await screen.findByLabelText("标题");
    await user.type(title, "新建页面");
    await user.type(screen.getByLabelText("访问路径 (Slug)"), "new-page");
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    await user.clear(title);
    await user.type(title, "第二版标题");
    await act(async () => {
      pending.resolve(created);
    });
    expect(title).toHaveValue("第二版标题");
    expect(screen.getByText("有未保存的更改")).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(updatePage).toHaveBeenCalledTimes(1));
    expect(updatePage).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ title: "第二版标题" }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(load).toHaveBeenCalledWith("202"));
    expect(await screen.findByLabelText("标题")).toHaveValue("第二版标题");
  });
});
