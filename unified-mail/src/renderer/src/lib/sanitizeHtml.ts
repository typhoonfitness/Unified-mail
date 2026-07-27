// Prepare email HTML for rendering inside a sandboxed iframe.
//
// The iframe itself uses sandbox="" (no scripts, no forms, no navigation), so
// active content can't run. On top of that we block remote images by default:
// external <img>/background images are neutralized and only restored when the
// user explicitly opts in. This mirrors Superhuman/Gmail behavior and prevents
// tracking pixels from phoning home on open.

export interface ProcessedHtml {
  html: string
  blockedImages: number
}

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('//')
}

export function processEmailHtml(
  raw: string,
  loadImages: boolean
): ProcessedHtml {
  let blocked = 0
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(raw, 'text/html')
  } catch {
    return { html: raw, blockedImages: 0 }
  }

  // Neutralize <script> and event handlers defensively (sandbox already blocks
  // execution, but this keeps the DOM clean).
  doc.querySelectorAll('script').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
    }
  })

  if (!loadImages) {
    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? ''
      if (isRemote(src)) {
        blocked++
        img.setAttribute('data-blocked-src', src)
        img.removeAttribute('src')
        img.removeAttribute('srcset')
      }
    })
    // Inline background images that reference remote urls.
    doc.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style') ?? ''
      if (/url\((['"]?)https?:/i.test(style)) {
        blocked++
        el.setAttribute('style', style.replace(/url\([^)]*\)/gi, 'none'))
      }
    })
  }

  // Force links to open in a new context (inert under sandbox, but explicit).
  const base = doc.createElement('base')
  base.setAttribute('target', '_blank')
  doc.head.appendChild(base)

  // A little CRT-friendly default styling for the white mail body.
  const style = doc.createElement('style')
  style.textContent =
    'html,body{margin:0;padding:10px 14px;font-family:Arial,Helvetica,sans-serif;' +
    'font-size:14px;color:#111;background:#fff;word-break:break-word}' +
    'img{max-width:100%;height:auto}a{color:#0a53a8}'
  doc.head.appendChild(style)

  return { html: doc.documentElement.outerHTML, blockedImages: blocked }
}

// Count remote images without modifying (used to show the banner even when the
// body is plain text with a couple of tracking pixels).
export function countRemoteImages(raw: string): number {
  return processEmailHtml(raw, false).blockedImages
}
