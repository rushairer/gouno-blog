import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@gouno/ui";
import MediaLibrary from "../MediaLibrary";

vi.mock("@gosso/client/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gosso/client/react")>()),
  useUserProfile: () => ({
    sub: "admin",
    roles: ["admin"],
    permissions: ["content.manage", "ai.manage"],
  }),
}));

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json({ data: [] }))),
}));

vi.mock("../../../auth", async () => {
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return {
    apiFetch: apiFetchMock,
    gossoClient: createMockGossoClient(apiFetchMock),
    canManageBlog: () => true,
    isLoggedIn: () => true,
    hasBlogPermission: () => true,
    hasAnyBlogPermission: () => true,
    getCachedBlogSession: () => null,
    redirectToAuthorize: vi.fn(),
  };
});

describe("MediaLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ data: [] })),
    );
  });

  it("keeps upload in a drawer while the library toolbar remains focused on filtering", async () => {
    render(
      <ToastProvider>
        <MediaLibrary />
      </ToastProvider>,
    );

    await screen.findByText("No images uploaded yet.");
    expect(
      screen.queryByRole("dialog", { name: "上传图片" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上传图片" }));

    expect(
      screen.getByRole("dialog", { name: "上传图片" }),
    ).toBeInTheDocument();
    const drawer = screen.getByRole("dialog", { name: "上传图片" });
    expect(drawer.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(
      within(drawer).getByRole("button", { name: "Upload image" }),
    ).toBeDisabled();
  });

  it("opens AI text-to-image drawer with style presets and prompt inputs", async () => {
    render(
      <ToastProvider>
        <MediaLibrary />
      </ToastProvider>,
    );

    await screen.findByText("No images uploaded yet.");
    expect(
      screen.queryByRole("dialog", { name: "AI 文生图" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 文生图" }));

    expect(
      screen.getByRole("dialog", { name: "AI 文生图" }),
    ).toBeInTheDocument();
    const drawer = screen.getByRole("dialog", { name: "AI 文生图" });
    expect(within(drawer).getByText("📊 架构图解")).toBeInTheDocument();
    expect(within(drawer).getByText("🖼️ 科技插画")).toBeInTheDocument();
    expect(
      within(drawer).getByRole("button", { name: "开始生图并入库" }),
    ).toBeDisabled();
  });

  it("renders standard FilterBar with search and type filter, supporting clearing filters", async () => {
    const mockAssets = [
      {
        id: 1,
        filename: "banner.png",
        url: "/banner.png",
        content_type: "image/png",
        size_bytes: 1024,
        alt_text: "Header Banner",
        created_at: "2026-08-16T12:00:00Z",
        usage_count: 1,
      },
      {
        id: 2,
        filename: "avatar.jpeg",
        url: "/avatar.jpeg",
        content_type: "image/jpeg",
        size_bytes: 2048,
        alt_text: "User Avatar",
        created_at: "2026-08-16T12:00:00Z",
        usage_count: 0,
      },
    ];
    vi.mocked((await import("../../../auth")).apiFetch).mockResolvedValueOnce(
      Response.json({ data: mockAssets }),
    );

    render(
      <ToastProvider>
        <MediaLibrary />
      </ToastProvider>,
    );

    expect(await screen.findByText("banner.png")).toBeInTheDocument();
    expect(screen.getByText("avatar.jpeg")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    const searchInput = screen.getByRole("searchbox", { name: "搜索媒体" });
    fireEvent.change(searchInput, { target: { value: "banner" } });

    expect(screen.getByText("banner.png")).toBeInTheDocument();
    expect(screen.queryByText("avatar.jpeg")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    const clearButton = screen.getByRole("button", { name: /清除/ });
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton);

    expect(screen.getByText("banner.png")).toBeInTheDocument();
    expect(screen.getByText("avatar.jpeg")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("correctly parses relative media url via getRelativeMediaUrl", async () => {
    const { getRelativeMediaUrl } = await import("../MediaLibrary");
    expect(getRelativeMediaUrl("https://example.com/media/photo.png")).toBe(
      "/media/photo.png",
    );
    expect(
      getRelativeMediaUrl(
        "http://localhost:8080/media/upload.jpg?query=1#hash",
      ),
    ).toBe("/media/upload.jpg?query=1#hash");
    expect(getRelativeMediaUrl("/media/direct.webp")).toBe(
      "/media/direct.webp",
    );
    expect(getRelativeMediaUrl("")).toBe("");
  });

  it("supports copying relative link to clipboard", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const mockAssets = [
      {
        id: 1,
        filename: "banner.png",
        url: "https://cdn.domain.com/media/banner.png",
        content_type: "image/png",
        size_bytes: 1024,
        alt_text: "Header Banner",
        created_at: "2026-08-16T12:00:00Z",
        usage_count: 1,
      },
    ];
    vi.mocked((await import("../../../auth")).apiFetch).mockResolvedValueOnce(
      Response.json({ data: mockAssets }),
    );

    render(
      <ToastProvider>
        <MediaLibrary />
      </ToastProvider>,
    );
    expect(await screen.findByText("banner.png")).toBeInTheDocument();

    const copyRelBtn = screen.getByRole("button", {
      name: /Copy Relative URL|复制相对链接/i,
    });
    expect(copyRelBtn).toBeInTheDocument();
    fireEvent.click(copyRelBtn);

    expect(writeTextMock).toHaveBeenCalledWith("/media/banner.png");
  });

  it("opens edit alt text drawer and updates asset alt text successfully", async () => {
    const mockAssets = [
      {
        id: 1,
        filename: "banner.png",
        url: "/media/banner.png",
        content_type: "image/png",
        size_bytes: 1024,
        alt_text: "Old Alt",
        created_at: "2026-08-16T12:00:00Z",
        usage_count: 1,
      },
    ];
    const mockUpdated = {
      id: 1,
      filename: "banner.png",
      url: "/media/banner.png",
      content_type: "image/png",
      size_bytes: 1024,
      alt_text: "New Alt Description",
      created_at: "2026-08-16T12:00:00Z",
      usage_count: 1,
    };

    const apiFetchMock = vi.mocked((await import("../../../auth")).apiFetch);
    apiFetchMock
      .mockResolvedValueOnce(Response.json({ data: mockAssets }))
      .mockResolvedValueOnce(Response.json({ data: mockUpdated }));

    render(
      <ToastProvider>
        <MediaLibrary />
      </ToastProvider>,
    );
    expect(await screen.findByText("banner.png")).toBeInTheDocument();
    expect(screen.getByText(/Old Alt/)).toBeInTheDocument();

    const editBtn = screen.getByRole("button", {
      name: /Edit Alt Text|编辑替代文本/i,
    });
    fireEvent.click(editBtn);

    expect(
      screen.getByRole("dialog", { name: /Edit Alt Text|编辑替代文本/i }),
    ).toBeInTheDocument();
    const editDrawer = screen.getByRole("dialog", {
      name: /Edit Alt Text|编辑替代文本/i,
    });

    const altInput = within(editDrawer).getByRole("textbox", {
      name: /Alternative text|替代文本/i,
    });
    expect(altInput).toHaveValue("Old Alt");
    fireEvent.change(altInput, { target: { value: "New Alt Description" } });

    const saveBtn = within(editDrawer).getByRole("button", {
      name: /Save changes|保存修改/i,
    });
    fireEvent.click(saveBtn);

    expect(await screen.findByText(/New Alt Description/)).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/admin/media/1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ alt_text: "New Alt Description" }),
      }),
    );
  });

  it("submits upload image drawer form when upload button is clicked with selected file", async () => {
    const user = userEvent.setup();
    const mockUploaded = {
      id: 3,
      filename: "test-upload.png",
      url: "/media/test-upload.png",
      content_type: "image/png",
      size_bytes: 2048,
      alt_text: "Test Upload Alt",
      created_at: "2026-09-02T12:00:00Z",
      usage_count: 0,
    };

    const apiFetchMock = vi.mocked((await import("../../../auth")).apiFetch);
    apiFetchMock
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: mockUploaded }));

    render(
      <ToastProvider>
        <MediaLibrary />
      </ToastProvider>,
    );

    await screen.findByText("No images uploaded yet.");
    await user.click(screen.getByRole("button", { name: "上传图片" }));

    const drawer = screen.getByRole("dialog", { name: "上传图片" });
    const fileInput = drawer.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const testFile = new File(["dummy content"], "test-upload.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(
      await within(drawer).findByText("test-upload.png"),
    ).toBeInTheDocument();

    const uploadBtn = within(drawer).getByRole("button", {
      name: "Upload image",
    });
    expect(uploadBtn).not.toBeDisabled();
    expect(uploadBtn).toHaveAttribute("type", "submit");

    fireEvent.submit(drawer.querySelector("form")!);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/admin/media",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    expect(await screen.findByText("图片已上传。")).toBeInTheDocument();
  });
});
