import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  defaultDb: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
    })),
  },
}))

vi.mock('../../../core/workspaces/store', () => ({
  workspaceStore: {
    get activeWorkspaceId() { return vi.fn()() },
    filter: vi.fn((items: unknown[]) => items),
  },
}))

import { workspaceStore } from '../../../core/workspaces/store'
import {
  createPlaylist,
  createQueue,
  createAnnouncement,
  createGallery,
  createMusicRequest,
} from '../services/supabase'
import { saveCalendarCache } from '../services/calendarService'

const mockStore = vi.mocked(workspaceStore)

function mockActiveWorkspace(id: string | null) {
  Object.defineProperty(mockStore, 'activeWorkspaceId', { get: () => id, configurable: true })
}

const WORKSPACE_ID = 'ws-test-1234'

describe('TV CREATE functions — workspace guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveWorkspace(WORKSPACE_ID)
  })

  describe('lança erro quando workspace é null', () => {
    beforeEach(() => {
      mockActiveWorkspace(null)
    })

    it('createPlaylist lança Workspace não selecionado', async () => {
      await expect(createPlaylist({ title: 'Test', sort_order: 0 } as never))
        .rejects.toThrow('Workspace não selecionado')
    })

    it('createQueue lança Workspace não selecionado', async () => {
      await expect(createQueue({ name: 'Test' } as never))
        .rejects.toThrow('Workspace não selecionado')
    })

    it('createAnnouncement lança Workspace não selecionado', async () => {
      await expect(createAnnouncement({ title: 'Test', content: 'Test', sort_order: 0 } as never))
        .rejects.toThrow('Workspace não selecionado')
    })

    it('createGallery lança Workspace não selecionado', async () => {
      await expect(createGallery('Test Gallery'))
        .rejects.toThrow('Workspace não selecionado')
    })

    it('createMusicRequest lança Workspace não selecionado', async () => {
      await expect(createMusicRequest({
        youtube_url: 'https://youtube.com/watch?v=test',
        youtube_video_id: 'test',
        title: 'Test',
        requested_by: 'user-1',
        requested_by_name: 'User',
      })).rejects.toThrow('Workspace não selecionado')
    })

    it('saveCalendarCache lança Workspace não selecionado', async () => {
      await expect(saveCalendarCache({
        semester_code: '2026.1',
        source_url: 'https://example.com',
        events: [],
        expires_at: new Date().toISOString(),
        is_active: true,
      })).rejects.toThrow('Workspace não selecionado')
    })
  })

  describe('envia workspace_id correto quando workspace existe', () => {
    beforeEach(() => {
      mockActiveWorkspace(WORKSPACE_ID)
    })

    it('createPlaylist usa workspace_id do store', async () => {
      const { defaultDb } = await import('../../../lib/supabase')
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.mocked(defaultDb!.from).mockReturnValue({ insert: mockInsert } as never)

      await createPlaylist({ title: 'Test', sort_order: 0 } as never)

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WORKSPACE_ID }),
      )
    })

    it('createQueue usa workspace_id do store', async () => {
      const { defaultDb } = await import('../../../lib/supabase')
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.mocked(defaultDb!.from).mockReturnValue({ insert: mockInsert } as never)

      await createQueue({ name: 'Test' } as never)

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WORKSPACE_ID }),
      )
    })

    it('createAnnouncement usa workspace_id do store', async () => {
      const { defaultDb } = await import('../../../lib/supabase')
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.mocked(defaultDb!.from).mockReturnValue({ insert: mockInsert } as never)

      await createAnnouncement({ title: 'Test', content: 'Test', sort_order: 0 } as never)

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WORKSPACE_ID }),
      )
    })

    it('createGallery usa workspace_id do store', async () => {
      const { defaultDb } = await import('../../../lib/supabase')
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.mocked(defaultDb!.from).mockReturnValue({ insert: mockInsert } as never)

      await createGallery('Test Gallery')

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WORKSPACE_ID }),
      )
    })

    it('createMusicRequest usa workspace_id do store', async () => {
      const { defaultDb } = await import('../../../lib/supabase')
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.mocked(defaultDb!.from).mockReturnValue({ insert: mockInsert } as never)

      await createMusicRequest({
        youtube_url: 'https://youtube.com/watch?v=test',
        youtube_video_id: 'test',
        title: 'Test',
        requested_by: 'user-1',
        requested_by_name: 'User',
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WORKSPACE_ID }),
      )
    })
  })

  describe('nunca envia workspace_id null ou vazio', () => {
    it('todas as CREATE functions rejeitam null sem chamar supabase', async () => {
      mockActiveWorkspace(null)
      const { defaultDb } = await import('../../../lib/supabase')
      const mockFrom = vi.mocked(defaultDb!.from)

      const fns = [
        () => createPlaylist({ title: 'T', sort_order: 0 } as never),
        () => createQueue({ name: 'T' } as never),
        () => createAnnouncement({ title: 'T', content: 'T', sort_order: 0 } as never),
        () => createGallery('T'),
        () => createMusicRequest({
          youtube_url: 'https://youtube.com/watch?v=t',
          youtube_video_id: 't',
          title: 'T',
          requested_by: 'u',
          requested_by_name: 'U',
        }),
      ]

      for (const fn of fns) {
        await expect(fn()).rejects.toThrow('Workspace não selecionado')
      }

      expect(mockFrom).not.toHaveBeenCalled()
    })
  })
})
