import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../../auth';
import { I18nProvider } from '../../i18n';
import Admin from '../Admin';

vi.mock('../../auth', () => ({
  apiFetch: vi.fn(),
  canManageBlog: vi.fn(),
  isLoggedIn: vi.fn(),
  redirectToAuthorize: vi.fn(),
}));

const post = {
  id: 1,
  title: 'Existing Post',
  slug: 'existing-post',
  summary: 'Summary',
  content: 'Body',
  tags: ['go'],
  created_at: '2026-01-01T00:00:00Z',
};

function renderAdmin() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Admin />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Admin', () => {
  beforeEach(() => {
    vi.mocked(redirectToAuthorize).mockResolvedValue(undefined);
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: post }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows an access message before redirecting unauthorized visitors', async () => {
    vi.useFakeTimers();
    vi.mocked(isLoggedIn).mockReturnValue(false);
    vi.mocked(canManageBlog).mockReturnValue(false);

    renderAdmin();

    expect(screen.getByText(/blog admin access requires sso/i)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(redirectToAuthorize).toHaveBeenCalledWith('/admin');
  });

  it('surfaces save failures while editing a post', async () => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(canManageBlog).mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: { list: [post], total: 1, page: 1, pageSize: 10 } })),
    );
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ message: 'slug is already in use' }, { status: 409 }));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const user = userEvent.setup();
    renderAdmin();

    expect(await screen.findByText('Existing Post')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /save post/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('slug is already in use');
    });
  });

  it('loads all comments for moderation and can make a pending comment public', async () => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(canManageBlog).mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: { list: [post], total: 1, page: 1, pageSize: 10 } })),
    );
    vi.mocked(apiFetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/posts/1/comments/all') {
        return Response.json({
          data: [{ id: 7, post_id: 1, author: 'Grace', content: 'Please review me', is_visible: false, created_at: '2026-01-02T00:00:00Z' }],
        });
      }
      if (url === '/api/comments/7/visibility' && init?.method === 'PUT') {
        return Response.json({ data: { id: 7, is_visible: true } });
      }
      return Response.json({ data: null });
    });

    const user = userEvent.setup();
    renderAdmin();

    expect(await screen.findByText('Existing Post')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /comments/i }));

    expect(await screen.findByText('Please review me')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show publicly/i }));

    await waitFor(() => {
      expect(screen.getByText('Visible to everyone')).toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/posts/1/comments/all');
    expect(apiFetch).toHaveBeenCalledWith('/api/comments/7/visibility', expect.objectContaining({ method: 'PUT' }));
  });
});
