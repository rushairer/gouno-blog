import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../../auth';
import { ToastProvider } from '../../../components/ui';
import AdminTaxonomy from '../Taxonomy';

vi.mock('../../../auth', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../../hooks/useAdminGuard', () => ({
  useAdminGuard: () => true,
}));

describe('AdminTaxonomy', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [] }));
  });

  it('uses the shared responsive field contract for category creation', async () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AdminTaxonomy type="categories" />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('还没有分类。创建第一个分类来组织长期主题。')).toBeInTheDocument();
    const form = container.querySelector('.taxonomy-form');
    expect(form?.querySelectorAll('.field')).toHaveLength(4);
    expect(form?.querySelectorAll('.input-field')).toHaveLength(4);
    expect(form?.querySelector('.taxonomy-form__description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建分类' })).toHaveClass('taxonomy-form__action');
  });

  it('keeps tag names in a dedicated left-aligned content region with shared action buttons', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [{ name: 'OpenAI', post_count: 3 }] }));

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AdminTaxonomy type="tags" />
        </ToastProvider>
      </MemoryRouter>,
    );

    await screen.findByText('OpenAI');
    expect(container.querySelector('.tag-admin-card__content')).toHaveTextContent('OpenAI');
    expect(screen.getByRole('button', { name: '重命名' })).toHaveClass('btn');
    expect(screen.getByRole('button', { name: '合并' })).toHaveClass('btn');
    expect(screen.getByRole('button', { name: '删除' })).toHaveClass('btn-danger');
  });
});
