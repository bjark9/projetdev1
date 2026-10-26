import { Show, UserButton, useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import './ChatPage.css'

type ChatMessage = {
  message_id: number
  content: string
  sender_username: string
  created_at: string
  is_mine: boolean
}

type MessageHistoryItem = {
  id: number
  content: string
  sender: {
    username: string
  }
  created_at: string
  is_mine: boolean
}

type MemberRole = 'owner' | 'admin' | 'member'

type GroupMember = {
  user: {
    id: number
    username: string
  }
  role: MemberRole
}

type ConversationDetails = {
  id: number
  name: string
  group: {
    id: number
    name: string
    members: GroupMember[]
    current_user_role: MemberRole | null
  }
}

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.PROD ? '' : 'http://localhost:8000')

function websocketUrl(conversationId: string) {
  const wsBase = backendUrl
    ? backendUrl.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

  return `${wsBase}/api/ws/chat/${conversationId}/`
}

function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const socketRef = useRef<WebSocket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('Connexion...')
  const [conversation, setConversation] = useState<ConversationDetails | null>(null)
  const [memberId, setMemberId] = useState('')
  const [membershipError, setMembershipError] = useState('')
  const [isManagingMembers, setIsManagingMembers] = useState(false)

  useEffect(() => {
    if (!conversationId || !isLoaded || !isSignedIn) return

    const currentConversationId = conversationId
    let isCancelled = false

    async function connect() {
      const token = await getToken()
      if (!token || isCancelled) {
        setStatus('Connexion Clerk nécessaire')
        return
      }

      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [conversationResponse, historyResponse] = await Promise.all([
          fetch(`${backendUrl}/api/conversations/${currentConversationId}/`, {
            headers,
          }),
          fetch(
            `${backendUrl}/api/messages/?conversation=${currentConversationId}`,
            { headers },
          ),
        ])
        if (!conversationResponse.ok || !historyResponse.ok) {
          throw new Error('Impossible de charger la conversation')
        }
        if (isCancelled) return

        setConversation((await conversationResponse.json()) as ConversationDetails)
        const history = (await historyResponse.json()) as MessageHistoryItem[]
        setMessages(
          history.reverse().map((item) => ({
            message_id: item.id,
            content: item.content,
            sender_username: item.sender.username,
            created_at: item.created_at,
            is_mine: item.is_mine,
          })),
        )
      } catch {
        setStatus('Impossible de charger la conversation')
        return
      }

      if (isCancelled) return
      const socket = new WebSocket(websocketUrl(currentConversationId), [
        'clerk',
        token,
      ])
      socketRef.current = socket

      socket.onopen = () => setStatus('Connecté')
      socket.onmessage = (event) => {
        const incomingMessage = JSON.parse(event.data) as ChatMessage
        setMessages((currentMessages) => [...currentMessages, incomingMessage])
      }
      socket.onerror = () => setStatus('Erreur de connexion')
      socket.onclose = () => setStatus('Déconnecté')
    }

    void connect()

    return () => {
      isCancelled = true
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [conversationId, getToken, isLoaded, isSignedIn])

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const userId = Number(memberId.trim())
    if (!Number.isSafeInteger(userId) || userId < 1) {
      setMembershipError('Saisis un ID utilisateur entier positif.')
      return
    }
    if (!conversation) return

    setIsManagingMembers(true)
    setMembershipError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(
        `${backendUrl}/api/groups/${conversation.group.id}/members/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: userId }),
        },
      )
      if (!response.ok) throw new Error('Impossible d’ajouter ce membre.')
      const group = (await response.json()) as ConversationDetails['group']
      setConversation((current) => (current ? { ...current, group } : current))
      setMemberId('')
    } catch (error) {
      setMembershipError(
        error instanceof Error ? error.message : 'Impossible d’ajouter ce membre.',
      )
    } finally {
      setIsManagingMembers(false)
    }
  }

  async function removeMember(userId: number) {
    if (!conversation) return
    setIsManagingMembers(true)
    setMembershipError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(
        `${backendUrl}/api/groups/${conversation.group.id}/members/${userId}/`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!response.ok) throw new Error('Impossible de supprimer ce membre.')
      const refreshed = await fetch(
        `${backendUrl}/api/conversations/${conversation.id}/`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!refreshed.ok) {
        throw new Error('Membre supprimé, mais actualisation impossible.')
      }
      setConversation((await refreshed.json()) as ConversationDetails)
    } catch (error) {
      setMembershipError(
        error instanceof Error
          ? error.message
          : 'Impossible de supprimer ce membre.',
      )
    } finally {
      setIsManagingMembers(false)
    }
  }

  async function changeMemberRole(userId: number, role: 'admin' | 'member') {
    if (!conversation) return
    setIsManagingMembers(true)
    setMembershipError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(
        `${backendUrl}/api/groups/${conversation.group.id}/members/${userId}/role/`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        },
      )
      if (!response.ok) throw new Error('Impossible de modifier le rôle.')
      const group = (await response.json()) as ConversationDetails['group']
      setConversation((current) => (current ? { ...current, group } : current))
    } catch (error) {
      setMembershipError(
        error instanceof Error ? error.message : 'Impossible de modifier le rôle.',
      )
    } finally {
      setIsManagingMembers(false)
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = message.trim()
    if (!content || socketRef.current?.readyState !== WebSocket.OPEN) return

    socketRef.current.send(JSON.stringify({ content }))
    setMessage('')
  }

  if (!conversationId) return <p>Conversation introuvable.</p>

  const currentRole = conversation?.group.current_user_role
  return (
    <main className="chat-page">
      <header className="chat-header">
        <Link to="/conversation">Retour aux conversations</Link>
        <span>{status}</span>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
      {conversation && (
        <aside className="chat-members-panel" aria-label="Membres du groupe">
          <div className="chat-members-heading">
            <div>
              <h2>{conversation.group.name || 'Membres'}</h2>
              <p>
                Votre rôle :{' '}
                {currentRole === 'owner'
                  ? 'Propriétaire'
                  : currentRole === 'admin'
                    ? 'Administrateur'
                    : 'Membre'}
              </p>
            </div>
          </div>
          {membershipError && (
            <p className="chat-members-error" role="alert">
              {membershipError}
            </p>
          )}
          {(currentRole === 'owner' || currentRole === 'admin') && (
            <form className="chat-add-member" onSubmit={addMember}>
              <label htmlFor="new-member-id">Ajouter un membre (ID utilisateur)</label>
              <div>
                <input
                  id="new-member-id"
                  inputMode="numeric"
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  placeholder="ID utilisateur"
                  disabled={isManagingMembers}
                />
                <button type="submit" disabled={isManagingMembers}>
                  Ajouter
                </button>
              </div>
            </form>
          )}
          <ul className="chat-members-list">
            {conversation.group.members.map(({ user, role }) => (
              <li key={user.id}>
                <span>{user.username}</span>
                <span className={`chat-member-role chat-member-role-${role}`}>
                  {role === 'owner'
                    ? 'Propriétaire'
                    : role === 'admin'
                      ? 'Admin'
                      : 'Membre'}
                </span>
                {currentRole === 'owner' && role !== 'owner' && (
                  <select
                    aria-label={`Rôle de ${user.username}`}
                    value={role}
                    disabled={isManagingMembers}
                    onChange={(event) =>
                      void changeMemberRole(
                        user.id,
                        event.target.value as 'admin' | 'member',
                      )
                    }
                  >
                    <option value="member">Membre</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                {((currentRole === 'owner' && role !== 'owner') ||
                  (currentRole === 'admin' && role === 'member')) && (
                  <button
                    type="button"
                    className="chat-remove-member"
                    disabled={isManagingMembers}
                    onClick={() => void removeMember(user.id)}
                  >
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
      <section className="chat-panel" aria-label="Conversation">
        <div className="chat-messages">
          {messages.map((chatMessage, index) => (
            <article
              className={`chat-message${chatMessage.is_mine ? ' chat-message-own' : ''}`}
              key={`${chatMessage.message_id}-${index}`}
            >
              <strong>{chatMessage.sender_username}</strong>
              <p>{chatMessage.content}</p>
            </article>
          ))}
        </div>
        <form className="chat-composer" onSubmit={sendMessage}>
          <input
            aria-label="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Écrire un message..."
          />
          <button type="submit">Envoyer</button>
        </form>
      </section>
    </main>
  )
}

export default ChatPage
