import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

type Conversation = {
  id: number
  name: string
  updated_at: string
  group: {
    members: unknown[]
  }
}

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

function ConversationPage() {
  const navigate = useNavigate()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    async function loadConversations() {
      const token = await getToken()
      if (!token) {
        setError('Connexion Clerk nécessaire')
        return
      }

      try {
        const response = await fetch(`${backendUrl}/api/conversations/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          throw new Error('Impossible de charger les conversations')
        }
        setConversations((await response.json()) as Conversation[])
      } catch {
        setError('Impossible de charger les conversations')
      }
    }

    void loadConversations()
  }, [getToken, isLoaded, isSignedIn])

  function enterConversation(conversationId: number) {
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

        {error && <p className="conversation-empty">{error}</p>}

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
                  <span>{conversation.group.members.length} people</span>
                  <span className="meta-divider" />
                  <span className="meta-muted">
                    {new Date(conversation.updated_at).toLocaleString()}
                  </span>
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
