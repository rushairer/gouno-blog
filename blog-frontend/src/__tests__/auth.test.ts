// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://blog.example.test/"}
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("blog cookie session", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "blog_csrf_token=; path=/; max-age=0";
    document.cookie = "__Host-csrf_token=; path=/; max-age=0; Secure";
  });

  it("keeps only PKCE state in session storage", async () => {
    const { gossoClient } = await import("../auth");
    expect(gossoClient.getAccessToken()).toBeNull();
    expect(gossoClient.getRefreshToken()).toBeNull();
    expect(Object.values(gossoClient.storageKeys)).toEqual(
      expect.arrayContaining([
        "gouno-blog:pkce_verifier",
        "gouno-blog:auth_state",
      ]),
    );
  });

  it("adds the CSRF token to unsafe blog API requests without an Authorization header", async () => {
    document.cookie = "blog_csrf_token=csrf-value; path=/";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("../auth");
    await apiFetch("/api/admin/posts", { method: "POST", body: "{}" });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("X-CSRF-Token")).toBe("csrf-value");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("refreshes an expired cookie session once, then retries the protected request", async () => {
    document.cookie = "blog_csrf_token=blog-csrf; path=/";
    document.cookie = "__Host-csrf_token=gosso-csrf; path=/; Secure";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "invalid or expired token" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ expires_in: 900 }), { status: 200 }),
      )
      .mockResolvedValueOnce(Response.json({ data: { list: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("../auth");

    const response = await apiFetch("/api/admin/posts");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://blog.example.test/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-Gosso-Cookie-Session": "1",
          "X-CSRF-Token": "gosso-csrf",
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("renews a missing GOSSO CSRF cookie before refreshing a long-idle session", async () => {
    document.cookie = "blog_csrf_token=blog-csrf; path=/";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(async () => {
        document.cookie =
          "__Host-csrf_token=renewed-gosso-csrf; path=/; Secure";
        return new Response(null, { status: 401 });
      })
      .mockResolvedValueOnce(Response.json({ data: { expires_in: 900 } }))
      .mockResolvedValueOnce(Response.json({ data: { list: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("../auth");

    const response = await apiFetch("/api/admin/posts");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://blog.example.test/api/v1/auth/session",
      { credentials: "same-origin" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://blog.example.test/api/v1/auth/refresh",
      expect.objectContaining({
        headers: {
          "X-Gosso-Cookie-Session": "1",
          "X-CSRF-Token": "renewed-gosso-csrf",
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("uses only the GOSSO CSRF cookie when revoking a cookie session", async () => {
    document.cookie = "blog_csrf_token=blog-token; path=/";
    document.cookie = "__Host-csrf_token=gosso-token; path=/; Secure";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "CSRF token mismatch" }), {
        status: 403,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { logout } = await import("../auth");

    await expect(logout()).rejects.toThrow(/logout failed/i);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://blog.example.test/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": "blog-token" },
      }),
    );
  });

  it("protects anonymous community writes with the same CSRF-aware API helper", async () => {
    document.cookie = "blog_csrf_token=csrf-value; path=/";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("../auth");
    await apiFetch("/api/posts/example/comments", {
      method: "POST",
      body: "{}",
    });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("X-CSRF-Token")).toBe("csrf-value");
  });

  it("derives management profile and permissions via the shared policy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ sub: "1", name: "Admin" }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            membership_status: "active",
            roles: ["admin"],
            permissions: ["site.manage"],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { gossoClient } = await import("../auth");
    const { defineAbility, canPreviewUnpublished } =
      await import("../abilities");
    const profile = await gossoClient.fetchUserProfile();
    expect(gossoClient.getSnapshot().loggedIn).toBe(true);
    expect(profile.permissions).toContain("site.manage");
    expect(defineAbility(profile).can("manage", "site")).toBe(true);
    expect(canPreviewUnpublished(profile)).toBe(true);
    expect(gossoClient.getSnapshot().profile?.membership_status).toBe("active");
  });

  it("does not grant permissions when membership is suspended", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          sub: "1",
          name: "Suspended User",
          scope: "openid profile",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            membership_status: "suspended",
            roles: ["admin"],
            permissions: ["site.manage"],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { gossoClient } = await import("../auth");
    const { defineAbility, canPreviewUnpublished } =
      await import("../abilities");
    const profile = await gossoClient.fetchUserProfile();
    expect(defineAbility(profile).can("manage", "site")).toBe(false);
    expect(canPreviewUnpublished(profile)).toBe(false);
  });

  it("denies every business ability without an authenticated profile", async () => {
    const { defineAbility, canPreviewUnpublished } =
      await import("../abilities");
    const ability = defineAbility(null);
    expect(ability.can("manage", "site")).toBe(false);
    expect(ability.can("create", "post")).toBe(false);
    expect(canPreviewUnpublished(null)).toBe(false);
  });
});
