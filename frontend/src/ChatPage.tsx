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
  edited_at?: string | null
  is_mine: boolean
}

type ChatMessageDeletedEvent = {
  type: 'message_deleted'
  message_id: number
}

type ChatMessageEditedEvent = {
  type: 'message_edited'
  message_id: number
  content: string
  edited_at: string
}

type ChatMessageEvent =
  ChatMessage | ChatMessageDeletedEvent | ChatMessageEditedEvent

function isMessageDeletedEvent(
  event: ChatMessageEvent,
): event is ChatMessageDeletedEvent {
  return 'type' in event && event.type === 'message_deleted'
}

function isMessageEditedEvent(
  event: ChatMessageEvent,
): event is ChatMessageEditedEvent {
  return 'type' in event && event.type === 'message_edited'
}

type MessageHistoryItem = {
  id: number
  content: string
  sender: {
    username: string
    display_name: string
  }
  created_at: string
  edited_at: string | null
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
  const [conversation, setConversation] = useState<ConversationDetails | null>(
    null,
  )
  const [readError, setReadError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(
    null,
  )
  const [openMessageMenuId, setOpenMessageMenuId] = useState<number | null>(
    null,
  )
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [savingMessageId, setSavingMessageId] = useState<number | null>(null)

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

        setConversation(
          (await conversationResponse.json()) as ConversationDetails,
        )
        const history = (await historyResponse.json()) as MessageHistoryItem[]
        setMessages(
          history.reverse().map((item) => ({
            message_id: item.id,
            content: item.content,
            sender_display_name:
              item.sender.display_name.trim() || item.sender.username,
            created_at: item.created_at,
            edited_at: item.edited_at,
            is_mine: item.is_mine,
          })),
        )
      } catch {
        setStatus('Impossible de charger la conversation')
        return
      }

      if (isCancelled) return
      async function markMessagesRead() {
        const response = await fetch(`${backendUrl}/api/messages/mark-read/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversation: currentConversationId }),
        })
        if (!response.ok) {
          throw new Error('Impossible de mettre à jour les messages non lus.')
        }
      }

      try {
        await markMessagesRead()
      } catch (error) {
        setReadError(
          error instanceof Error
            ? error.message
            : 'Impossible de mettre à jour les messages non lus.',
        )
      }

      if (isCancelled) return
      const socket = new WebSocket(websocketUrl(currentConversationId), [
        'clerk',
        token,
      ])
      socketRef.current = socket

      socket.onopen = () => setStatus('Connecté')
      socket.onmessage = (event) => {
        const incomingMessage = JSON.parse(event.data) as ChatMessageEvent
        if (isMessageDeletedEvent(incomingMessage)) {
          setMessages((currentMessages) =>
            currentMessages.filter(
              (currentMessage) =>
                currentMessage.message_id !== incomingMessage.message_id,
            ),
          )
          return
        }
        if (isMessageEditedEvent(incomingMessage)) {
          setMessages((currentMessages) =>
            currentMessages.map((currentMessage) =>
              currentMessage.message_id === incomingMessage.message_id
                ? {
                    ...currentMessage,
                    content: incomingMessage.content,
                    edited_at: incomingMessage.edited_at,
                  }
                : currentMessage,
            ),
          )
          return
        }

        setMessages((currentMessages) => [...currentMessages, incomingMessage])
        if (!incomingMessage.is_mine) {
          void markMessagesRead().catch((error: unknown) => {
            setReadError(
              error instanceof Error
                ? error.message
                : 'Impossible de mettre à jour les messages non lus.',
            )
          })
        }
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

  async function deleteMessage(messageId: number) {
    setMessageError('')
    setDeletingMessageId(messageId)

    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')

      const response = await fetch(`${backendUrl}/api/messages/${messageId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error('Impossible de supprimer le message.')
      }

      setMessages((currentMessages) =>
        currentMessages.filter(
          (currentMessage) => currentMessage.message_id !== messageId,
        ),
      )
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Impossible de supprimer le message.',
      )
    } finally {
      setDeletingMessageId(null)
      setOpenMessageMenuId(null)
    }
  }

  async function saveEditedMessage(messageId: number) {
    const content = editingContent.trim()
    if (!content) {
      setMessageError('Le message ne peut pas être vide.')
      return
    }

    setMessageError('')
    setSavingMessageId(messageId)
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')

      const response = await fetch(`${backendUrl}/api/messages/${messageId}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) throw new Error('Impossible de modifier le message.')

      const updatedMessage = (await response.json()) as {
        content: string
        edited_at: string
      }
      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.message_id === messageId
            ? {
                ...currentMessage,
                content: updatedMessage.content,
                edited_at: updatedMessage.edited_at,
              }
            : currentMessage,
        ),
      )
      setEditingMessageId(null)
      setEditingContent('')
      setOpenMessageMenuId(null)
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Impossible de modifier le message.',
      )
    } finally {
      setSavingMessageId(null)
    }
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
          {readError && (
            <p className="chat-read-error" role="alert">
              {readError}
            </p>
          )}
          {messageError && (
            <p className="chat-read-error" role="alert">
              {messageError}
            </p>
          )}
          <div className="chat-messages">
            {messages.map((chatMessage, index) => (
              <article
                className={`chat-message${chatMessage.is_mine ? ' chat-message-own' : ''}`}
                key={`${chatMessage.message_id}-${index}`}
              >
                <strong>{chatMessage.sender_display_name}</strong>
                {editingMessageId === chatMessage.message_id ? (
                  <form
                    className="chat-edit-message"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveEditedMessage(chatMessage.message_id)
                    }}
                  >
                    <textarea
                      aria-label="Modifier le message"
                      value={editingContent}
                      onChange={(event) =>
                        setEditingContent(event.target.value)
                      }
                      rows={3}
                      autoFocus
                    />
                    <div>
                      <button type="submit" disabled={savingMessageId !== null}>
                        {savingMessageId === chatMessage.message_id
                          ? 'Enregistrement...'
                          : 'Enregistrer'}
                      </button>
                      <button
                        type="button"
                        disabled={savingMessageId !== null}
                        onClick={() => {
                          setEditingMessageId(null)
                          setEditingContent('')
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p>{chatMessage.content}</p>
                    {chatMessage.edited_at && (
                      <small className="chat-message-edited">(modifié)</small>
                    )}
                  </>
                )}
                {chatMessage.is_mine &&
                  editingMessageId !== chatMessage.message_id && (
                    <div className="chat-message-actions">
                      <button
                        className="chat-message-menu-button"
                        type="button"
                        aria-label="Actions sur le message"
                        aria-expanded={
                          openMessageMenuId === chatMessage.message_id
                        }
                        disabled={
                          deletingMessageId !== null || savingMessageId !== null
                        }
                        onClick={() =>
                          setOpenMessageMenuId((openId) =>
                            openId === chatMessage.message_id
                              ? null
                              : chatMessage.message_id,
                          )
                        }
                      >
                        ⋯
                      </button>
                      {openMessageMenuId === chatMessage.message_id &&
                        editingMessageId !== chatMessage.message_id && (
                          <div className="chat-message-menu">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(chatMessage.message_id)
                                setEditingContent(chatMessage.content)
                                setOpenMessageMenuId(null)
                                setMessageError('')
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              disabled={deletingMessageId !== null}
                              onClick={() =>
                                void deleteMessage(chatMessage.message_id)
                              }
                            >
                              {deletingMessageId === chatMessage.message_id
                                ? 'Suppression...'
                                : 'Supprimer'}
                            </button>
                          </div>
                        )}
                    </div>
                  )}
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
