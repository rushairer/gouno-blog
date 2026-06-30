import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import Home from '../Home';

const pageOnePosts = [
  { id: 1, title: 'Go SSO Notes', slug: 'go-sso-notes', summary: 'OIDC notes', tags: ['go'], created_at: '2026-01-01T00:00:00Z' },
  { id: 2, title: 'React UI', slug: 'react-ui', summary: 'UI notes', tags: ['react'], created_at: '2026-01-02T00:00:00Z' },
];

const pageTwoPosts = [
  { id: 3, title: 'Cloud Ops', slug: 'cloud-ops', summary: 'Ops notes', tags: ['ops'], created_at: '2026-01-03T00:00:00Z' },
];

function renderHome() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Home', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads paginated posts and appends more results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/tags')) {
        return Response.json({ data: ['go', 'react', 'ops'] });
      }
      if (url.includes('page=2')) {
        return Response.json({ data: { list: pageTwoPosts, total: 3, page: 2, pageSize: 2 } });
      }
      return Response.json({ data: { list: pageOnePosts, total: 3, page: 1, pageSize: 2 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('Go SSO Notes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /load more posts/i }));

    expect(await screen.findByText('Cloud Ops')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2'));
  });

  it('filters loaded posts by search text and topic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('/api/tags')) {
          return Response.json({ data: ['go', 'react'] });
        }
        return Response.json({ data: { list: pageOnePosts, total: 2, page: 1, pageSize: 2 } });
      }),
    );

    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('Go SSO Notes')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/search posts/i), 'react');

    await waitFor(() => {
      expect(screen.queryByText('Go SSO Notes')).not.toBeInTheDocument();
      expect(screen.getByText('React UI')).toBeInTheDocument();
    });
  });
});
