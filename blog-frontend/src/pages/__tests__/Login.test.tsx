import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginWithPassword, redirectToAuthorize } from '../../auth';
import { I18nProvider } from '../../i18n';
import Login from '../Login';

vi.mock('../../auth', () => ({
  loginWithPassword: vi.fn(),
  loginWithPasskey: vi.fn(),
  redirectToAuthorize: vi.fn(),
  verifyMfa: vi.fn(),
}));

function renderLogin(initialEntry = '/login') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loginWithPassword).mockResolvedValue({});
    vi.mocked(redirectToAuthorize).mockResolvedValue(undefined);
  });

  it('continues through the blog OAuth flow after direct password login', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/enter your username/i), 'admin');
    await user.type(screen.getByPlaceholderText(/enter your password/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(loginWithPassword).toHaveBeenCalledWith('admin', 'admin123');
      expect(redirectToAuthorize).toHaveBeenCalledWith('/admin');
    });
  });

  it('shows the MFA step without starting authorize when MFA is required', async () => {
    vi.mocked(loginWithPassword).mockResolvedValue({ requires_mfa: true, mfa_token: 'mfa-token' });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/enter your username/i), 'admin');
    await user.type(screen.getByPlaceholderText(/enter your password/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByPlaceholderText(/6-digit code/i)).toBeInTheDocument();
    expect(redirectToAuthorize).not.toHaveBeenCalled();
  });
});
