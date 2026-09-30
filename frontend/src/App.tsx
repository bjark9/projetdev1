import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'

function App() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    {
      author: 'Maya',
      text: 'The new conversation feels really good. Less noise, more signal.',
      time: '09:41',
    },
    {
      author: 'You',
      text: 'That is exactly what we were hoping for.',
      time: '09:42',
    },
  ])

  const navigate = useNavigate()

  function startConversation() {
    navigate('/conversation')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return
    setMessages((currentMessages) => [
      ...currentMessages,
      { author: 'You', text: trimmedMessage, time: 'now' },
    ])
    setMessage('')
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
          <a href="#conversations">Conversations</a>
          <a href="#ritual">Our approach</a>
          <a href="#footer">About</a>
        </div>
        <>
        <header>
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton />
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </header>
        </>
      </nav>
      <section className="hero-section" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" /> A calmer place to talk
          </p>
          <h1>
            Make space for
            <br />
            <em>good</em> conversation.
          </h1>
          <p className="hero-description">
            Relay brings your people together in focused conversations made for
            ideas, decisions, and the little moments in between.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" onClick={startConversation}>
              Start a conversation <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#ritual">
              See how it works <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="proof-row">
            <div className="avatar-stack">
              <span className="avatar avatar-one">A</span>
              <span className="avatar avatar-two">J</span>
              <span className="avatar avatar-three">M</span>
              <span className="avatar avatar-four">+</span>
            </div>
            <span>
              Join 100000000000000000000000000000000000000000000000+ thoughtful
              teams
            </span>
          </div>
        </div>
        <div className="hero-visual" id="demo">
          <div className="visual-note note-top">
            in the conversation <strong>●</strong>
          </div>
          <div className="chat-window">
            <div className="chat-topbar">
              <div className="conversation-title">
                <span className="conversation-status" /> morning / studio
              </div>
              <button
                className="icon-button"
                aria-label="More conversation options"
              >
                •••
              </button>
            </div>
            <div className="chat-meta">
              <span>7 people</span>
              <span className="meta-divider" />{' '}
              <span className="meta-muted">private conversation</span>
            </div>
            <div className="message-list">
              {messages.map((chatMessage, index) => (
                <div
                  className={`message-row ${chatMessage.author === 'You' ? 'is-you' : ''}`}
                  key={`${chatMessage.time}-${index}`}
                >
                  <span className="message-avatar">
                    {chatMessage.author === 'You' ? 'Y' : 'M'}
                  </span>
                  <div className="message-content">
                    <div className="message-head">
                      <strong>{chatMessage.author}</strong>
                      <time>{chatMessage.time}</time>
                    </div>
                    <p>{chatMessage.text}</p>
                  </div>
                </div>
              ))}
              <div className="typing-row">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Maya is typing</span>
              </div>
            </div>
            <form className="composer" onSubmit={handleSubmit}>
              <input
                aria-label="Write a message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Say something..."
              />
              <button type="submit" aria-label="Send message">
                ↗
              </button>
            </form>
          </div>
          <div className="visual-note note-bottom">
            <span className="sparkle">✦</span> less noise, more signal
          </div>
        </div>
      </section>
      <section className="marquee" aria-label="Relay benefits">
        <div className="marquee-track">
          <span>Thoughtful by design</span>
          <b>✦</b>
          <span>Built for belonging</span>
          <b>✦</b>
          <span>Conversations that move</span>
          <b>✦</b>
          <span>Thoughtful by design</span>
          <b>✦</b>
        </div>
      </section>
      <section className="feature-section" id="conversations">
        <div className="section-intro">
          <p className="eyebrow">
            <span className="eyebrow-line" /> Made for humans
          </p>
          <h2>
            The internet is loud.
            <br />
            <em>Your conversation doesn't have to be.</em>
          </h2>
        </div>
        <div className="feature-grid">
          <article>
            <span className="feature-number">01</span>
            <h3>Gather with intention</h3>
            <p>
              Give every conversation a place to land. Create small, focused
              conversations that feel easy to return to.
            </p>
            <a
              className="arrow-link"
              href="#demo"
              aria-label="Explore gathering conversations"
            >
              ↗
            </a>
          </article>
          <article>
            <span className="feature-number">02</span>
            <h3>Stay in the moment</h3>
            <p>
              No feeds to chase or notifications to fear. Just the right people,
              at the right pace.
            </p>
            <a
              className="arrow-link"
              href="#demo"
              aria-label="Explore focused conversations"
            >
              ↗
            </a>
          </article>
          <article>
            <span className="feature-number">03</span>
            <h3>Leave with momentum</h3>
            <p>
              Turn a good exchange into a next step, without losing the texture
              that made it matter.
            </p>
            <a
              className="arrow-link"
              href="#demo"
              aria-label="Explore conversation momentum"
            >
              ↗
            </a>
          </article>
        </div>
      </section>
      <section className="ritual-section" id="ritual">
        <div className="ritual-stamp" aria-hidden="true">
          ✦<br />
          <small>
            relay
            <br />
            rituals
          </small>
        </div>
        <div>
          <p className="eyebrow">
            <span className="eyebrow-line" /> A better default
          </p>
          <h2>
            Come for the thought.
            <br />
            <em>Stay for the people.</em>
          </h2>
          <p className="ritual-copy">
            Relay is a softer kind of social space. One where the best part of a
            message is not how quickly it travels, but how deeply it lands.
          </p>
          <a className="button button-dark" href="#demo">
            Find your people <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
      <footer id="footer">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          relay<span className="brand-dot">.</span>
        </a>
        <span>© 2026 Relay Studio</span>
        <div className="footer-links">
          <a href="#conversations">Conversations</a>
          <a href="#ritual">Manifesto</a>
          <a href="#top">Contact</a>
        </div>
      </footer>
    </main>
  )
}

export default App
