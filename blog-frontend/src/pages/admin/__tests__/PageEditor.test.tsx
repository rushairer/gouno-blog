import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PageEditor from "../PageEditor";
import { ToastProvider } from "@gouno/ui-legacy";
import { pagesApi } from "../../../api/pages";
import type { CustomPage } from "../../../types/blog";
import { GossoProvider } from "@gosso/client/react";

const snapshot = {
  loggedIn: true,
  isAdmin: true,
  profile: { sub: "admin", roles: ["admin"] },
};
const mockClient = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
} as any;

function renderEditor(path = "/admin/pages/new") {
  return render(
    <GossoProvider client={mockClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/pages/new" element={<PageEditor />} />
            <Route path="/admin/pages/:id/edit" element={<PageEditor />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </GossoProvider>,
  );
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

  it("loads page via getAdminPage and renders fields and AI assistant tools", async () => {
    const getAdminPageSpy = vi
      .spyOn(pagesApi, "getAdminPage")
      .mockResolvedValue(draftPage);

    renderEditor("/admin/pages/3/edit");

    await waitFor(() => {
      expect(getAdminPageSpy).toHaveBeenCalledWith("3");
    });

    expect(await screen.findByDisplayValue("关于我们")).toBeInTheDocument();
    expect(screen.getByDisplayValue("本站与团队介绍页面")).toBeInTheDocument();
    expect(screen.getByDisplayValue("about-us")).toBeInTheDocument();
    expect(screen.getByLabelText("单页正文 Markdown")).toHaveValue(
      "## 关于我们\n\n欢迎来到我们的博客。",
    );
    expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "预览" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    expect(
      screen.getByRole("button", { name: /AI 写作与润色/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /AI 文生图插画/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /AI 一键补全元数据/ }),
    ).toBeInTheDocument();
  });

  it("matches the post editor publish intent actions", async () => {
    const user = userEvent.setup();
    vi.spyOn(pagesApi, "getAdminPage").mockResolvedValue({
      id: 3,
      title: "关于我们",
      slug: "about-us",
      summary: "",
      content: "页面正文",
      template: "default",
      status: "draft",
      allow_comments: false,
      show_in_nav: false,
      sort_order: 0,
      seo_title: "",
      seo_description: "",
      created_at: new Date().toISOString(),
    });
    const updatePageSpy = vi.spyOn(pagesApi, "updatePage").mockResolvedValue({
      id: 3,
      title: "关于我们",
      slug: "about-us",
      summary: "",
      content: "页面正文",
      template: "default",
      status: "published",
      allow_comments: false,
      show_in_nav: false,
      sort_order: 0,
      seo_title: "",
      seo_description: "",
      created_at: new Date().toISOString(),
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
    expect(
      screen.getByRole("button", { name: "保存草稿" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(updatePageSpy).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ status: "published" }),
      );
    });
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

  it("shows the backend conflict message without masking it", async () => {
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
});
