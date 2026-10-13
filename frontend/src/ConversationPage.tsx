import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

type Conversation = {
  id: string
  name: string
  memberCount: number
  lastActive: string
}
/* TODO: make this reactive (with database) */
const initialConversations: Conversation[] = [
  {
    id: 'morning-studio',
    name: 'morning / studio',
    memberCount: 7,
    lastActive: 'active now',
  },
  {
    id: 'design-crit',
    name: 'design / crit',
    memberCount: 4,
    lastActive: '12m ago',
  },
  {
    id: 'weekend-plans',
    name: 'weekend / plans',
    memberCount: 3,
    lastActive: '1h ago',
  },
]

function ConversationPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations)
  const [isCreating, setIsCreating] = useState(false)
  const [newConversationName, setNewConversationName] = useState('')

  function openCreateForm() {
    setIsCreating(true)
  }

  function cancelCreate() {
    setIsCreating(false)
    setNewConversationName('')
  }

  function handleCreateConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newConversationName.trim()
    if (!trimmedName) return

    const newConversation: Conversation = {
      id: trimmedName.toLowerCase().replace(/\s+/g, '-'),
      name: trimmedName,
      memberCount: 1,
      lastActive: 'just created',
    }

    setConversations((currentConversations) => [
      newConversation,
      ...currentConversations,
    ])
    setNewConversationName('')
    setIsCreating(false)
  }

  function enterConversation(conversationId: string) {
    navigate(`/conversation/${conversationId}`)
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

      <section className="conversation-section" id="top">
        <div className="section-intro">
          <p className="eyebrow">
            <span className="eyebrow-line" /> Your spaces
          </p>
        </div>

        {isCreating ? (
          <form
            className="conversation-create-form"
            onSubmit={handleCreateConversation}
          >
            <input
              aria-label="New conversation name"
              autoFocus
              value={newConversationName}
              onChange={(event) => setNewConversationName(event.target.value)}
              placeholder="Name your conversation..."
            />
            <div className="room-create-actions">
              <button type="submit" className="button button-primary">
                Create conversation <span aria-hidden="true">↗</span>
              </button>
              <button
                type="button"
                className="text-link"
                onClick={cancelCreate}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="button button-primary" onClick={openCreateForm}>
            Create a conversation <span aria-hidden="true">↗</span>
          </button>
        )}

        <ul className="conversation-list">
          {conversations.map((conversation) => (
            <li className="conversation-row" key={conversation.id}>
              <button
                className="conversation-row-button"
                onClick={() => enterConversation(conversation.id)}
              >
                <div className="conversation-row-main">
                  <span className="conversation-status" />
                  <span className="conversation-row-name">
                    {conversation.name}
                  </span>
                </div>
                <div className="conversation-row-meta">
                  <span>{conversation.memberCount} people</span>
                  <span className="meta-divider" />
                  <span className="meta-muted">{conversation.lastActive}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {conversations.length === 0 && (
          <p className="conversation-empty">
            No conversations yet — create one to get started.
          </p>
        )}
      </section>
    </main>
  )
}

export default ConversationPage
