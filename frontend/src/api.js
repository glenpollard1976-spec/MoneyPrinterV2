const BASE = import.meta.env.VITE_API_URL || 'https://crownworksnl-backend.onrender.com'

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function get(path, token) { return request('GET', path, null, token) }
function post(path, body, token) { return request('POST', path, body, token) }
function put(path, body, token) { return request('PUT', path, body, token) }
function del(path, token) { return request('DELETE', path, null, token) }

async function uploadPdf(file, token) {
  const form = new FormData()
  form.append('pdf', file)
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/api/securechat/upload`, { method: 'POST', headers, body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  // SecureChat
  uploadPdf,
  listDocuments: (token) => get('/api/securechat/documents', token),
  deleteDocument: (id, token) => del(`/api/securechat/documents/${id}`, token),
  chat: (documentId, message, history, token) =>
    post('/api/securechat/chat', { documentId, message, history }, token),

  // ProVet
  listPets: (token) => get('/api/provet/pets', token),
  createPet: (data, token) => post('/api/provet/pets', data, token),
  updatePet: (id, data, token) => put(`/api/provet/pets/${id}`, data, token),
  deletePet: (id, token) => del(`/api/provet/pets/${id}`, token),
  getLogs: (petId, token) => get(`/api/provet/pets/${petId}/logs`, token),
  addLog: (petId, data, token) => post(`/api/provet/pets/${petId}/logs`, data, token),
  deleteLog: (logId, token) => del(`/api/provet/logs/${logId}`, token),
  vetAsk: (question, petId, token) => post('/api/provet/ask', { question, petId }, token),

  // Gemini Architect
  enhancePrompt: (prompt, context, token) =>
    post('/api/gemini-architect/enhance', { prompt, context }, token),
  listPrompts: (token) => get('/api/gemini-architect/history', token),

  // IronLog
  createEntry: (data, token) => post('/api/ironlog/entries', data, token),
  listEntries: (params, token) => {
    const q = new URLSearchParams(params).toString()
    return get(`/api/ironlog/entries${q ? '?' + q : ''}`, token)
  },
  updateEntry: (id, data, token) => put(`/api/ironlog/entries/${id}`, data, token),
  deleteEntry: (id, token) => del(`/api/ironlog/entries/${id}`, token),
  getStats: (params, token) => {
    const q = new URLSearchParams(params).toString()
    return get(`/api/ironlog/stats${q ? '?' + q : ''}`, token)
  },

  // ROI
  calculateRoi: (data) => post('/api/roi/calculate', data),
  saveRoi: (data, token) => post('/api/roi/save', data, token),
  roiHistory: (token) => get('/api/roi/history', token),

  // AI Academy
  listModules: (token) => get('/api/ai-academy/modules', token),
  getModule: (id, token) => get(`/api/ai-academy/modules/${id}`, token),
  tutorChat: (moduleId, message, history, token) =>
    post('/api/ai-academy/chat', { moduleId, message, history }, token),
}
