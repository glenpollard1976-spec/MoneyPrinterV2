import { useState } from 'react'
import { api } from '../api.js'

export default function GeminiArchitect() {
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function enhance(e) {
    e.preventDefault()
    if (!prompt.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const data = await api.enhancePrompt(prompt, context)
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function copy(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>✨ Gemini Architect</h1>
        <p>Refine and enhance your AI prompts for better results.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="card" onSubmit={enhance}>
        <div className="form-group">
          <label>Your Prompt *</label>
          <textarea
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter the prompt you want to improve..."
            style={{ minHeight: '140px' }}
          />
        </div>
        <div className="form-group">
          <label>Context / Goal (optional)</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="What is this prompt for? Who is the audience? Any constraints?"
            style={{ minHeight: '80px' }}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading || !prompt.trim()}>
          {loading ? <><span className="spinner" /> Enhancing...</> : '✨ Enhance Prompt'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="section-header">
            <h2>Enhanced Prompt</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => copy(result.enhanced || result.result || '')}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <div className="narrative">{result.enhanced || result.result || JSON.stringify(result, null, 2)}</div>

          {result.explanation && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Why these changes?</h3>
              <p style={{ fontSize: '0.9rem' }}>{result.explanation}</p>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setPrompt(result.enhanced || result.result || ''); setResult(null) }}>
              Use as new prompt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
