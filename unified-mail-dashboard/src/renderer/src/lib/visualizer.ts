// Audio visualizer ported from the Start Page's drawViz(), adapted to a
// per-instance class (so multiple canvases don't share state) and to a
// CSS-pixel canvas context. Colors follow the CRT theme (--ink / --accent).

export const VIZ_MODES = [
  'spectrum',
  'bars',
  'peaks',
  'blocks',
  'dots',
  'mirror',
  'flame',
  'radial',
  'starburst',
  'orb',
  'tunnel',
  'scope',
  'wave',
  'lissajous',
  'ripples',
  'particles',
  'matrix',
  'off'
] as const
export type VizMode = (typeof VIZ_MODES)[number]

function cssVar(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim()
}

export class Visualizer {
  private t = 0
  private peaks: number[] | null = null
  private parts: Array<{ x: number; y: number; vx: number; vy: number }> | null =
    null
  private ripples: Array<{ t: number }> = []
  private matrixDrops: number[] | null = null

  private fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }

  draw(mode: VizMode, analyser: AnalyserNode, canvas: HTMLCanvasElement): void {
    const ctx = this.fit(canvas)
    if (!ctx) return
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    this.t++
    const col = cssVar('--ink') || '#e8e8ea'
    const accent = cssVar('--accent') || col

    // Trail-based modes fade rather than clear.
    if (mode === 'matrix' || mode === 'particles') {
      ctx.fillStyle = 'rgba(7,7,8,0.28)'
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.clearRect(0, 0, W, H)
    }
    if (mode === 'off') return

    if (mode === 'scope' || mode === 'wave' || mode === 'lissajous') {
      const time = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(time)
      ctx.strokeStyle = col
      ctx.shadowColor = accent
      if (mode === 'scope') {
        ctx.lineWidth = 2
        ctx.shadowBlur = 8
        ctx.beginPath()
        for (let i = 0; i < time.length; i++) {
          const x = (i / time.length) * W
          const y = (time[i] / 255) * H
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.stroke()
      } else if (mode === 'wave') {
        ctx.fillStyle = col
        ctx.globalAlpha = 0.2
        ctx.beginPath()
        ctx.moveTo(0, H / 2)
        for (let i = 0; i < time.length; i++)
          ctx.lineTo((i / time.length) * W, (time[i] / 255) * H)
        ctx.lineTo(W, H / 2)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.lineWidth = 2
        ctx.shadowBlur = 8
        ctx.beginPath()
        for (let i = 0; i < time.length; i++) {
          const x = (i / time.length) * W
          const y = (time[i] / 255) * H
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.stroke()
      } else {
        // lissajous
        const cx = W / 2
        const cy = H / 2
        const sc = Math.min(W, H) * 0.42
        const off = Math.floor(time.length / 4)
        ctx.lineWidth = 1.6
        ctx.shadowBlur = 8
        ctx.beginPath()
        for (let i = 0; i < time.length; i++) {
          const x = cx + ((time[i] - 128) / 128) * sc
          const y = cy + ((time[(i + off) % time.length] - 128) / 128) * sc
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.stroke()
      }
      ctx.shadowBlur = 0
      return
    }

    const freq = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(freq)
    const n = freq.length
    const peak = (i: number, step: number): number => {
      let v = 0
      for (let j = 0; j < step; j++) v = Math.max(v, freq[i * step + j] ?? 0)
      return v
    }

    ctx.fillStyle = col
    ctx.strokeStyle = col
    ctx.shadowColor = accent

    switch (mode) {
      case 'spectrum': {
        const bars = 64
        const step = Math.floor(n / bars)
        const bw = W / bars
        ctx.shadowBlur = 6
        for (let i = 0; i < bars; i++) {
          const v = peak(i, step) / 255
          const h = v * H
          ctx.globalAlpha = 0.3 + 0.6 * v
          ctx.fillRect(i * bw, H - h, bw + 0.5, h)
        }
        break
      }
      case 'bars': {
        const bars = 48
        const step = Math.floor(n / bars)
        const bw = W / bars
        ctx.shadowBlur = 6
        for (let i = 0; i < bars; i++) {
          const v = peak(i, step)
          const h = (v / 255) * H * 0.92
          ctx.globalAlpha = 0.35 + 0.6 * (v / 255)
          ctx.fillRect(i * bw + bw * 0.15, H - h, bw * 0.7, h)
        }
        break
      }
      case 'peaks': {
        const bars = 48
        const step = Math.floor(n / bars)
        const bw = W / bars
        if (!this.peaks || this.peaks.length !== bars)
          this.peaks = new Array(bars).fill(0)
        ctx.shadowBlur = 5
        for (let i = 0; i < bars; i++) {
          const v = peak(i, step)
          const h = (v / 255) * H * 0.9
          ctx.globalAlpha = 0.3 + 0.6 * (v / 255)
          ctx.fillRect(i * bw + bw * 0.15, H - h, bw * 0.7, h)
          if (h >= this.peaks[i]) this.peaks[i] = h
          else this.peaks[i] = Math.max(0, this.peaks[i] - H * 0.01)
          ctx.globalAlpha = 0.9
          ctx.fillRect(i * bw + bw * 0.15, H - this.peaks[i] - 2, bw * 0.7, 2)
        }
        break
      }
      case 'mirror': {
        const bars = 48
        const step = Math.floor(n / bars)
        const bw = W / bars
        const mid = H / 2
        ctx.shadowBlur = 6
        for (let i = 0; i < bars; i++) {
          const v = peak(i, step)
          const h = (v / 255) * mid * 0.92
          ctx.globalAlpha = 0.35 + 0.6 * (v / 255)
          ctx.fillRect(i * bw + bw * 0.15, mid - h, bw * 0.7, h * 2)
        }
        break
      }
      case 'blocks': {
        const bars = 32
        const step = Math.floor(n / bars)
        const bw = W / bars
        const segH = H / 16
        ctx.shadowBlur = 5
        for (let i = 0; i < bars; i++) {
          const lit = Math.round((peak(i, step) / 255) * 16)
          for (let s = 0; s < lit; s++) {
            ctx.globalAlpha = 0.3 + 0.7 * (s / 16)
            ctx.fillRect(i * bw + bw * 0.12, H - (s + 1) * segH + segH * 0.18, bw * 0.76, segH * 0.64)
          }
        }
        break
      }
      case 'dots': {
        const bars = 40
        const step = Math.floor(n / bars)
        const rows = 16
        const bw = W / bars
        const rh = H / rows
        const rad = Math.min(bw, rh) * 0.22
        ctx.shadowBlur = 4
        for (let i = 0; i < bars; i++) {
          const lit = Math.round((peak(i, step) / 255) * rows)
          for (let r = 0; r < rows; r++) {
            ctx.globalAlpha = r < lit ? 0.4 + 0.6 * (r / rows) : 0.07
            ctx.beginPath()
            ctx.arc(i * bw + bw / 2, H - (r + 0.5) * rh, rad, 0, 7)
            ctx.fill()
          }
        }
        break
      }
      case 'flame': {
        const bars = 56
        const step = Math.floor(n / bars)
        const bw = W / bars
        const segs = 14
        for (let i = 0; i < bars; i++) {
          const v = peak(i, step)
          const h = (v / 255) * H * 0.95
          for (let s = 0; s < segs; s++) {
            const y0 = H - h * (s / segs)
            const y1 = H - h * ((s + 1) / segs)
            const a = 1 - s / segs
            const jw = bw * 0.7 * (0.6 + 0.4 * Math.random())
            ctx.globalAlpha = a * (0.3 + 0.6 * (v / 255))
            ctx.fillRect(i * bw + bw * 0.15 + (bw * 0.7 - jw) / 2, y1, jw, y0 - y1 + 1)
          }
        }
        break
      }
      case 'radial': {
        const cx = W / 2
        const cy = H / 2
        const r0 = Math.min(W, H) * 0.16
        const bars = 64
        const step = Math.floor(n / bars)
        ctx.shadowBlur = 6
        ctx.lineWidth = 2
        for (let i = 0; i < bars; i++) {
          const v = peak(i, step)
          const a = (i / bars) * Math.PI * 2
          const len = r0 + (v / 255) * Math.min(W, H) * 0.3
          ctx.globalAlpha = 0.4 + 0.6 * (v / 255)
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
          ctx.stroke()
        }
        break
      }
      case 'starburst': {
        const cx = W / 2
        const cy = H / 2
        const rays = 72
        const step = Math.floor(n / rays)
        const rot = this.t * 0.004
        ctx.shadowBlur = 6
        ctx.lineWidth = 1.5
        for (let i = 0; i < rays; i++) {
          const v = peak(i, step)
          const a = (i / rays) * Math.PI * 2 + rot
          const len = (v / 255) * Math.min(W, H) * 0.48
          ctx.globalAlpha = 0.3 + 0.7 * (v / 255)
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
          ctx.stroke()
        }
        break
      }
      case 'orb': {
        const cx = W / 2
        const cy = H / 2
        const pts = 96
        const base = Math.min(W, H) * 0.16
        ctx.shadowBlur = 10
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let i = 0; i <= pts; i++) {
          const idx = i % pts
          const v = freq[Math.floor((idx / pts) * n)] / 255
          const a = (idx / pts) * Math.PI * 2
          const rr = base + v * Math.min(W, H) * 0.3
          const x = cx + Math.cos(a) * rr
          const y = cy + Math.sin(a) * rr
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.closePath()
        ctx.globalAlpha = 0.14
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.stroke()
        break
      }
      case 'tunnel': {
        const cx = W / 2
        const cy = H / 2
        const rings = 18
        const maxR = Math.hypot(W, H) / 2
        ctx.shadowBlur = 6
        for (let k = 0; k < rings; k++) {
          const tt = (this.t * 0.01 + k / rings) % 1
          const r = tt * maxR
          const v = freq[Math.floor((k / rings) * n)] / 255
          ctx.globalAlpha = (1 - tt) * (0.3 + 0.6 * v)
          ctx.lineWidth = 1 + 3 * v
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, 7)
          ctx.stroke()
        }
        break
      }
      case 'ripples': {
        let bass = 0
        for (let i = 0; i < 6; i++) bass += freq[i]
        bass /= 6 * 255
        if (
          bass > 0.6 &&
          (!this.ripples.length ||
            this.t - this.ripples[this.ripples.length - 1].t > 6)
        )
          this.ripples.push({ t: this.t })
        const cx = W / 2
        const cy = H / 2
        const maxR = Math.hypot(W, H) / 2
        ctx.shadowBlur = 6
        ctx.lineWidth = 2
        this.ripples = this.ripples.filter((rp) => {
          const r = ((this.t - rp.t) * maxR) / 90
          if (r > maxR) return false
          ctx.globalAlpha = Math.max(0, 1 - r / maxR)
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, 7)
          ctx.stroke()
          return true
        })
        break
      }
      case 'particles': {
        const N = 90
        if (!this.parts || this.parts.length !== N)
          this.parts = Array.from({ length: N }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: Math.random() - 0.5,
            vy: Math.random() - 0.5
          }))
        let amp = 0
        for (let i = 0; i < n; i++) amp += freq[i]
        amp /= n * 255
        ctx.shadowBlur = 5
        for (const p of this.parts) {
          const spd = 0.5 + amp * 6
          p.x += p.vx * spd
          p.y += p.vy * spd
          if (p.x < 0) p.x += W
          if (p.x > W) p.x -= W
          if (p.y < 0) p.y += H
          if (p.y > H) p.y -= H
          const sz = 1 + amp * 4
          ctx.globalAlpha = 0.4 + 0.6 * amp
          ctx.beginPath()
          ctx.arc(p.x, p.y, sz, 0, 7)
          ctx.fill()
        }
        break
      }
      case 'matrix': {
        const cols = Math.floor(W / 10)
        if (!this.matrixDrops || this.matrixDrops.length !== cols)
          this.matrixDrops = new Array(cols).fill(0).map(() => Math.random() * H)
        let amp = 0
        for (let i = 0; i < n; i++) amp += freq[i]
        amp /= n * 255
        ctx.font = '11px monospace'
        for (let i = 0; i < cols; i++) {
          const ch = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96))
          ctx.globalAlpha = 0.5 + 0.5 * amp
          ctx.fillText(ch, i * 10, this.matrixDrops[i])
          this.matrixDrops[i] += 4 + amp * 12
          if (this.matrixDrops[i] > H && Math.random() > 0.975)
            this.matrixDrops[i] = 0
        }
        break
      }
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }
}
