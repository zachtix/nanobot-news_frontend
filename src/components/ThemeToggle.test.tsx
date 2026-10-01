import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockShellApi, renderPage } from '../test/utils';

describe('theme toggle', () => {
  it('switches between the Nanobot light and dark themes and remembers the choice', async () => {
    mockShellApi();
    const user = userEvent.setup();
    renderPage(<div>page</div>);

    await user.click(await screen.findByRole('button', { name: 'ธีม' }));
    expect(screen.getByRole('menuitemradio', { name: 'สว่าง' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('menuitemradio', { name: 'มืด' }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'ธีม' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'สว่าง' }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
  });
});
