// Local dashboard data: to-do items and quick links.

import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { Todo, QuickLink } from '@shared/types'

// ---- to-do ----

export function listTodos(): Todo[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM todos ORDER BY done ASC, created_at DESC`)
    .all() as Array<{ id: string; text: string; done: number; created_at: number }>
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    done: r.done === 1,
    createdAt: r.created_at
  }))
}

export function addTodo(text: string): Todo[] {
  const db = getDb()
  db.prepare(
    `INSERT INTO todos (id, text, done, created_at) VALUES (?, ?, 0, ?)`
  ).run(randomUUID(), text.trim(), Date.now())
  return listTodos()
}

export function toggleTodo(id: string): Todo[] {
  const db = getDb()
  db.prepare(`UPDATE todos SET done = 1 - done WHERE id = ?`).run(id)
  return listTodos()
}

export function removeTodo(id: string): Todo[] {
  const db = getDb()
  db.prepare(`DELETE FROM todos WHERE id = ?`).run(id)
  return listTodos()
}

// ---- quick links ----

export function listLinks(): QuickLink[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM links ORDER BY position ASC`)
    .all() as Array<{ id: string; title: string; url: string; position: number }>
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    position: r.position
  }))
}

export function addLink(title: string, url: string): QuickLink[] {
  const db = getDb()
  const max = db.prepare(`SELECT COALESCE(MAX(position), 0) AS m FROM links`).get() as {
    m: number
  }
  db.prepare(
    `INSERT INTO links (id, title, url, position) VALUES (?, ?, ?, ?)`
  ).run(randomUUID(), title.trim(), url.trim(), max.m + 1)
  return listLinks()
}

export function removeLink(id: string): QuickLink[] {
  const db = getDb()
  db.prepare(`DELETE FROM links WHERE id = ?`).run(id)
  return listLinks()
}
