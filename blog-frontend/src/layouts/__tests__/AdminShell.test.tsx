import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminShell from '../AdminShell';
import AdminUsers from '../../pages/admin/Users';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));

vi.mock('../../auth', () => ({
  getUserProfile: () => ({ name: 'Content Admin', email: 'admin@example.com' }),
  gossoAdminURL: '/identity-admin/',
  logout: logoutMock,
}));

vi.mock('../../lib/blog-api', () => ({
  getSiteSettings: () => Promise.resolve({ site_title: 'Configured Site' }),
}));

describe('AdminShell navigation utilities', () => {
  beforeEach(() => logoutMock.mockClear());

  it('uses configured site identity and exposes frontsite and logout actions', async () => {
    render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminShell><h1>Dashboard</h1></AdminShell></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Configured Site' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '在新窗口查看前台站点' })).toHaveAttribute('href', '/');
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(logoutMock).toHaveBeenCalledOnce();
  });

  it('points the identity management action at the gateway route', () => {
    render(<MemoryRouter><AdminUsers /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /打开 GOSSO 管理端/ })).toHaveAttribute('href', '/identity-admin/');
    expect(screen.getByText('Content Admin')).toBeInTheDocument();
  });
});
