import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

type Room = {
  id: string
  name: string
  memberCount: number
  lastActive: string
}

const initialRooms: Room[] = [
  { id: 'morning-studio', name: 'morning / studio', memberCount: 7, lastActive: 'active now' },
  { id: 'design-crit', name: 'design / crit', memberCount: 4, lastActive: '12m ago' },
  { id: 'weekend-plans', name: 'weekend / plans', memberCount: 3, lastActive: '1h ago' },
]

function RoomPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [isCreating, setIsCreating] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')

  function openCreateForm() {
    setIsCreating(true)
  }

  function cancelCreate() {
    setIsCreating(false)
    setNewRoomName('')
  }

  function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newRoomName.trim()
    if (!trimmedName) return

    const newRoom: Room = {
      id: trimmedName.toLowerCase().replace(/\s+/g, '-'),
      name: trimmedName,
      memberCount: 1,
      lastActive: 'just created',
    }

    setRooms((currentRooms) => [newRoom, ...currentRooms])
    setNewRoomName('')
    setIsCreating(false)
  }

  function enterRoom(roomId: string) {
    navigate(`/room/${roomId}`)
  }

  return (
    <main>
      <nav className="nav-shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Relay home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          relay<span className="brand-dot">.</span>
        </a>
        <div className="nav-links">
          <a href="/">Home</a>
        </div>
      </nav>

      <section className="room-section" id="top">
        <div className="section-intro">
          <p className="eyebrow">
            <span className="eyebrow-line" /> Your spaces
          </p>
        </div>

        {isCreating ? (
          <form className="room-create-form" onSubmit={handleCreateRoom}>
            <input
              aria-label="New room name"
              autoFocus
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              placeholder="Name your room..."
            />
            <div className="room-create-actions">
              <button type="submit" className="button button-primary">
                Create room <span aria-hidden="true">↗</span>
              </button>
              <button type="button" className="text-link" onClick={cancelCreate}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="button button-primary" onClick={openCreateForm}>
            Create a room <span aria-hidden="true">↗</span>
          </button>
        )}

        <ul className="room-list">
          {rooms.map((room) => (
            <li className="room-row" key={room.id}>
              <button className="room-row-button" onClick={() => enterRoom(room.id)}>
                <div className="room-row-main">
                  <span className="room-status" />
                  <span className="room-row-name">{room.name}</span>
                </div>
                <div className="room-row-meta">
                  <span>{room.memberCount} people</span>
                  <span className="meta-divider" />
                  <span className="meta-muted">{room.lastActive}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {rooms.length === 0 && (
          <p className="room-empty">No rooms yet — create one to get started.</p>
        )}
      </section>
    </main>
  )
}

export default RoomPage
