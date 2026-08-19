import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPages from '../Pages';
import { ToastProvider } from '../../../components/ui';
import { pagesApi } from '../../../api/pages';
import * as auth from '../../../auth';
import type { PaginatedPages } from '../../../types/blog';

describe('AdminPages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auth, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(auth, 'canManageBlog').mockReturnValue(true);
  });

  it('renders the list of custom pages with actions', async () => {
    const mockData: PaginatedPages = {
      list: [
        {
          id: 1,
          title: '关于站点',
          slug: 'about',
          summary: '站点的关于说明',
          content: '正文内容',
          template: 'about',
          status: 'published',
          allow_comments: false,
          show_in_nav: true,
          sort_order: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          title: '友情链接',
          slug: 'links',
          summary: '友情链接列表',
          content: '友链正文',
          template: 'links',
          status: 'draft',
          allow_comments: false,
          show_in_nav: false,
          sort_order: 20,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 2,
    };

    vi.spyOn(pagesApi, 'getAdminPages').mockResolvedValue(mockData);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin/pages']}>
          <AdminPages />
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('关于站点')).toBeInTheDocument();
      expect(screen.getByText('/about')).toBeInTheDocument();
      expect(screen.getByText('友情链接')).toBeInTheDocument();
      expect(screen.getByText('/links')).toBeInTheDocument();
      expect(screen.getAllByText('已发布').length).toBeGreaterThan(0);
      expect(screen.getAllByText('草稿').length).toBeGreaterThan(0);
    });
  });
});
