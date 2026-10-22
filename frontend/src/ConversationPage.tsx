import { Show, UserButton, useAuth } from '@clerk/react'
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
  const [groupName, setGroupName] = useState('')
  const [conversationName, setConversationName] = useState('')
  const [memberIds, setMemberIds] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    async function loadConversations() {
      // Le token Clerk accompagne chaque appel API protégé.
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
        // Django renvoie les IDs numériques utilisés par la route WebSocket.
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

  async function createConversation() {
    // Un groupe est créé avant la conversation qui lui est rattachée.
    const token = await getToken()
    const memberIdValues = memberIds
      .split(',')
      .map((memberId) => memberId.trim())
      .filter(Boolean)
    const parsedMemberIds = memberIdValues.map(Number)

    if (!token) {
      setError('Connexion Clerk nécessaire')
      return
    }
    if (!groupName.trim() || !conversationName.trim() || !parsedMemberIds.length) {
      setError(
        'Remplis le nom du groupe, le nom de la conversation et au moins un ID membre',
      )
      return
    }
    if (
      memberIdValues.some((memberId) => !/^\d+$/.test(memberId)) ||
      parsedMemberIds.some((memberId) => !Number.isSafeInteger(memberId) || memberId < 1)
    ) {
      setError('Les IDs des membres doivent être des nombres entiers positifs, séparés par des virgules')
      return
    }

    setIsCreating(true)
    setError('')
    try {
      // Le backend ajoute automatiquement l'utilisateur connecté au groupe.
      const groupResponse = await fetch(`${backendUrl}/api/groups/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: groupName.trim(),
          member_ids: [...new Set(parsedMemberIds)],
        }),
      })
      if (!groupResponse.ok) {
        const details = await groupResponse.text()
        console.error('POST /api/groups/', groupResponse.status, details)
        throw new Error(`Impossible de créer le groupe (${groupResponse.status})`)
      }

      const group = (await groupResponse.json()) as { id: number }
      // La conversation utilise l'ID du groupe créé juste avant.
      const conversationResponse = await fetch(
        `${backendUrl}/api/conversations/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            group: group.id,
            name: conversationName.trim(),
          }),
        },
      )
      if (!conversationResponse.ok) {
        throw new Error('Impossible de créer la conversation')
      }

      const conversation = (await conversationResponse.json()) as Conversation
      // On met à jour l'écran avec la réponse du serveur.
      setConversations((current) => [conversation, ...current])
      setGroupName('')
      setConversationName('')
      setMemberIds('')
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : 'Impossible de créer la conversation',
      )
    } finally {
      setIsCreating(false)
    }
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
        <Show when="signed-in">
          <UserButton />
        </Show>
      </nav>

      <section className="conversation-section" id="top">
        <div className="section-intro">
          <p className="eyebrow">
            <span className="eyebrow-line" /> Your spaces
          </p>
        </div>

        {error && <p className="conversation-empty">{error}</p>}

        <form
          className="conversation-create-form"
          onSubmit={(event) => {
            event.preventDefault()
            void createConversation()
          }}
        >
          <input
            aria-label="Nom du groupe"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Nom du groupe"
          />
          <input
            aria-label="IDs des membres"
            inputMode="numeric"
            value={memberIds}
            onChange={(event) => setMemberIds(event.target.value)}
            placeholder="IDs des membres (séparés par des virgules)"
          />
          <input
            aria-label="Nom de la conversation"
            value={conversationName}
            onChange={(event) => setConversationName(event.target.value)}
            placeholder="Nom de la conversation"
          />
          <button
            type="submit"
            className="button button-primary"
            disabled={isCreating}
          >
            {isCreating ? 'Création...' : 'Créer la conversation'}
          </button>
        </form>

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
