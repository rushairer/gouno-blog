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

  it("does not hold access tokens or refresh tokens in the browser", async () => {
    const { gossoClient } = await import("../auth");
    expect(gossoClient.getAccessToken()).toBeNull();
    expect(gossoClient.getRefreshToken()).toBeNull();
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

  it("refreshes and retries a protected request after receiving 401", async () => {
    document.cookie = "blog_csrf_token=blog-csrf; path=/";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "invalid or expired token" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ data: { list: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("../auth");

    const response = await apiFetch("/api/admin/posts");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://blog.example.test/api/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("uses only the Blog CSRF cookie when revoking a cookie session", async () => {
    document.cookie = "blog_csrf_token=blog-token; path=/";
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
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        data: {
          sub: "1",
          name: "Admin",
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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/blog-session",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
  });

  it("strictly enforces BFF boundary: no browser requests to IdP issuer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          sub: "1",
          name: "Admin",
          roles: ["admin"],
          permissions: ["site.manage"],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { gossoClient, apiFetch, logout } = await import("../auth");

    await gossoClient.fetchUserProfile();
    await apiFetch("/api/posts");
    await logout().catch(() => {});

    // Assert zero requests made to sso issuer directly
    const allUrls = fetchMock.mock.calls.map(([callUrl]) => String(callUrl));
    for (const calledUrl of allUrls) {
      expect(calledUrl).not.toMatch(/\/oidc\//);
      expect(calledUrl).not.toMatch(/\/oauth2\//);
      expect(calledUrl).not.toMatch(/^https:\/\/sso\./);
    }
  });

  it("does not grant permissions when membership is suspended", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        data: {
          sub: "1",
          name: "Suspended User",
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
