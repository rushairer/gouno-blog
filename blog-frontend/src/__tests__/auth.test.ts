import { beforeEach, describe, expect, it, vi } from 'vitest';

function accessTokenWithClaims(claims: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`;
}

describe('blog auth session', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('uses the gouno-blog storage prefix and migrates legacy keys', async () => {
    localStorage.setItem('access_token', 'legacy-access');

    const { authSession } = await import('../auth');

    expect(authSession.storageKeys.accessToken).toBe('gouno-blog:access_token');
    expect(localStorage.getItem(authSession.storageKeys.accessToken)).toBe('legacy-access');
  });

  it('allows blog management when the stored profile has the admin role', async () => {
    const { authSession, canManageBlog } = await import('../auth');

    localStorage.setItem(authSession.storageKeys.userProfile, JSON.stringify({ sub: '1', roles: ['admin'] }));

    expect(canManageBlog()).toBe(true);
  });

  it('allows blog management when the access token carries the admin role', async () => {
    const { authSession, canManageBlog } = await import('../auth');

    localStorage.setItem(authSession.storageKeys.accessToken, accessTokenWithClaims({ roles: ['admin'] }));

    expect(canManageBlog()).toBe(true);
  });

  it('does not treat ordinary Gosso users as blog managers', async () => {
    const { authSession, canManageBlog } = await import('../auth');

    localStorage.setItem(authSession.storageKeys.accessToken, accessTokenWithClaims({ roles: ['user'] }));
    localStorage.setItem(authSession.storageKeys.userProfile, JSON.stringify({ sub: '1', roles: ['user'] }));

    expect(canManageBlog()).toBe(false);
  });
});
