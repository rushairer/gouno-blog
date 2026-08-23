import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import Home from '../Home';

const pageOnePosts = [
  { id: 1, title: 'Go SSO Notes', slug: 'go-sso-notes', summary: 'OIDC notes', tags: ['go'], created_at: '2026-01-01T00:00:00Z' },
  { id: 2, title: 'React UI', slug: 'react-ui', summary: 'UI notes', tags: ['react'], created_at: '2026-01-02T00:00:00Z' },
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

  it('renders an editorial homepage from real posts and links to canonical article routes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/tags/summary')) {
        return Response.json({ data: [{ name: 'go', post_count: 8 }, { name: 'react', post_count: 3 }] });
      }
      if (url.includes('/api/tags')) {
        return Response.json({ data: ['go', 'react', 'ops'] });
      }
      if (url.includes('/api/categories')) {
        return Response.json({ data: [{ id: 1, name: '工程架构', slug: 'architecture', post_count: 4 }] });
      }
      if (url.includes('/api/site')) {
        return Response.json({ data: { site_title: 'Gouno Blog', author_name: '站点作者', author_bio: '欢迎来到我的博客。' } });
      }
      return Response.json({ data: { list: pageOnePosts, total: 3, page: 1, pageSize: 2 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();

    expect(await screen.findByRole('heading', { name: /记录探索与思考/ })).toBeInTheDocument();
    expect((await screen.findAllByText('Go SSO Notes')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Go SSO Notes' })[0]).toHaveAttribute('href', '/articles/go-sso-notes');
    expect(screen.getByRole('heading', { name: '精选文章' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '主题索引' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /工程架构/ })).toHaveAttribute('href', '/categories/architecture');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('pageSize=12'),
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('renders server-provided tag counts and the subscription paths without fake form submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('/api/tags/summary')) {
          return Response.json({ data: [{ name: 'go', post_count: 12 }, { name: 'react', post_count: 5 }] });
        }
        if (url.includes('/api/tags')) {
          return Response.json({ data: ['go', 'react'] });
        }
        if (url.includes('/api/site')) {
          return Response.json({ data: { email: 'hello@example.com', rss_url: '/feed.xml', author_name: '站点作者', author_bio: '欢迎来到我的博客。' } });
        }
        return Response.json({ data: { list: pageOnePosts, total: 2, page: 1, pageSize: 2 } });
      }),
    );

    renderHome();

    expect((await screen.findAllByText('Go SSO Notes')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /RSS/ })).toHaveAttribute('href', '/feed.xml');
    expect(screen.getByRole('link', { name: /Email/ })).toHaveAttribute('href', 'mailto:hello@example.com');
    expect(screen.getAllByRole('link', { name: 'go' }).some((link) => link.getAttribute('href') === '/tags/go')).toBe(true);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders cover images when post has cover_url', async () => {
    const postsWithCover = [
      { id: 1, title: 'Cover Post', slug: 'cover-post', summary: 'With cover', cover_url: '/media/cover1.jpg', cover_alt: 'Cover One', tags: ['go'], created_at: '2026-01-01T00:00:00Z' },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/tags')) return Response.json({ data: ['go'] });
      if (url.includes('/api/site')) return Response.json({ data: { site_title: 'Gouno Blog', author_name: 'Author' } });
      return Response.json({ data: { list: postsWithCover, total: 1, page: 1, pageSize: 12 } });
    }));

    renderHome();

    const imgs = await screen.findAllByAltText('Cover One');
    expect(imgs[0]).toBeInTheDocument();
    expect(imgs[0]).toHaveAttribute('src', '/media/cover1.jpg');
  });

  it('renders custom hero title, description, and image when configured in site settings', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/tags')) return Response.json({ data: [] });
      if (url.includes('/api/site')) {
        return Response.json({
          data: {
            site_title: 'Custom Blog',
            hero_title: '探索未知的技术边界',
            hero_description: '这是一份关于云原生与分布式系统的实践指南。',
            hero_image_url: '/custom-hero.webp',
            hero_image_caption: 'CLOUD / DISTRIBUTED',
          },
        });
      }
      return Response.json({ data: { list: [], total: 0, page: 1, pageSize: 12 } });
    }));

    renderHome();

    expect(await screen.findByRole('heading', { name: '探索未知的技术边界' })).toBeInTheDocument();
    expect(screen.getByText('这是一份关于云原生与分布式系统的实践指南。')).toBeInTheDocument();
    const heroImg = screen.getByAltText('CLOUD / DISTRIBUTED');
    expect(heroImg).toBeInTheDocument();
    expect(heroImg).toHaveAttribute('src', '/custom-hero.webp');
    expect(screen.getByText('CLOUD / DISTRIBUTED')).toBeInTheDocument();
  });
});
