import { useEffect, useState } from 'react'
import type { Todo } from '../../../../shared/types'
import Card from './Card'

export default function TodoCard(): JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')

  useEffect(() => {
    void window.api.dashboard.listTodos().then(setTodos)
  }, [])

  const add = async (): Promise<void> => {
    if (!text.trim()) return
    setTodos(await window.api.dashboard.addTodo(text))
    setText('')
  }

  return (
    <Card title="To-Do">
      <div className="todo-add">
        <input
          value={text}
          placeholder="add a task…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
      </div>
      {todos.length === 0 ? (
        <div className="faint dash-empty">nothing to do</div>
      ) : (
        <div className="todo-list">
          {todos.map((t) => (
            <div className={`todo-row ${t.done ? 'done' : ''}`} key={t.id}>
              <button
                className="todo-check"
                onClick={async () =>
                  setTodos(await window.api.dashboard.toggleTodo(t.id))
                }
              >
                {t.done ? '☑' : '☐'}
              </button>
              <span className="todo-text">{t.text}</span>
              <button
                className="todo-del"
                onClick={async () =>
                  setTodos(await window.api.dashboard.removeTodo(t.id))
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
