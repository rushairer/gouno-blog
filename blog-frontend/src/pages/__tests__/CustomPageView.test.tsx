import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomPageView from '../CustomPageView';
import * as blogApi from '../../lib/blog-api';
import type { CustomPage } from '../../types/blog';

describe('CustomPageView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders about template correctly', async () => {
    const mockPage: CustomPage = {
      id: 1,
      title: '关于我',
      slug: 'about',
      summary: '关于本站与作者的思考',
      content: '## 个人简介\n热爱编程与架构。',
      template: 'about',
      status: 'published',
      allow_comments: false,
      show_in_nav: true,
      sort_order: 10,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(blogApi, 'getPageBySlug').mockResolvedValue(mockPage);

    render(
      <MemoryRouter initialEntries={['/about']}>
        <Routes>
          <Route path="/:slug" element={<CustomPageView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('关于我')).toBeInTheDocument();
      expect(screen.getByText('关于本站与作者的思考')).toBeInTheDocument();
      expect(screen.getByText('个人简介')).toBeInTheDocument();
    });
  });

  it('renders default template correctly', async () => {
    const mockPage: CustomPage = {
      id: 2,
      title: '友情链接',
      slug: 'links',
      summary: '博友与推荐项目',
      content: '欢迎交换友链！',
      template: 'default',
      status: 'published',
      allow_comments: false,
      show_in_nav: true,
      sort_order: 20,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(blogApi, 'getPageBySlug').mockResolvedValue(mockPage);

    render(
      <MemoryRouter initialEntries={['/links']}>
        <Routes>
          <Route path="/:slug" element={<CustomPageView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('友情链接')).toBeInTheDocument();
      expect(screen.getByText('博友与推荐项目')).toBeInTheDocument();
      expect(screen.getByText('欢迎交换友链！')).toBeInTheDocument();
    });
  });
});
