import { useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import './ChatPage.css'

type ChatMessage = {
  message_id: number
  content: string
  sender_username: string
  created_at: string
}

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

function websocketUrl(conversationId: string) {
  const url = new URL(`/ws/chat/${conversationId}/`, backendUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const socketRef = useRef<WebSocket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('Connexion...')

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

      const historyResponse = await fetch(
        `${backendUrl}/api/messages/?conversation=${currentConversationId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (historyResponse.ok) {
        const history = (await historyResponse.json()) as ChatMessage[]
        setMessages(history.reverse())
      }

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
        <a href="/conversation">Retour aux conversations</a>
        <span>{status}</span>
      </header>
      <section className="chat-panel" aria-label="Conversation">
        <div className="chat-messages">
          {messages.map((chatMessage, index) => (
            <article
              className="chat-message"
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
