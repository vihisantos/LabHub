import QRCode from 'qrcode'

const W = 1654
const H = 2339

const EMERALD = '#10b981'
const GREEN = '#16a34a'
const EMERALD_600 = '#059669'
const SLATE_900 = '#0f172a'
const SLATE_800 = '#1e293b'
const SLATE_700 = '#334155'
const SLATE_500 = '#64748b'
const SLATE_200 = '#e2e8f0'
const SLATE_50 = '#f8fafc'
const WHITE = '#ffffff'

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao carregar a imagem do QR Code'))
    img.src = src
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function centerText(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, W / 2, y)
}

function leftText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

export async function renderPosterPng(qrContent: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado neste navegador')

  const qr = await QRCode.toDataURL(qrContent, {
    width: 1100,
    margin: 2,
    color: { dark: SLATE_800, light: WHITE },
  })
  const qrImg = await loadImage(qr)

  // ── fundo ──
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, W, H)

  // ── cabeçalho (gradiente) ──
  const headerH = 500
  const grad = ctx.createLinearGradient(0, 0, W, 0)
  grad.addColorStop(0, EMERALD)
  grad.addColorStop(1, GREEN)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, headerH)

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `700 40px ${FONT}`
  leftText(ctx, 'CHAMADOS · TI', 150, 120)

  ctx.fillStyle = WHITE
  ctx.font = `800 104px ${FONT}`
  leftText(ctx, 'Abrir Chamado', 150, 270)

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `500 40px ${FONT}`
  leftText(ctx, 'Problema com um equipamento da escola?', 150, 380)

  // ── QR ──
  const qrBox = 820
  const qrX = (W - qrBox) / 2
  const qrY = 640
  ctx.save()
  roundRect(ctx, qrX, qrY, qrBox, qrBox, 52)
  ctx.fillStyle = WHITE
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = SLATE_900
  ctx.stroke()
  ctx.restore()

  const qrPad = 46
  ctx.drawImage(qrImg, qrX + qrPad, qrY + qrPad, qrBox - qrPad * 2, qrBox - qrPad * 2)

  ctx.fillStyle = SLATE_700
  ctx.font = `600 38px ${FONT}`
  centerText(ctx, 'Aponte a câmera do celular para o QR Code', qrY + qrBox + 100)

  // ── passos ──
  const steps = [
    { n: '1', title: 'Escaneie o QR Code', desc: 'Aponte a câmera do celular' },
    { n: '2', title: 'Escolha o campus e a sala', desc: 'Identifique onde você está' },
    { n: '3', title: 'Descreva o problema', desc: 'Quanto mais detalhes, mais rápido o TI resolve' },
  ]

  const stepW = 1330
  const stepH = 150
  const stepGap = 24
  const stepX = (W - stepW) / 2
  let stepY = 1660

  for (const step of steps) {
    ctx.save()
    roundRect(ctx, stepX, stepY, stepW, stepH, 44)
    ctx.fillStyle = SLATE_50
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = SLATE_200
    ctx.stroke()
    ctx.restore()

    const badgeR = 50
    const badgeCX = stepX + stepH / 2
    const badgeCY = stepY + stepH / 2
    const badgeGrad = ctx.createLinearGradient(badgeCX - badgeR, 0, badgeCX + badgeR, 0)
    badgeGrad.addColorStop(0, EMERALD)
    badgeGrad.addColorStop(1, GREEN)
    ctx.fillStyle = badgeGrad
    ctx.beginPath()
    ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = WHITE
    ctx.font = `700 46px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(step.n, badgeCX, badgeCY + 2)

    ctx.textAlign = 'left'
    ctx.fillStyle = SLATE_800
    ctx.font = `700 42px ${FONT}`
    leftText(ctx, step.title, stepX + stepH + 36, stepY + 52)

    ctx.fillStyle = SLATE_500
    ctx.font = `400 32px ${FONT}`
    leftText(ctx, step.desc, stepX + stepH + 36, stepY + 106)

    stepY += stepH + stepGap
  }

  // ── rodapé ──
  const footerY = 2205
  ctx.strokeStyle = SLATE_200
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(150, footerY)
  ctx.lineTo(W - 150, footerY)
  ctx.stroke()

  ctx.fillStyle = SLATE_500
  ctx.font = `500 30px ${FONT}`
  centerText(ctx, qrContent, footerY + 54)

  ctx.fillStyle = EMERALD_600
  ctx.font = `700 30px ${FONT}`
  centerText(ctx, 'CHAMADOS · EQUIPE DE TI', footerY + 106)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao gerar a imagem do pôster'))
    }, 'image/png')
  })
}
