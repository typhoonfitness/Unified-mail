import { useEffect, useState } from 'react'
import Card from './Card'

// Convert an open.spotify.com URL (track/album/playlist/artist) into its embed.
function toEmbed(url: string): string | null {
  const u = url.trim()
  if (!u) return null
  const m = u.match(
    /open\.spotify\.com\/(track|album|playlist|artist|show|episode)\/([\w]+)/
  )
  if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`
  return null
}

export default function MusicCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [embed, setEmbed] = useState<string | null>(null)

  useEffect(() => {
    void window.api.dashboard.getConfig().then((c) => setEmbed(toEmbed(c.spotifyUrl)))
  }, [])

  return (
    <Card
      title="Music Stream"
      actions={
        <button className="hd-act" onClick={onSettings}>
          link
        </button>
      }
    >
      {embed ? (
        <iframe
          className="spotify-embed"
          src={embed}
          title="Spotify"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      ) : (
        <div className="faint dash-empty">
          add a Spotify track/album/playlist link in settings
        </div>
      )}
    </Card>
  )
}
