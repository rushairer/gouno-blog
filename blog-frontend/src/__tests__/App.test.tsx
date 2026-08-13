import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';

vi.mock('../auth', () => ({
  canManageBlog: vi.fn(),
  isLoggedIn: vi.fn(),
  redirectToAuthorize: vi.fn(),
}));

describe('admin route access', () => {
  beforeEach(() => {
    vi.mocked(isLoggedIn).mockReturnValue(false);
    vi.mocked(canManageBlog).mockReturnValue(false);
    vi.mocked(redirectToAuthorize).mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/admin/dashboard');
  });

  it('shows a login transition rather than an empty admin page after logout', async () => {
    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('需要登录');
    expect(screen.getByRole('status')).toHaveTextContent('正在前往安全登录页…');
    await waitFor(() => expect(redirectToAuthorize).toHaveBeenCalledWith('/admin/dashboard'));
  });
});
