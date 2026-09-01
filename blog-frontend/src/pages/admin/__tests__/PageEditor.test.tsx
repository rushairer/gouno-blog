import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PageEditor from "../PageEditor";
import { ToastProvider } from "../../../components/ui";
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

describe("PageEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads page via getAdminPage and renders fields and AI assistant tools", async () => {
    const mockPage: CustomPage = {
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

    const getAdminPageSpy = vi
      .spyOn(pagesApi, "getAdminPage")
      .mockResolvedValue(mockPage);

    render(
      <GossoProvider client={mockClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/admin/pages/3/edit"]}>
            <Routes>
              <Route path="/admin/pages/:id/edit" element={<PageEditor />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </GossoProvider>,
    );

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

    // Check AI tool buttons
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

    render(
      <GossoProvider client={mockClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/admin/pages/3/edit"]}>
            <Routes>
              <Route path="/admin/pages/:id/edit" element={<PageEditor />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </GossoProvider>,
    );

    await screen.findByDisplayValue("关于我们");
    expect(
      screen.getByRole("button", { name: "保存草稿" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存草稿" })).toHaveClass(
      "btn-primary",
    );
    expect(
      screen.queryByRole("button", { name: "发布" }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("状态"), "published");
    expect(screen.getByRole("button", { name: "保存草稿" })).toHaveClass(
      "btn-secondary",
    );
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
});
