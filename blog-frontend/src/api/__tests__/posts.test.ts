import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("../client", () => ({
  apiClient: { get: getMock, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { postsApi } from "../posts";

describe("posts API parameter handling", () => {
  beforeEach(() => getMock.mockReset());

  it("normalizes admin search params to q", async () => {
    getMock.mockResolvedValue({ list: [], total: 0 });
    await postsApi.getPosts({ search: "design", page: 2 }, true);
    expect(getMock).toHaveBeenCalledWith("/api/admin/posts", {
      params: { page: 2, q: "design" },
    });
  });

  it("keeps explicit q and URLSearchParams unchanged", async () => {
    getMock.mockResolvedValue({ list: [], total: 0 });
    await postsApi.getPosts({ search: "ignored", q: "actual" }, true);
    expect(getMock).toHaveBeenCalledWith("/api/admin/posts", {
      params: { search: "ignored", q: "actual" },
    });
    const params = new URLSearchParams("page=1");
    await postsApi.getPosts(params);
    expect(getMock).toHaveBeenLastCalledWith("/api/posts", { params });
  });

  it("returns an empty list when related posts are null", async () => {
    getMock.mockResolvedValue(null);
    await expect(postsApi.getRelatedPosts("hello world")).resolves.toEqual([]);
    expect(getMock).toHaveBeenCalledWith("/api/posts/hello%20world/related");
  });
});
