import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmWorkspace } from '@/components/crm/CrmWorkspace';
import type { Conversation } from '@/lib/types';

function buildConversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'c1',
    name: 'Cliente Uno',
    phone: '+58 412-0000000',
    status: 'qualified',
    statusLabel: 'Calificado',
    score: 85,
    intent: 'Comprar cemento',
    budget: '$50-100',
    schedule: 'Mañana',
    silentMode: false,
    lastTime: '10:00',
    messages: [],
    ...overrides,
  };
}

function renderWorkspace() {
  const conversations = [
    buildConversation({ id: 'c1', name: 'Cliente Uno' }),
    buildConversation({ id: 'c2', name: 'Cliente Dos' }),
  ];
  const props = {
    conversations,
    selectedConversation: conversations[0],
    onSelectConversation: vi.fn(),
    onToggleSilentMode: vi.fn(),
    onSendMessage: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
    filter: 'all',
    onFilterChange: vi.fn(),
  };
  const view = render(<CrmWorkspace {...props} />);
  return { view, conversations, props };
}

describe('CrmWorkspace: responsive pane toggle', () => {
  it('shows the list pane and hides the chat pane before selecting a conversation', () => {
    renderWorkspace();

    expect(screen.getByLabelText('Lista de conversaciones')).toHaveClass('flex');
    expect(screen.getByLabelText('Lista de conversaciones')).not.toHaveClass('hidden');
    expect(screen.getByLabelText('Conversación activa')).toHaveClass('hidden');
  });

  it('switches to the chat pane after selecting a conversation from the list', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: /Cliente Uno/ }));

    expect(screen.getByLabelText('Lista de conversaciones')).toHaveClass('hidden');
    expect(screen.getByLabelText('Conversación activa')).toHaveClass('flex');
    expect(screen.getByLabelText('Conversación activa')).not.toHaveClass('hidden');
  });
});

describe('CrmWorkspace: lead sheet focus save/restore', () => {
  it('focuses the dialog on open and returns focus to the lead trigger on close', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    // Navigate into the chat pane first (design D8: open via the chat pane's lead trigger).
    await user.click(screen.getByRole('button', { name: /Cliente Uno/ }));

    const leadTrigger = screen.getByRole('button', { name: 'Lead' });
    await user.click(leadTrigger);

    const dialog = screen.getByRole('dialog', { name: 'Perfil del lead' });
    await waitFor(() => expect(dialog).toHaveFocus());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(leadTrigger).toHaveFocus());
  });
});
