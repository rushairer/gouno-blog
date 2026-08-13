// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://blog.example.test/"}
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('blog cookie session', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); sessionStorage.clear(); document.cookie = 'blog_csrf_token=; path=/; max-age=0'; });

  it('keeps only PKCE state in session storage', async () => {
    const { authSession } = await import('../auth');
    expect(authSession.getAccessToken()).toBeNull();
    expect(authSession.getRefreshToken()).toBeNull();
    expect(Object.values(authSession.storageKeys)).toEqual(expect.arrayContaining(['gouno-blog:pkce_verifier', 'gouno-blog:auth_state']));
  });

  it('adds the CSRF token to unsafe blog API requests without an Authorization header', async () => {
    document.cookie = 'blog_csrf_token=csrf-value; path=/';
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiFetch } = await import('../auth');
    await apiFetch('/api/admin/posts', { method: 'POST', body: '{}' });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('csrf-value');
    expect(headers.get('Authorization')).toBeNull();
  });

  it('protects anonymous community writes with the same CSRF-aware API helper', async () => {
    document.cookie = 'blog_csrf_token=csrf-value; path=/';
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const { optionalApiFetch } = await import('../community');
    await optionalApiFetch('/api/posts/example/comments', { method: 'POST', body: '{}' });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('csrf-value');
  });

  it('derives management access from the cookie-authenticated server session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ sub: '1', name: 'Admin' }))
      .mockResolvedValueOnce(Response.json({ data: { sub: '1', roles: ['admin'], scope: 'openid profile' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchUserProfile, canManageBlog, isLoggedIn } = await import('../auth');
    await fetchUserProfile();
    expect(isLoggedIn()).toBe(true);
    expect(canManageBlog()).toBe(true);
  });

  it('derives management access from the granted admin scope when userinfo omits roles', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ sub: '1', name: 'Admin', scope: 'openid profile admin' }))
      .mockResolvedValueOnce(Response.json({ data: { sub: '1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchUserProfile, canManageBlog } = await import('../auth');
    await fetchUserProfile();
    expect(canManageBlog()).toBe(true);
  });
});
