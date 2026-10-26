import { Show, UserButton, useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MembershipPanel from './MembershipPanel'
import type { ChatGroup } from './MembershipPanel'
import './ChatPage.css'

type ChatMessage = {
  message_id: number
  content: string
  sender_display_name: string
  created_at: string
  is_mine: boolean
}

type MessageHistoryItem = {
  id: number
  content: string
  sender: {
    username: string
    display_name: string
  }
  created_at: string
  is_mine: boolean
}

type ConversationDetails = {
  id: number
  name: string
  group: ChatGroup
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
            sender_display_name:
              item.sender.display_name.trim() || item.sender.username,
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

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = message.trim()
    if (!content || socketRef.current?.readyState !== WebSocket.OPEN) return

    socketRef.current.send(JSON.stringify({ content }))
    setMessage('')
  }

  if (!conversationId) return <p>Conversation introuvable.</p>

  return (
    <main className="chat-page">
      <header className="chat-header">
        <Link to="/conversation">Retour aux conversations</Link>
        <span>{status}</span>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
      <div className="chat-content">
        <section className="chat-panel" aria-label="Conversation">
          <div className="chat-messages">
            {messages.map((chatMessage, index) => (
              <article
                className={`chat-message${chatMessage.is_mine ? ' chat-message-own' : ''}`}
                key={`${chatMessage.message_id}-${index}`}
              >
                <strong>{chatMessage.sender_display_name}</strong>
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
        {conversation && (
          <MembershipPanel
            group={conversation.group}
            conversationId={conversation.id}
            onGroupUpdated={(group) =>
              setConversation((current) =>
                current ? { ...current, group } : current,
              )
            }
          />
        )}
      </div>
    </main>
  )
}

export default ChatPage
