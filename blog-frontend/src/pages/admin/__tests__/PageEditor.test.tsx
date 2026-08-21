import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PageEditor from '../PageEditor';
import { ToastProvider } from '../../../components/ui';
import { pagesApi } from '../../../api/pages';
import * as auth from '../../../auth';
import type { CustomPage } from '../../../types/blog';

describe('PageEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auth, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(auth, 'canManageBlog').mockReturnValue(true);
  });

  it('loads page via getAdminPage and renders fields and AI assistant tools', async () => {
    const mockPage: CustomPage = {
      id: 3,
      title: '关于我们',
      slug: 'about-us',
      summary: '本站与团队介绍页面',
      content: '## 关于我们\n\n欢迎来到我们的博客。',
      template: 'about',
      status: 'draft',
      allow_comments: false,
      show_in_nav: true,
      sort_order: 10,
      seo_title: '关于我们 - 深度技术博客',
      seo_description: '了解博主的背景与愿景。',
      created_at: new Date().toISOString(),
    };

    const getAdminPageSpy = vi.spyOn(pagesApi, 'getAdminPage').mockResolvedValue(mockPage);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin/pages/3/edit']}>
          <Routes>
            <Route path="/admin/pages/:id/edit" element={<PageEditor />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(getAdminPageSpy).toHaveBeenCalledWith('3');
    });

    expect(await screen.findByDisplayValue('关于我们')).toBeInTheDocument();
    expect(screen.getByDisplayValue('本站与团队介绍页面')).toBeInTheDocument();
    expect(screen.getByDisplayValue('about-us')).toBeInTheDocument();
    expect(screen.getByLabelText('单页正文 Markdown')).toHaveValue('## 关于我们\n\n欢迎来到我们的博客。');

    // Check AI tool buttons
    expect(screen.getByRole('button', { name: /AI 写作与润色/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI 文生图插画/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI 一键补全元数据/ })).toBeInTheDocument();
  });
});
