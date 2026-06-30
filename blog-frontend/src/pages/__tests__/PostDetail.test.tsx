import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import PostDetail from '../PostDetail';

const post = {
  id: 7,
  title: 'Markdown Post',
  slug: 'markdown-post',
  summary: 'Summary',
  content: '## Section\nThis has **bold** text and `code`.\n- first\n- second',
  tags: ['go'],
  created_at: '2026-01-01T00:00:00Z',
};

function renderPostDetail() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/posts/markdown-post']}>
        <Routes>
          <Route path="/posts/:slug" element={<PostDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('PostDetail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads by slug, renders markdown, and loads comments by resolved id', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/posts/markdown-post') {
        return Response.json({ data: post });
      }
      if (url === '/api/posts/7/comments') {
        return Response.json({ data: [{ id: 1, post_id: 7, author: 'Ada', content: 'Great', is_visible: true, created_at: '2026-01-02T00:00:00Z' }] });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPostDetail();

    expect(await screen.findByRole('heading', { name: 'Markdown Post' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Section' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(await screen.findByText('Great')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/posts/markdown-post');
    expect(fetchMock).toHaveBeenCalledWith('/api/posts/7/comments');
  });

  it('posts a comment and shows the pending review notice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url === '/api/posts/markdown-post') {
          return Response.json({ data: post });
        }
        if (url === '/api/posts/7/comments' && init?.method === 'POST') {
          return Response.json({ data: { id: 2, post_id: 7, author: 'Grace', content: 'Hello there', is_visible: false, created_at: '2026-01-03T00:00:00Z' } }, { status: 201 });
        }
        if (url === '/api/posts/7/comments') {
          return Response.json({ data: [] });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const user = userEvent.setup();
    renderPostDetail();

    await screen.findByRole('heading', { name: 'Markdown Post' });
    await user.type(screen.getByPlaceholderText(/your name/i), 'Grace');
    await user.type(screen.getByPlaceholderText(/type your comment/i), 'Hello there');
    await user.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(screen.getByText(/waiting for admin review/i)).toBeInTheDocument();
      expect(screen.queryByText('Hello there')).not.toBeInTheDocument();
    });
  });
});
