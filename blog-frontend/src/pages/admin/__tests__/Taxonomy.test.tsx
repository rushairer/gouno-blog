import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens category creation in the shared right-side drawer', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminTaxonomy type="categories" />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('还没有分类。创建第一个分类来组织长期主题。')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '新建分类' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新建分类' }));
    const form = screen.getByRole('dialog', { name: '新建分类' }).querySelector('.drawer-form');
    expect(form?.querySelectorAll('.field')).toHaveLength(4);
    expect(form?.querySelectorAll('.input-field')).toHaveLength(4);
    expect(screen.getByRole('button', { name: '创建分类' })).toHaveClass('btn-primary');
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
