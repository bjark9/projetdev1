import { Show, UserButton, useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import MembershipPanel from './MembershipPanel'
import type { ChatGroup } from './MembershipPanel'
import './ChatPage.css'
import ThemeToggle from './ThemeToggle'
import { debugError, debugLog } from './debug'

type ChatMessage = {
  message_id: number
  content: string
  sender_display_name: string
  created_at: string
  edited_at?: string | null
  is_mine: boolean
  attachments?: MessageAttachment[]
  reactions?: Record<string, number>
  is_pinned?: boolean
}

type MessageAttachment = {
  id: number
  filename: string
  content_type: string
  size: number
  download_url: string
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
  | ChatMessage
  | ChatMessageDeletedEvent
  | ChatMessageEditedEvent
  | { type: 'typing'; display_name: string }

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

function isTypingEvent(
  event: ChatMessageEvent,
): event is { type: 'typing'; display_name: string } {
  return 'type' in event && event.type === 'typing'
}

function formatMessageTime(date: string) {
  return new Intl.DateTimeFormat('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatMessageDay(date: string) {
  return new Intl.DateTimeFormat('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(date))
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
  attachments: MessageAttachment[]
  reactions: Record<string, number>
  is_pinned: boolean
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
  const navigate = useNavigate()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const socketRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null)
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
  const [search, setSearch] = useState('')
  const [typingUser, setTypingUser] = useState('')
  const typingTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const messagesContainer = messagesContainerRef.current
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }, [messages])

  function notifyTyping() {
    // Cet événement n'enregistre rien : il prévient seulement les autres membres.
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'typing' }))
    }
  }

  async function toggleReaction(messageId: number, emoji: string) {
    setMessageError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')

      const response = await fetch(
        `${backendUrl}/api/messages/${messageId}/react/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ emoji }),
        },
      )
      if (!response.ok) {
        throw new Error(
          `Impossible de mettre à jour la réaction (HTTP ${response.status}).`,
        )
      }

      const result = (await response.json()) as {
        emoji: string
        active: boolean
      }
      setMessages((current) =>
        current.map((item) => {
          if (item.message_id !== messageId) return item
          const reactions = { ...(item.reactions ?? {}) }
          reactions[result.emoji] = Math.max(
            0,
            (reactions[result.emoji] ?? 0) + (result.active ? 1 : -1),
          )
          return { ...item, reactions }
        }),
      )
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : 'Impossible de mettre à jour la réaction.',
      )
    }
  }

  async function togglePin(messageId: number) {
    const token = await getToken()
    if (!token) return
    const response = await fetch(
      `${backendUrl}/api/messages/${messageId}/pin/`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    if (!response.ok) return
    const result = (await response.json()) as { is_pinned: boolean }
    setMessages((current) =>
      current.map((item) =>
        item.message_id === messageId
          ? { ...item, is_pinned: result.is_pinned }
          : item,
      ),
    )
  }

  useEffect(() => {
    if (!conversationId || !isLoaded || !isSignedIn) return

    const currentConversationId = conversationId
    let isCancelled = false

    async function connect() {
      debugLog('Chat page: requesting Clerk token')
      const token = await getToken()
      if (!token || isCancelled) {
        debugLog('Chat page: Clerk token unavailable')
        setStatus('Connexion Clerk nécessaire')
        return
      }

      try {
        debugLog('Chat page: loading conversation and message history', {
          conversationId: currentConversationId,
        })
        const headers = { Authorization: `Bearer ${token}` }
        const [conversationResponse, historyResponse] = await Promise.all([
          fetch(`${backendUrl}/api/conversations/${currentConversationId}/`, {
            headers,
          }),
          fetch(
            `${backendUrl}/api/messages/?conversation=${currentConversationId}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
            { headers },
          ),
        ])
        if (!conversationResponse.ok || !historyResponse.ok) {
          debugLog('Chat page: API returned an error', {
            conversationStatus: conversationResponse.status,
            historyStatus: historyResponse.status,
          })
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
            attachments: item.attachments ?? [],
            reactions: item.reactions,
            is_pinned: item.is_pinned,
          })),
        )
        debugLog('Chat page: conversation and history loaded')
      } catch (error) {
        debugError('Chat page: loading failed', error)
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
      debugLog('Chat WebSocket: opening', {
        conversationId: currentConversationId,
      })
      socketRef.current = socket

      socket.onopen = () => {
        debugLog('Chat WebSocket: connected')
        setStatus('Connecté')
      }
      socket.onmessage = (event) => {
        debugLog('Chat WebSocket: message received')
        const incomingMessage = JSON.parse(event.data) as ChatMessageEvent
        if (isTypingEvent(incomingMessage)) {
          setTypingUser(incomingMessage.display_name)
          if (typingTimerRef.current)
            window.clearTimeout(typingTimerRef.current)
          typingTimerRef.current = window.setTimeout(
            () => setTypingUser(''),
            1500,
          )
          return
        }
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
      socket.onerror = (error) => {
        debugError('Chat WebSocket: error', error)
        setStatus('Erreur de connexion')
      }
      socket.onclose = (event) => {
        debugLog('Chat WebSocket: closed', {
          code: event.code,
          reason: event.reason,
        })
        setStatus('Déconnecté')
      }
    }

    void connect()

    return () => {
      isCancelled = true
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [conversationId, getToken, isLoaded, isSignedIn, search])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = message.trim()
    if (!content && !files.length) return

    setMessageError('')
    if (files.length) {
      setIsUploading(true)
      try {
        const token = await getToken()
        if (!token) throw new Error('Connexion Clerk nécessaire')

        const formData = new FormData()
        formData.append('conversation', conversationId ?? '')
        formData.append('content', content)
        files.forEach((file) => formData.append('files', file))

        const response = await fetch(`${backendUrl}/api/messages/upload/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        if (!response.ok) {
          throw new Error(
            'Impossible d’envoyer les fichiers. Taille maximale : 10 Mo par fichier et 25 Mo au total.',
          )
        }

        setMessage('')
        setFiles([])
        if (fileInputRef.current) fileInputRef.current.value = ''
      } catch (error) {
        setMessageError(
          error instanceof Error ? error.message : 'Impossible d’envoyer les fichiers.',
        )
      } finally {
        setIsUploading(false)
      }
      return
    }

    if (socketRef.current?.readyState !== WebSocket.OPEN) return

    debugLog('Chat: sending message')
    socketRef.current.send(JSON.stringify({ content }))
    setMessage('')
  }

  async function downloadAttachment(attachment: MessageAttachment) {
    setMessageError('')
    setDownloadingAttachmentId(attachment.id)
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(`${backendUrl}${attachment.download_url}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Impossible de télécharger le fichier.')

      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = attachment.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : 'Impossible de télécharger le fichier.',
      )
    } finally {
      setDownloadingAttachmentId(null)
    }
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
        <Link className="back-link" to="/conversation">
          ← Conversations
        </Link>
        <div className="chat-header-status">
          <span
            className={`status-dot status-${status === 'Connecté' ? 'online' : 'offline'}`}
          />
          {status}
        </div>
        <ThemeToggle />
        <Show when="signed-in">
          <div className="profile-menu">
            <span className="profile-label">Mon profil</span>
            <UserButton />
          </div>
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
          <div className="chat-messages" ref={messagesContainerRef}>
            <div className="chat-tools">
              {/* La recherche recharge uniquement les messages qui correspondent. */}
              <input
                aria-label="Rechercher dans les messages"
                placeholder="Rechercher dans les messages..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {messages.map((chatMessage, index) => (
              <div
                className="chat-message-row"
                key={`${chatMessage.message_id}-${index}`}
              >
                {(index === 0 ||
                  new Date(messages[index - 1].created_at).toDateString() !==
                    new Date(chatMessage.created_at).toDateString()) && (
                  <div className="chat-day-divider">
                    <span>{formatMessageDay(chatMessage.created_at)}</span>
                  </div>
                )}
                <article
                  className={`chat-message${chatMessage.is_mine ? ' chat-message-own' : ''}`}
                >
                  <div className="chat-message-header">
                    <strong>{chatMessage.sender_display_name}</strong>
                    {chatMessage.is_pinned && (
                      <span title="Message épinglé">📌</span>
                    )}
                    <time dateTime={chatMessage.created_at}>
                      {formatMessageTime(chatMessage.created_at)}
                    </time>
                  </div>
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
                        <button
                          type="submit"
                          disabled={savingMessageId !== null}
                        >
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
                      {chatMessage.content && <p>{chatMessage.content}</p>}
                      {!!chatMessage.attachments?.length && (
                        <ul className="chat-attachments">
                          {chatMessage.attachments.map((attachment) => (
                            <li key={attachment.id}>
                              <button
                                type="button"
                                disabled={downloadingAttachmentId === attachment.id}
                                onClick={() => void downloadAttachment(attachment)}
                              >
                                {downloadingAttachmentId === attachment.id
                                  ? 'Téléchargement...'
                                  : `${attachment.filename} (${formatFileSize(attachment.size)})`}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {chatMessage.edited_at && (
                        <small className="chat-message-edited">(modifié)</small>
                      )}
                    </>
                  )}
                  <div className="chat-message-reactions">
                    {/* Les cinq emojis proposés évitent de devoir créer un sélecteur complexe. */}
                    {['👍', '❤️', '😂', '🎉', '👀'].map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() =>
                          void toggleReaction(chatMessage.message_id, emoji)
                        }
                      >
                        {emoji} {chatMessage.reactions?.[emoji] ?? ''}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void togglePin(chatMessage.message_id)}
                    >
                      {chatMessage.is_pinned ? 'Désépingler' : 'Épingler'}
                    </button>
                  </div>
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
                            deletingMessageId !== null ||
                            savingMessageId !== null
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
              </div>
            ))}
            {typingUser && (
              <p className="typing-indicator">{typingUser} écrit...</p>
            )}
          </div>
          <form className="chat-composer" onSubmit={sendMessage}>
            <label className="chat-file-picker">
              Joindre
              <input
                ref={fileInputRef}
                aria-label="Joindre des fichiers"
                type="file"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </label>
            <input
              aria-label="Message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                notifyTyping()
              }}
              placeholder="Écrire un message..."
            />
            <button type="submit" disabled={isUploading}>
              {isUploading ? 'Envoi...' : 'Envoyer'}
            </button>
          </form>
        </section>
        {conversation && (
          <MembershipPanel
            group={conversation.group}
            conversationId={conversation.id}
            onGroupDeleted={() => navigate('/conversation', { replace: true })}
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

function formatFileSize(size: number) {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

export default ChatPage
