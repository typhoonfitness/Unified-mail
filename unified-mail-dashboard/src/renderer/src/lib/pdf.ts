// PDF text extraction via pdf.js. Renders no canvas — we only pull the text
// layer (page.getTextContent) so the reader can show it in the app font, like
// an article. Only works on real text PDFs (scanned/image PDFs have no text).

import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this to a same-origin worker asset (CSP worker-src 'self').
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface ExtractedPdf {
  pages: string[]
  hasText: boolean
}

export async function extractPdfText(data: ArrayBuffer): Promise<ExtractedPdf> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  const pages: string[] = []
  let anyText = false

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      // TextItem has `str`; TextMarkedContent does not.
      if ('str' in item) {
        text += item.str
        if (item.hasEOL) text += '\n'
      }
    }
    const trimmed = text.replace(/[ \t]+\n/g, '\n').trim()
    if (trimmed) anyText = true
    pages.push(trimmed)
  }

  await doc.destroy()
  return { pages, hasText: anyText }
}
