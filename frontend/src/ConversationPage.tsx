import { Show, UserButton, useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import ThemeToggle from './ThemeToggle'
import { debugError, debugLog } from './debug'

type Conversation = {
  id: number
  name: string
  updated_at: string
  unread_count: number
  group: {
    members: unknown[]
  }
}

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.PROD ? '' : 'http://localhost:8000')

function notificationWebsocketUrl() {
  const wsBase = backendUrl
    ? backendUrl.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

  return `${wsBase}/api/ws/notifications/`
}

function ConversationPage() {
  const navigate = useNavigate()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [error, setError] = useState('')
  const [groupName, setGroupName] = useState('')
  const [conversationName, setConversationName] = useState('')
  const [memberIds, setMemberIds] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const conversationIds = conversations.map(({ id }) => id).join(',')

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    debugLog('Conversation page: Clerk is ready')

    async function loadConversations() {
      // Le token Clerk accompagne chaque appel API protégé.
      const token = await getToken()
      if (!token) {
        debugLog('Conversation page: no Clerk token received')
        setError('Connexion Clerk nécessaire')
        return
      }

      try {
        debugLog('Conversation page: loading conversations')
        const response = await fetch(`${backendUrl}/api/conversations/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          debugLog('Conversation page: API returned an error', {
            status: response.status,
          })
          throw new Error('Impossible de charger les conversations')
        }
        // Django renvoie les IDs numériques utilisés par la route WebSocket.
        setConversations((await response.json()) as Conversation[])
        debugLog('Conversation page: conversations loaded')
      } catch (error) {
        debugError('Conversation page: loading failed', error)
        setError('Impossible de charger les conversations')
      }
    }

    void loadConversations()
  }, [getToken, isLoaded, isSignedIn])

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !conversationIds) return

    let isCancelled = false
    const sockets: WebSocket[] = []

    async function subscribeToMessages() {
      const token = await getToken()
      if (!token || isCancelled) return
      debugLog('Notifications: opening WebSocket')

      const socket = new WebSocket(notificationWebsocketUrl(), ['clerk', token])
      sockets.push(socket)
      socket.onopen = () => debugLog('Notifications: WebSocket connected')
      socket.onmessage = (event) => {
        debugLog('Notifications: message received')
        const notification = JSON.parse(event.data) as {
          conversation_id: number
        }
        setConversations((current) =>
          current.map((item) =>
            item.id === notification.conversation_id
              ? { ...item, unread_count: item.unread_count + 1 }
              : item,
          ),
        )
      }
      socket.onerror = (error) => {
        debugError('Notifications: WebSocket error', error)
        setError(
          'Les notifications temps réel sont momentanément indisponibles.',
        )
      }
    }

    void subscribeToMessages()
    return () => {
      isCancelled = true
      sockets.forEach((socket) => socket.close())
    }
  }, [conversationIds, getToken, isLoaded, isSignedIn])

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
    if (
      !groupName.trim() ||
      !conversationName.trim() ||
      !parsedMemberIds.length
    ) {
      setError(
        'Remplis le nom du groupe, le nom de la conversation et au moins un ID membre',
      )
      return
    }
    if (
      memberIdValues.some((memberId) => !/^\d+$/.test(memberId)) ||
      parsedMemberIds.some(
        (memberId) => !Number.isSafeInteger(memberId) || memberId < 1,
      )
    ) {
      setError(
        'Les IDs des membres doivent être des nombres entiers positifs, séparés par des virgules',
      )
      return
    }

    setIsCreating(true)
    setError('')
    try {
      debugLog('Conversation creation: creating group')
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
        throw new Error(
          `Impossible de créer le groupe (${groupResponse.status})`,
        )
      }

      const group = (await groupResponse.json()) as { id: number }
      debugLog('Conversation creation: group created', { groupId: group.id })
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
      debugLog('Conversation creation: conversation created', {
        conversationId: conversation.id,
      })
      // On met à jour l'écran avec la réponse du serveur.
      setConversations((current) => [conversation, ...current])
      setGroupName('')
      setConversationName('')
      setMemberIds('')
    } catch (creationError) {
      debugError('Conversation creation: failed', creationError)
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
        <a className="brand" href="/" aria-label="Relay home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          relay<span className="brand-dot">.</span>
        </a>
        <div className="nav-links">
          <a href="/">Home</a>
        </div>
        <ThemeToggle />
        <Show when="signed-in">
          <div className="profile-menu">
            <span className="profile-label">Mon profil</span>
            <UserButton />
          </div>
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
                  {conversation.unread_count > 0 ? (
                    <span
                      className="conversation-unread-indicator"
                      aria-label={`${conversation.unread_count} message${conversation.unread_count === 1 ? '' : 's'} non lu${conversation.unread_count === 1 ? '' : 's'}`}
                    >
                      {conversation.unread_count}
                    </span>
                  ) : (
                    <span className="conversation-status" />
                  )}
                  <span className="conversation-row-name">
                    {conversation.name}
                  </span>
                </div>
                <div className="conversation-row-meta">
                  <span>{conversation.group.members.length} people</span>
                  {conversation.unread_count > 0 && (
                    <strong className="conversation-unread-label">
                      {conversation.unread_count} non lu
                      {conversation.unread_count > 1 ? 's' : ''}
                    </strong>
                  )}
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
