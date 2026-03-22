import { useState, useEffect } from 'react'
import { api } from '../api.js'

const SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Horse', 'Other']
const LOG_TYPES = ['Symptom', 'Medication', 'Vaccination', 'Injury', 'Checkup', 'Other']
const SEVERITIES = ['Low', 'Medium', 'High', 'Emergency']

export default function ProVet() {
  const [tab, setTab] = useState('pets')
  const [pets, setPets] = useState([])
  const [selectedPet, setSelectedPet] = useState(null)
  const [logs, setLogs] = useState([])
  const [showPetForm, setShowPetForm] = useState(false)
  const [petForm, setPetForm] = useState({ name: '', species: 'Dog', breed: '', age_years: '', weight_kg: '', notes: '' })
  const [logForm, setLogForm] = useState({ log_type: 'Symptom', description: '', severity: 'Low' })
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const token = localStorage.getItem('cnl_token') || ''

  useEffect(() => { loadPets() }, [])
  useEffect(() => { if (selectedPet) loadLogs(selectedPet.id) }, [selectedPet])

  async function loadPets() {
    try { const { pets } = await api.listPets(token); setPets(pets || []) }
    catch { /* auth required */ }
  }

  async function loadLogs(id) {
    try { const { logs } = await api.getLogs(id, token); setLogs(logs || []) }
    catch (e) { setError(e.message) }
  }

  async function savePet(e) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const body = { ...petForm, age_years: petForm.age_years ? +petForm.age_years : null, weight_kg: petForm.weight_kg ? +petForm.weight_kg : null }
      const { pet } = await api.createPet(body, token)
      setPets((p) => [pet, ...p])
      setShowPetForm(false)
      setPetForm({ name: '', species: 'Dog', breed: '', age_years: '', weight_kg: '', notes: '' })
      setSuccess('Pet added!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function deletePet(id) {
    if (!confirm('Delete this pet?')) return
    try { await api.deletePet(id, token); setPets((p) => p.filter((x) => x.id !== id)); if (selectedPet?.id === id) setSelectedPet(null) }
    catch (e) { setError(e.message) }
  }

  async function addLog(e) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { log } = await api.addLog(selectedPet.id, logForm, token)
      setLogs((l) => [log, ...l])
      setLogForm({ log_type: 'Symptom', description: '', severity: 'Low' })
      setSuccess('Log added!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function deleteLog(id) {
    try { await api.deleteLog(id, token); setLogs((l) => l.filter((x) => x.id !== id)) }
    catch (e) { setError(e.message) }
  }

  async function askVet(e) {
    e.preventDefault(); if (!question.trim()) return
    setLoading(true); setAnswer(''); setError('')
    try {
      const { answer: a } = await api.vetAsk(question, selectedPet?.id, token)
      setAnswer(a)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const severity = { Low: 'badge-success', Medium: 'badge-warn', High: 'badge-warn', Emergency: 'badge-danger' }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🐾 ProVet Manager</h1>
        <p>Track your pets' health with AI-powered triage and veterinary guidance.</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'pets' ? 'active' : ''}`} onClick={() => setTab('pets')}>My Pets</button>
        <button className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Health Logs</button>
        <button className={`tab ${tab === 'ask' ? 'active' : ''}`} onClick={() => setTab('ask')}>Ask AI Vet</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {tab === 'pets' && (
        <div>
          <div className="section-header">
            <h2>Pets</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowPetForm((v) => !v)}>
              {showPetForm ? 'Cancel' : '+ Add Pet'}
            </button>
          </div>

          {showPetForm && (
            <form className="card" onSubmit={savePet} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>New Pet</h3>
              <div className="form-row">
                <div className="form-group"><label>Name *</label><input required value={petForm.name} onChange={(e) => setPetForm({ ...petForm, name: e.target.value })} /></div>
                <div className="form-group"><label>Species *</label>
                  <select value={petForm.species} onChange={(e) => setPetForm({ ...petForm, species: e.target.value })}>
                    {SPECIES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Breed</label><input value={petForm.breed} onChange={(e) => setPetForm({ ...petForm, breed: e.target.value })} /></div>
                <div className="form-group"><label>Age (years)</label><input type="number" min="0" value={petForm.age_years} onChange={(e) => setPetForm({ ...petForm, age_years: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Weight (kg)</label><input type="number" min="0" step="0.1" value={petForm.weight_kg} onChange={(e) => setPetForm({ ...petForm, weight_kg: e.target.value })} /></div>
                <div className="form-group"><label>Notes</label><input value={petForm.notes} onChange={(e) => setPetForm({ ...petForm, notes: e.target.value })} /></div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner" /> : 'Save Pet'}</button>
            </form>
          )}

          {pets.length === 0 ? (
            <div className="empty"><div className="empty-icon">🐶</div><p>No pets added yet.</p></div>
          ) : (
            <div className="card-grid">
              {pets.map((p) => (
                <div key={p.id} className={`card ${selectedPet?.id === p.id ? 'active' : ''}`} style={{ cursor: 'pointer', borderColor: selectedPet?.id === p.id ? 'var(--accent)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3>{p.name}</h3>
                    <button className="btn btn-danger btn-sm" onClick={() => deletePet(p.id)}>✕</button>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.species}{p.breed ? ` · ${p.breed}` : ''}{p.age_years ? ` · ${p.age_years}yr` : ''}{p.weight_kg ? ` · ${p.weight_kg}kg` : ''}</p>
                  {p.notes && <p style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>{p.notes}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedPet(p); setTab('logs') }}>View Logs</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedPet(p); setTab('ask') }}>Ask Vet</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          {!selectedPet ? (
            <div className="empty"><div className="empty-icon">📋</div><p>Select a pet from the Pets tab first.</p></div>
          ) : (
            <>
              <div className="section-header">
                <h2>Logs for {selectedPet.name}</h2>
              </div>
              <form className="card" onSubmit={addLog} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Add Log Entry</h3>
                <div className="form-row">
                  <div className="form-group"><label>Type</label>
                    <select value={logForm.log_type} onChange={(e) => setLogForm({ ...logForm, log_type: e.target.value })}>
                      {LOG_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Severity</label>
                    <select value={logForm.severity} onChange={(e) => setLogForm({ ...logForm, severity: e.target.value })}>
                      {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group"><label>Description *</label>
                  <textarea required value={logForm.description} onChange={(e) => setLogForm({ ...logForm, description: e.target.value })} placeholder="Describe what you observed..." />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner" /> : 'Add Log + AI Triage'}</button>
              </form>

              {logs.length === 0 ? (
                <div className="empty"><div className="empty-icon">📝</div><p>No health logs yet.</p></div>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="card" style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className="badge badge-info">{l.log_type}</span>
                        <span className={`badge ${severity[l.severity] || 'badge-info'}`}>{l.severity}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(l.created_at).toLocaleDateString()}</span>
                    </div>
                    <p style={{ marginBottom: '0.5rem' }}>{l.description}</p>
                    {l.ai_response && (
                      <div className="narrative" style={{ marginTop: '0.75rem' }}>
                        <strong style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--accent-light)' }}>AI Triage</strong>
                        {l.ai_response}
                      </div>
                    )}
                    <button className="btn btn-danger btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => deleteLog(l.id)}>Delete</button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      {tab === 'ask' && (
        <div>
          <div className="section-header">
            <h2>Ask the AI Vet</h2>
            {selectedPet && <span className="badge badge-info">Context: {selectedPet.name}</span>}
          </div>
          {!selectedPet && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>Tip: select a pet from the Pets tab to include their profile in the question.</div>}
          <form className="card" onSubmit={askVet}>
            <div className="form-group">
              <label>Your Question</label>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. My dog has been limping since this morning, what should I do?" style={{ minHeight: '120px' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading || !question.trim()}>{loading ? <><span className="spinner" /> Thinking...</> : 'Ask AI Vet'}</button>
          </form>
          {answer && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>AI Vet Response</h3>
              <div className="narrative">{answer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
