import { useState, useEffect } from 'react'
import { api } from '../api.js'

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = () => ({
  entry_date: today(),
  start_time: '',
  end_time: '',
  odometer_start: '',
  odometer_end: '',
  route_from: '',
  route_to: '',
  cargo_description: '',
  notes: '',
})

export default function IronLog() {
  const [tab, setTab] = useState('log')
  const [entries, setEntries] = useState([])
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const token = localStorage.getItem('cnl_token') || ''

  useEffect(() => { loadEntries(); loadStats() }, [])

  async function loadEntries() {
    setLoading(true)
    try { const { entries } = await api.listEntries({}, token); setEntries(entries || []) }
    catch { /* auth required */ }
    finally { setLoading(false) }
  }

  async function loadStats() {
    try { const s = await api.getStats({}, token); setStats(s) }
    catch { /* ok */ }
  }

  function field(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true); setError('')
    try {
      const body = { ...form }
      if (body.odometer_start) body.odometer_start = +body.odometer_start
      if (body.odometer_end) body.odometer_end = +body.odometer_end
      const { entry } = await api.createEntry(body, token)
      setEntries((prev) => [entry, ...prev])
      setForm(emptyForm())
      setSuccess('Log entry saved with AI summary!')
      loadStats()
    } catch (e) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this log entry?')) return
    try { await api.deleteEntry(id, token); setEntries((e) => e.filter((x) => x.id !== id)); loadStats() }
    catch (e) { setError(e.message) }
  }

  const miles = (e) => e.odometer_end && e.odometer_start ? e.odometer_end - e.odometer_start : null

  return (
    <div className="page">
      <div className="page-header">
        <h1>🚛 IronLog</h1>
        <p>Daily trucking logs with automatic AI summaries and compliance tracking.</p>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value">{stats.entryCount}</div><div className="stat-label">Total Logs</div></div>
          <div className="stat-card"><div className="stat-value">{stats.totalMiles?.toLocaleString()}</div><div className="stat-label">Total Miles</div></div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>New Log</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {tab === 'log' && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginBottom: '1rem' }}>New Log Entry</h3>
          <div className="form-row">
            <div className="form-group"><label>Date *</label><input required type="date" value={form.entry_date} onChange={field('entry_date')} /></div>
            <div className="form-group"><label>Start Time</label><input type="time" value={form.start_time} onChange={field('start_time')} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>End Time</label><input type="time" value={form.end_time} onChange={field('end_time')} /></div>
            <div className="form-group"><label>Cargo</label><input value={form.cargo_description} onChange={field('cargo_description')} placeholder="e.g. Lumber, 4,000 lbs" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Route From</label><input value={form.route_from} onChange={field('route_from')} placeholder="e.g. St. John's" /></div>
            <div className="form-group"><label>Route To</label><input value={form.route_to} onChange={field('route_to')} placeholder="e.g. Gander" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Odometer Start (mi)</label><input type="number" value={form.odometer_start} onChange={field('odometer_start')} /></div>
            <div className="form-group"><label>Odometer End (mi)</label><input type="number" value={form.odometer_end} onChange={field('odometer_end')} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={field('notes')} placeholder="Any incidents, delays, or observations..." /></div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Saving + generating AI summary...</> : 'Save Log Entry'}
          </button>
        </form>
      )}

      {tab === 'history' && (
        <div>
          {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner spinner-dark" /></div>}
          {!loading && entries.length === 0 && (
            <div className="empty"><div className="empty-icon">📋</div><p>No log entries yet.</p></div>
          )}
          {entries.map((e) => (
            <div key={e.id} className="card" style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{e.entry_date}</strong>
                  {e.route_from && e.route_to && <span style={{ color: 'var(--text-muted)', marginLeft: '0.75rem', fontSize: '0.875rem' }}>{e.route_from} → {e.route_to}</span>}
                  {miles(e) && <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>{miles(e)} mi</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    {expandedId === e.id ? 'Hide' : 'Details'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteEntry(e.id)}>✕</button>
                </div>
              </div>
              {expandedId === e.id && (
                <div style={{ marginTop: '0.75rem' }}>
                  {e.cargo_description && <p style={{ fontSize: '0.875rem', marginBottom: '0.4rem' }}><strong>Cargo:</strong> {e.cargo_description}</p>}
                  {e.start_time && <p style={{ fontSize: '0.875rem', marginBottom: '0.4rem' }}><strong>Hours:</strong> {e.start_time} – {e.end_time || '?'}</p>}
                  {e.notes && <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}><strong>Notes:</strong> {e.notes}</p>}
                  {e.ai_summary && (
                    <div className="narrative">
                      <strong style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--accent-light)' }}>AI Summary</strong>
                      {e.ai_summary}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
