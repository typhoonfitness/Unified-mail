interface Props {
  onClose: () => void
}

const SHORTCUTS: Array<[string, string]> = [
  ['⌘/Ctrl + K', 'Command palette'],
  ['C', 'Compose'],
  ['R', 'Reply to open thread'],
  ['J / K', 'Move down / up the list'],
  ['Enter', 'Open selected thread'],
  ['E', 'Archive selected'],
  ['#', 'Delete selected'],
  ['/', 'Focus search'],
  ['⌘/Ctrl + Enter', 'Send (in compose)'],
  ['Esc', 'Close / dismiss'],
  ['?', 'Toggle this cheat sheet']
]

export default function CheatSheet({ onClose }: Props): JSX.Element {
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="cheat" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cheat-head">Keyboard shortcuts</div>
        <div className="cheat-grid">
          {SHORTCUTS.map(([keys, desc]) => (
            <div className="cheat-row" key={keys}>
              <kbd>{keys}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <div className="cheat-foot faint">press Esc or ? to close</div>
      </div>
    </div>
  )
}
