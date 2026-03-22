import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

export default function AiAcademy() {
  const [modules, setModules] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const msgEnd = useRef()

  const token = localStorage.getItem('cnl_token') || ''

  useEffect(() => { loadModules() }, [])
  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadModules() {
    try { const { modules } = await api.listModules(token); setModules(modules || []) }
    catch { /* ok */ }
  }

  function selectModule(m) {
    setSelected(m)
    setMessages([{ role: 'system', content: `Now studying: "${m.title}". Ask me anything about this module!` }])
  }

  async function send() {
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input.trim() }
    const history = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const { reply } = await api.tutorChat(selected?.id, userMsg.content, history, token)
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'system', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🎓 AI Academy</h1>
        <p>Browse learning modules and chat with an AI tutor to accelerate your skills.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Sidebar */}
        <div>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modules</h3>
          {modules.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📚</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No modules found.<br />Connect your account to view modules.</p>
            </div>
          ) : (
            modules.map((m) => (
              <div
                key={m.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  marginBottom: '0.5rem',
                  borderColor: selected?.id === m.id ? 'var(--accent)' : undefined,
                  background: selected?.id === m.id ? 'var(--accent-bg)' : undefined,
                }}
                onClick={() => selectModule(m)}
              >
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>{m.title}</h3>
                {m.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.description}</p>}
                {m.difficulty && <span className="badge badge-info" style={{ marginTop: '0.4rem' }}>{m.difficulty}</span>}
              </div>
            ))
          )}

          {/* Free-form chat without a module */}
          <div
            className="card"
            style={{ cursor: 'pointer', marginTop: '0.5rem', borderColor: !selected && messages.length > 0 ? 'var(--accent)' : undefined }}
            onClick={() => { setSelected(null); setMessages([{ role: 'system', content: 'AI Tutor ready. Ask me anything about AI, automation, or tech!' }]) }}
          >
            <h3 style={{ fontSize: '0.9rem' }}>💬 Free Chat</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ask anything about AI & automation</p>
          </div>
        </div>

        {/* Chat panel */}
        <div>
          {messages.length === 0 ? (
            <div className="empty" style={{ paddingTop: '4rem' }}>
              <div className="empty-icon">🤖</div>
              <p>Select a module or start a free chat to begin.</p>
            </div>
          ) : (
            <div>
              <div className="chat-messages" style={{ height: '480px' }}>
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-ai'}`}>
                    {m.content}
                  </div>
                ))}
                {loading && <div className="msg msg-ai"><span className="spinner spinner-dark" /></div>}
                <div ref={msgEnd} />
              </div>
              <div className="chat-input-row" style={{ marginTop: '0.75rem' }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask your AI tutor..."
                  disabled={loading}
                />
                <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>Send</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
