import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomPageView from "../CustomPageView";
import { pagesApi } from "../../api/pages";
import type { CustomPage } from "../../types/blog";

describe("CustomPageView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders about template correctly", async () => {
    const mockPage: CustomPage = {
      id: 1,
      title: "关于我",
      slug: "about",
      summary: "关于本站与作者的思考",
      content: "## 个人简介\n热爱编程与架构。",
      template: "about",
      status: "published",
      allow_comments: false,
      show_in_nav: true,
      sort_order: 10,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pagesApi, "getPageBySlug").mockResolvedValue(mockPage);

    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Routes>
          <Route path="/:slug" element={<CustomPageView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("关于我")).toBeInTheDocument();
      expect(screen.getByText("关于本站与作者的思考")).toBeInTheDocument();
      expect(screen.getByText("个人简介")).toBeInTheDocument();
      expect(
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content"),
      ).toBe("关于本站与作者的思考");
    });
  });

  it("renders default template correctly", async () => {
    const mockPage: CustomPage = {
      id: 2,
      title: "友情链接",
      slug: "links",
      summary: "博友与推荐项目",
      content: "欢迎交换友链！",
      template: "default",
      status: "published",
      allow_comments: false,
      show_in_nav: true,
      sort_order: 20,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pagesApi, "getPageBySlug").mockResolvedValue(mockPage);

    render(
      <MemoryRouter initialEntries={["/links"]}>
        <Routes>
          <Route path="/:slug" element={<CustomPageView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("友情链接")).toBeInTheDocument();
      expect(screen.getByText("欢迎交换友链！")).toBeInTheDocument();
      expect(
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content"),
      ).toBe("博友与推荐项目");
    });
  });

  it("renders timeline template correctly", async () => {
    const mockPage: CustomPage = {
      id: 3,
      title: "建站历程",
      slug: "changelog",
      summary: "版本演进与关键事件",
      content: "## 2026-08\n发布新模板系统。",
      template: "timeline",
      status: "published",
      allow_comments: false,
      show_in_nav: true,
      sort_order: 30,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pagesApi, "getPageBySlug").mockResolvedValue(mockPage);

    render(
      <MemoryRouter initialEntries={["/changelog"]}>
        <Routes>
          <Route path="/:slug" element={<CustomPageView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("建站历程")).toBeInTheDocument();
      expect(screen.getByText("TIMELINE / ROADMAP")).toBeInTheDocument();
      expect(screen.getByText("2026-08")).toBeInTheDocument();
    });
  });

  it("renders projects and focus templates correctly", async () => {
    const mockPageProjects: CustomPage = {
      id: 4,
      title: "开源作品",
      slug: "projects",
      summary: "精选项目列表",
      content: "## Gouno Blog\n高性能 Go 博客系统。",
      template: "projects",
      status: "published",
      allow_comments: false,
      show_in_nav: true,
      sort_order: 40,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pagesApi, "getPageBySlug").mockResolvedValue(mockPageProjects);

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <Routes>
          <Route path="/:slug" element={<CustomPageView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("开源作品")).toBeInTheDocument();
      expect(screen.getByText("PORTFOLIO / SHOWCASE")).toBeInTheDocument();
      expect(screen.getByText("Gouno Blog")).toBeInTheDocument();
    });
  });
});
