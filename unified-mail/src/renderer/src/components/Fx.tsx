import { useEffect, useRef, useState } from 'react'
import type { CrtEffects } from '../../../shared/types'

// Full-screen overlay for the animated FX ported from the Start Page: a CRT
// refresh sweep bar and a particle field (rain / snow / petals / embers).
export default function Fx(): JSX.Element {
  const [fx, setFx] = useState<CrtEffects | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => setFx(s.effects))
    return window.events.onSettingsChanged((s) => setFx(s.effects))
  }, [])

  const particlesOn =
    !!fx && (fx.rain || fx.snow || fx.petals || fx.embers)

  useEffect(() => {
    if (!particlesOn || !fx) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const c = canvasRef.current?.getContext('2d')
      const cv = canvasRef.current
      if (c && cv) c.clearRect(0, 0, cv.width, cv.height)
      return
    }
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let W = (canvas.width = window.innerWidth)
    let H = (canvas.height = window.innerHeight)
    const onResize = (): void => {
      W = canvas.width = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    interface P {
      x: number
      y: number
      v: number
      d: number
      s: number
      a: number
      rot: number
    }
    const mk = (): P => ({
      x: Math.random() * W,
      y: Math.random() * H,
      v: 0.5 + Math.random() * 2,
      d: Math.random() * 2 - 1,
      s: 1 + Math.random() * 2.5,
      a: 0.3 + Math.random() * 0.5,
      rot: Math.random() * Math.PI * 2
    })
    const COUNT = 90
    const rain = fx.rain ? Array.from({ length: COUNT }, mk) : []
    const snow = fx.snow ? Array.from({ length: COUNT }, mk) : []
    const petals = fx.petals ? Array.from({ length: 40 }, mk) : []
    const embers = fx.embers ? Array.from({ length: 50 }, mk) : []

    const ink = getComputedStyle(document.body).getPropertyValue('--ink').trim() || '#e8e8ea'

    const loop = (): void => {
      ctx.clearRect(0, 0, W, H)
      // rain: thin vertical streaks
      ctx.strokeStyle = ink
      for (const p of rain) {
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + p.d, p.y + 12)
        ctx.stroke()
        p.y += p.v * 6
        p.x += p.d
        if (p.y > H) {
          p.y = -12
          p.x = Math.random() * W
        }
      }
      // snow: soft dots
      ctx.fillStyle = ink
      for (const p of snow) {
        ctx.globalAlpha = p.a
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.s, 0, 7)
        ctx.fill()
        p.y += p.v
        p.x += Math.sin(p.y * 0.02) * 0.6
        if (p.y > H) {
          p.y = -4
          p.x = Math.random() * W
        }
      }
      // petals: drifting rotating rectangles
      for (const p of petals) {
        ctx.globalAlpha = p.a
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rot += 0.02))
        ctx.fillRect(-3, -2, 6, 4)
        ctx.restore()
        p.y += p.v * 0.8
        p.x += Math.sin(p.y * 0.01) * 1.2
        if (p.y > H) {
          p.y = -6
          p.x = Math.random() * W
        }
      }
      // embers: rising glowing dots
      ctx.shadowColor = ink
      ctx.shadowBlur = 6
      for (const p of embers) {
        ctx.globalAlpha = p.a
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.s * 0.7, 0, 7)
        ctx.fill()
        p.y -= p.v
        p.x += Math.sin(p.y * 0.03) * 0.8
        if (p.y < -6) {
          p.y = H + 6
          p.x = Math.random() * W
        }
      }
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', onResize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [particlesOn, fx])

  return (
    <>
      {fx?.sweep && <div className="fx-sweep" />}
      {particlesOn && <canvas ref={canvasRef} className="fx-canvas" />}
    </>
  )
}
