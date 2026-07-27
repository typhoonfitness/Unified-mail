// CRUD for reusable snippets/templates inserted via the compose slash command.

import { getDb } from '../db'
import type { Snippet } from '@shared/types'

interface SnippetRow {
  id: string
  name: string
  keyword: string
  body_html: string
  updated_at: number
}

function rowTo(r: SnippetRow): Snippet {
  return {
    id: r.id,
    name: r.name,
    keyword: r.keyword,
    bodyHtml: r.body_html,
    updatedAt: r.updated_at
  }
}

export function listSnippets(): Snippet[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM snippets ORDER BY name ASC`)
    .all() as SnippetRow[]
  return rows.map(rowTo)
}

export function saveSnippet(s: Snippet): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO snippets (id, name, keyword, body_html, updated_at)
     VALUES (@id, @name, @keyword, @bodyHtml, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        keyword = excluded.keyword,
        body_html = excluded.body_html,
        updated_at = excluded.updated_at`
  ).run({
    id: s.id,
    name: s.name,
    keyword: s.keyword,
    bodyHtml: s.bodyHtml,
    updatedAt: Date.now()
  })
}

export function deleteSnippet(id: string): void {
  const db = getDb()
  db.prepare(`DELETE FROM snippets WHERE id = ?`).run(id)
}
