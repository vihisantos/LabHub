import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...p }: any) => <div {...p}>{children}</div> },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/components/ui', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) =>
    <span data-testid="tooltip-provider">{children}</span>,
  TooltipRoot: ({ children, dataTestId, ...p }: any) =>
    <span data-testid={dataTestId ?? 'tooltip-root'} {...p}>{children}</span>,
  TooltipTrigger: ({ children, ...p }: any) => <span {...p}>{children}</span>,
  TooltipContent: ({ children, ...p }: any) => <span {...p}>{children}</span>,
}))

import { EventManager } from '../EventManager'
import type { TvDevice } from '../../types'

function device(name: string): TvDevice {
  return {
    id: `tv-${name}`,
    name,
    workspace_id: 'ws-1',
    user_id: null,
    last_seen: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('EventManager with devices', () => {
  it('does not overflow the badge slot', () => {
    render(
      <EventManager
        devices={[device('TV do Lab 3')]}
        events={[]}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const badge = screen.getByText('TV do Lab 3', { selector: 'span.p-2, span.px-2, span.flex-1, span.block' }).closest('*[class*="truncate"]');
    expect(badge).not.toBeNull();
  })
})
