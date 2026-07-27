import { useEffect, useState } from 'react'
import Card from './Card'

// Parse a YouTube video or playlist URL/ID into an embed URL.
function toEmbed(url: string): string | null {
  const u = url.trim()
  if (!u) return null
  // Playlist
  const list = u.match(/[?&]list=([\w-]+)/)
  if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list[1]}`
  // watch?v=ID
  const v = u.match(/[?&]v=([\w-]{6,})/)
  if (v) return `https://www.youtube-nocookie.com/embed/${v[1]}`
  // youtu.be/ID
  const short = u.match(/youtu\.be\/([\w-]{6,})/)
  if (short) return `https://www.youtube-nocookie.com/embed/${short[1]}`
  // Bare ID
  if (/^[\w-]{11}$/.test(u)) return `https://www.youtube-nocookie.com/embed/${u}`
  return null
}

export default function YouTubeCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [embed, setEmbed] = useState<string | null>(null)

  useEffect(() => {
    void window.api.dashboard.getConfig().then((c) => setEmbed(toEmbed(c.youtubeUrl)))
  }, [])

  return (
    <Card
      title="YouTube"
      className="dash-card--media"
      actions={
        <button className="hd-act" onClick={onSettings}>
          set video
        </button>
      }
    >
      {embed ? (
        <div className="embed-16x9">
          <iframe
            src={embed}
            title="YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="faint dash-empty">
          add a YouTube video or playlist URL in settings
        </div>
      )}
    </Card>
  )
}
