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

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.PROD ? '' : 'http://localhost:8000')

function websocketUrl(conversationId: string) {
  const wsBase = backendUrl
    ? backendUrl.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

  return `${wsBase}/api/ws/chat/${conversationId}/`   // plus de ?token=
}


function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const socketRef = useRef<WebSocket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('Connexion...')

  useEffect(() => {
    // Sans connexion Clerk ou sans ID, aucune requête ne doit partir.
    if (!conversationId || !isLoaded || !isSignedIn) return

    const currentConversationId = conversationId
    let isCancelled = false

    async function connect() {
      const token = await getToken()
      if (!token || isCancelled) {
        setStatus('Connexion Clerk nécessaire')
        return
      }

      // On charge d'abord les anciens messages via l'API HTTP.
      const historyResponse = await fetch(
        `${backendUrl}/api/messages/?conversation=${currentConversationId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (historyResponse.ok) {
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
      }

      // Puis on ouvre le WebSocket pour les nouveaux messages en direct.
      const socket = new WebSocket(websocketUrl(currentConversationId), ['clerk', token])
      socketRef.current = socket

      socket.onopen = () => setStatus('Connecté')
      socket.onmessage = (event) => {
        // Chaque événement reçu est ajouté à la fin de la conversation.
        const incomingMessage = JSON.parse(event.data) as ChatMessage
        setMessages((currentMessages) => [...currentMessages, incomingMessage])
      }
      socket.onerror = () => setStatus('Erreur de connexion')
      socket.onclose = () => setStatus('Déconnecté')
    }

    void connect()

    return () => {
      // Quand on quitte la page, on ferme la connexion pour éviter une fuite.
      isCancelled = true
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [conversationId, getToken, isLoaded, isSignedIn])

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = message.trim()
    if (!content || socketRef.current?.readyState !== WebSocket.OPEN) return

    // Le backend attend un objet JSON contenant le champ content.
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
