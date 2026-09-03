import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderActionsMenu, type HeaderAction } from '@/components/hud/HeaderActionsMenu';

function buildActions(): HeaderAction[] {
  return [
    { id: 'refresh', label: 'Refrescar', icon: <span />, onClick: vi.fn() },
    { id: 'logout', label: 'Cerrar sesión', icon: <span />, onClick: vi.fn(), destructive: true },
  ];
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: 'Acciones y estado de la sesión' });
  await user.click(trigger);
  return trigger;
}

describe('HeaderActionsMenu', () => {
  it('auto-focuses the first menu item when it opens', async () => {
    const user = userEvent.setup();
    render(<HeaderActionsMenu actions={buildActions()} />);

    await openMenu(user);

    const firstItem = screen.getByRole('menuitem', { name: 'Refrescar' });
    // Real timers + waitFor: the auto-focus runs inside a setTimeout(..., 0).
    await waitFor(() => expect(firstItem).toHaveFocus());
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<HeaderActionsMenu actions={buildActions()} />);

    const trigger = await openMenu(user);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Refrescar' })).toHaveFocus());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes when a pointerdown occurs outside the menu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <HeaderActionsMenu actions={buildActions()} />
        <button type="button">outside</button>
      </div>
    );

    await openMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const outside = screen.getByRole('button', { name: 'outside' });
    await user.click(outside);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
