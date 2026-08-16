import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui';
import MediaLibrary from '../MediaLibrary';

vi.mock('../../auth', () => ({
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
});
