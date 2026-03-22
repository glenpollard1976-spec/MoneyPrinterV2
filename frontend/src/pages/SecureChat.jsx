import { useState, useRef, useEffect } from 'react'
import { api } from '../api.js'

export default function SecureChat() {
  const [tab, setTab] = useState('chat')
  const [docs, setDocs] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const msgEnd = useRef()

  useEffect(() => { loadDocs() }, [])
  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadDocs() {
    try {
      const { documents } = await api.listDocuments()
      setDocs(documents || [])
    } catch {
      // not logged in — docs list requires auth; that's ok
    }
  }

  async function handleUpload(file) {
    if (!file || file.type !== 'application/pdf') {
      setError('Please select a valid PDF file.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const { document: doc } = await api.uploadPdf(file)
      setDocs((d) => [doc, ...d])
      setSelectedDoc(doc)
      setMessages([{ role: 'system', content: `Document "${doc.filename}" loaded. Ask me anything about it.` }])
      setTab('chat')
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || !selectedDoc) return
    const userMsg = { role: 'user', content: input.trim() }
    const history = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const { reply } = await api.chat(selectedDoc.id, userMsg.content, history)
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'system', content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this document?')) return
    try {
      await api.deleteDocument(id)
      setDocs((d) => d.filter((doc) => doc.id !== id))
      if (selectedDoc?.id === id) { setSelectedDoc(null); setMessages([]) }
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🔒 SecureChat</h1>
        <p>Upload a PDF and chat with it using AI-powered retrieval.</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>Upload PDF</button>
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Chat</button>
        <button className={`tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>My Documents</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'upload' && (
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]) }}
        >
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files[0])} />
          <div style={{ fontSize: '2.5rem' }}>📄</div>
          <h3 style={{ marginTop: '0.75rem' }}>Drop your PDF here</h3>
          <p>or click to browse · Max 10MB</p>
          {uploading && <div style={{ marginTop: '1rem' }}><span className="spinner spinner-dark" /></div>}
        </div>
      )}

      {tab === 'chat' && (
        <div>
          {!selectedDoc ? (
            <div className="empty">
              <div className="empty-icon">💬</div>
              <p>Upload a PDF first, or select one from My Documents.</p>
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem' }}>
                  <strong>{selectedDoc.filename}</strong>
                  {selectedDoc.pageCount && <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>{selectedDoc.pageCount} pages</span>}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedDoc(null); setMessages([]) }}>Clear</button>
              </div>
              <div className="chat-container">
                <div className="chat-messages">
                  {messages.length === 0 && (
                    <div className="msg msg-system">Document ready. Ask a question to get started.</div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-ai'}`}>
                      {m.content}
                    </div>
                  ))}
                  {loading && <div className="msg msg-ai"><span className="spinner spinner-dark" /></div>}
                  <div ref={msgEnd} />
                </div>
                <div className="chat-input-row">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask about your document..."
                    disabled={loading}
                  />
                  <button className="btn btn-primary" onClick={handleSend} disabled={loading || !input.trim()}>Send</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'docs' && (
        <div>
          {docs.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📁</div>
              <p>No documents yet. Upload a PDF to get started.</p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr><th>Filename</th><th>Pages</th><th>Chunks</th><th>Uploaded</th><th></th></tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedDoc(d); setMessages([]); setTab('chat') }}>
                          {d.filename}
                        </button>
                      </td>
                      <td>{d.pageCount ?? d.page_count ?? '—'}</td>
                      <td>{d.chunkCount ?? d.chunk_count ?? '—'}</td>
                      <td>{new Date(d.createdAt ?? d.created_at).toLocaleDateString()}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
