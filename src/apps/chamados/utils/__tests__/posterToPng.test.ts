import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockToDataURL = vi.hoisted(() => vi.fn())

vi.mock('qrcode', () => ({
  default: { toDataURL: mockToDataURL },
}))

import { renderPosterPng } from '../posterToPng'

const CTX_METHODS = [
  'createLinearGradient',
  'addColorStop',
  'fillRect',
  'save',
  'restore',
  'beginPath',
  'arcTo',
  'closePath',
  'moveTo',
  'arc',
  'lineTo',
  'fill',
  'stroke',
  'drawImage',
  'fillText',
]

function makeCtx() {
  const ctx: Record<string, unknown> = {}
  for (const m of CTX_METHODS) {
    if (m === 'createLinearGradient') {
      ctx[m] = vi.fn(() => ({ addColorStop: vi.fn() }))
    } else {
      ctx[m] = vi.fn()
    }
  }
  return ctx
}

function stubCanvas() {
  const ctx = makeCtx()
  const getContext = vi.fn(() => ctx as unknown as CanvasRenderingContext2D)
  const toBlob = vi.fn(
    (cb: (blob: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
  )
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>
  const prevGetContext = proto.getContext
  const prevToBlob = proto.toBlob
  proto.getContext = getContext
  proto.toBlob = toBlob
  return { ctx, getContext, toBlob, restore: () => { proto.getContext = prevGetContext; proto.toBlob = prevToBlob } }
}

function stubImage() {
  const prev = globalThis.Image
  const ImageStub = class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_v: string) {
      if (this.onload) this.onload()
    }
  }
  globalThis.Image = ImageStub as unknown as typeof Image
  return () => { globalThis.Image = prev }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToDataURL.mockResolvedValue('data:image/png;base64,QR')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderPosterPng', () => {
  it('gera um Blob PNG com o QR renderizado', async () => {
    const restoreCanvas = stubCanvas()
    const restoreImage = stubImage()

    try {
      const blob = await renderPosterPng('https://labhub.app/chamados')
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/png')
      expect(mockToDataURL).toHaveBeenCalledWith('https://labhub.app/chamados', expect.any(Object))
    } finally {
      restoreCanvas.restore()
      restoreImage()
    }
  })

  it('rejeita se o canvas não tiver contexto 2D', async () => {
    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>
    const prev = proto.getContext
    proto.getContext = () => null

    try {
      await expect(renderPosterPng('https://x')).rejects.toThrow('Canvas não suportado')
    } finally {
      proto.getContext = prev
    }
  })
})
