// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';

const { changePassword, disconnectGithub, getMe, updateProfile } = vi.hoisted(() => ({
  getMe: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    isOperator: false,
    emailVerified: true,
    plan: 'free',
    githubLogin: 'ada-lovelace',
    credits: { plan: 0, purchased: 0, planExpiresAt: null },
  }),
  updateProfile: vi.fn().mockResolvedValue({ name: 'Grace Hopper' }),
  disconnectGithub: vi.fn().mockResolvedValue({ connected: false }),
  changePassword: vi.fn().mockResolvedValue({ message: 'Password changed.' }),
}));

vi.mock('../../lib/api.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api.js')>('../../lib/api.js');
  return { ...actual, disconnectGithub, getMe, updateProfile };
});

import SettingsPage from '../../app/(dashboard)/settings/page';

afterEach(() => {
  vi.clearAllMocks();
});

describe('settings profile', () => {
  it('loads the authenticated profile and saves the display name', async () => {
    const mounted = await renderClient(createElement(SettingsPage));
    expect(mounted.html()).toContain('value="Ada Lovelace"');
    expect(mounted.html()).toContain('ada@example.com');

    const nameInput = document.querySelector('input:not([type="email"])') as HTMLInputElement;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(nameInput, 'Grace Hopper');
      nameInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    const saveButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save changes',
    ) as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
    });

    await vi.waitFor(() => expect(updateProfile).toHaveBeenCalledWith('Grace Hopper'));
    mounted.unmount();
  });

  it('submits a logged-in password change through the settings control', async () => {
    const mounted = await renderClient(createElement(SettingsPage));
    const changeButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Change password',
    ) as HTMLButtonElement;
    await act(async () => {
      changeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mounted.html()).toContain('Confirm password change');
    expect(changePassword).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('renders live plan and GitHub state and disconnects the connected account', async () => {
    const mounted = await renderClient(createElement(SettingsPage));
    expect(mounted.html()).toContain('ada@example.com · Free plan');
    expect(mounted.html()).toContain('ada-lovelace');
    expect(mounted.html()).not.toContain('khalid-a');

    const disconnect = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Disconnect',
    ) as HTMLButtonElement;
    await act(async () => disconnect.click());
    await vi.waitFor(() => expect(disconnectGithub).toHaveBeenCalledTimes(1));
    mounted.unmount();
  });
});
