import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import MediaLibrary from '../MediaLibrary';

vi.mock('../../../auth', () => ({
  apiFetch: vi.fn().mockResolvedValue(Response.json({ data: [] })),
  canManageBlog: () => true,
  isLoggedIn: () => true,
  redirectToAuthorize: vi.fn(),
}));

describe('MediaLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps upload in a drawer while the library toolbar remains focused on filtering', async () => {
    render(<ToastProvider><MediaLibrary /></ToastProvider>);

    await screen.findByText('No images uploaded yet.');
    expect(screen.queryByRole('dialog', { name: '上传图片' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '上传图片' }));

    expect(screen.getByRole('dialog', { name: '上传图片' })).toBeInTheDocument();
    const drawer = screen.getByRole('dialog', { name: '上传图片' });
    expect(drawer.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Upload image' })).toBeDisabled();
  });

  it('renders standard FilterBar with search and type filter, supporting clearing filters', async () => {
    const mockAssets = [
      { id: 1, filename: 'banner.png', url: '/banner.png', content_type: 'image/png', size_bytes: 1024, alt_text: 'Header Banner', created_at: '2026-08-16T12:00:00Z', usage_count: 1 },
      { id: 2, filename: 'avatar.jpeg', url: '/avatar.jpeg', content_type: 'image/jpeg', size_bytes: 2048, alt_text: 'User Avatar', created_at: '2026-08-16T12:00:00Z', usage_count: 0 },
    ];
    vi.mocked((await import('../../../auth')).apiFetch).mockResolvedValueOnce(Response.json({ data: mockAssets }));

    render(<ToastProvider><MediaLibrary /></ToastProvider>);

    expect(await screen.findByText('banner.png')).toBeInTheDocument();
    expect(screen.getByText('avatar.jpeg')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    const searchInput = screen.getByRole('searchbox', { name: '搜索媒体' });
    fireEvent.change(searchInput, { target: { value: 'banner' } });

    expect(screen.getByText('banner.png')).toBeInTheDocument();
    expect(screen.queryByText('avatar.jpeg')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: /清除/ });
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton);

    expect(screen.getByText('banner.png')).toBeInTheDocument();
    expect(screen.getByText('avatar.jpeg')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
