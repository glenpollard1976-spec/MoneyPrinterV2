# CrownworksNL Backend

Node.js/Express backend for [CrownworksNL Private AI Solutions](https://melodious-truffle-2f7d68.netlify.app/).

Provides server-side API proxying, persistent storage via Supabase, and optional user auth for all 6 frontend tools.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express.js |
| Database | Supabase (PostgreSQL + Storage) |
| Auth | Supabase Auth (magic link / email) |
| AI | Google Gemini 1.5 Flash (`@google/generative-ai`) |
| Embeddings | Gemini `text-embedding-004` (768-dim) |
| Vector search | Supabase `pgvector` |
| PDF parsing | `pdf-parse` |
| File uploads | `multer` → Supabase Storage |
| Process manager | PM2 (VPS) |
| Serverless | Netlify Functions (via `serverless-http`) |

---

## Project structure

```
backend/
├── src/
│   ├── index.js                    # Express app entry point
│   ├── config/
│   │   └── supabase.js             # Supabase admin + anon clients
│   ├── services/
│   │   └── gemini.js               # Gemini text generation + embeddings
│   ├── middleware/
│   │   ├── auth.js                 # Supabase JWT validation
│   │   └── upload.js               # Multer PDF upload handler
│   ├── routes/
│   │   ├── securechat.js           # PDF RAG chat
│   │   ├── provet.js               # Pet health log + AI vet
│   │   ├── geminiArchitect.js      # Prompt enhancer
│   │   ├── ironlog.js              # Trucker daily logs
│   │   ├── roiCalculator.js        # AI ROI calculator
│   │   └── aiAcademy.js            # AI education modules
│   └── db/
│       └── migrations/
│           └── 001_initial_schema.sql
├── netlify/
│   └── functions/
│       └── api.js                  # Netlify Functions adapter
├── ecosystem.config.js             # PM2 config
├── netlify.toml                    # Netlify build + redirect config
├── package.json
└── .env.example
```

---

## Quick start

### 1. Clone & install

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
```

### 3. Run Supabase migration

Open your Supabase project → SQL Editor, paste and run:
```
backend/src/db/migrations/001_initial_schema.sql
```

This creates all tables, enables `pgvector`, sets up RLS policies, and creates the `match_securechat_chunks` function.

### 4. Create Supabase Storage bucket

In your Supabase dashboard → Storage, create a bucket named `securechat-pdfs` (private).

### 5. Start development server

```bash
npm run dev
```

Server starts on `http://localhost:3001`.

---

## API Reference

### Health check
```
GET /health
→ { status: "ok", ts: "..." }
```

---

### SecureChat (`/api/securechat`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/upload` | optional | Upload PDF → extract text → chunk → embed → store |
| POST | `/chat` | optional | RAG chat with a document |
| GET | `/documents` | required | List user's documents |
| DELETE | `/documents/:id` | required | Delete document + chunks |

**POST `/upload`** — `multipart/form-data`
- Field: `file` (PDF, max 20 MB)
- Returns: `{ document: { id, filename, pageCount, chunkCount, createdAt } }`

**POST `/chat`** — `application/json`
```json
{
  "documentId": "uuid",
  "message": "What are the key terms?",
  "history": [
    { "role": "user", "parts": "Hello" },
    { "role": "model", "parts": "Hi! How can I help?" }
  ]
}
```
Returns: `{ reply, sourcesUsed, documentId }`

---

### ProVet Manager (`/api/provet`)

All routes require auth (`Authorization: Bearer <token>`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pets` | Create a pet |
| GET | `/pets` | List pets |
| GET | `/pets/:id` | Get pet |
| PUT | `/pets/:id` | Update pet |
| DELETE | `/pets/:id` | Delete pet |
| POST | `/pets/:id/logs` | Add health log (AI triage auto-generated) |
| GET | `/pets/:id/logs` | List health logs |
| DELETE | `/logs/:logId` | Delete log |
| POST | `/ask` | Free-form AI vet question |

---

### Gemini Architect (`/api/gemini-architect`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/enhance` | optional | Enhance a rough prompt |
| POST | `/save` | optional | Save an enhanced prompt |
| GET | `/history` | required | List saved prompts |
| DELETE | `/:id` | required | Delete a saved prompt |

**POST `/enhance`**
```json
{
  "input": "write me a blog post about AI",
  "goal": "drive newsletter signups",
  "tone": "professional but friendly",
  "format": "markdown",
  "model": "gemini-1.5-flash"
}
```

---

### IronLog (`/api/ironlog`)

All routes require auth.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/entries` | Create log entry (AI summary auto-generated) |
| GET | `/entries` | List entries (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) |
| GET | `/entries/:id` | Get single entry |
| PUT | `/entries/:id` | Update entry |
| DELETE | `/entries/:id` | Delete entry |
| POST | `/entries/:id/summary` | Regenerate AI summary |
| GET | `/stats` | Aggregate stats (miles, entry count) |

---

### ROI Calculator (`/api/roi`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/calculate` | optional | Calculate ROI + AI narrative |
| POST | `/save` | optional | Save a calculation |
| GET | `/history` | required | List saved calculations |
| DELETE | `/:id` | required | Delete a calculation |

**POST `/calculate`**
```json
{
  "company_name": "Acme Corp",
  "industry": "Logistics",
  "employees": 50,
  "hourly_rate": 35,
  "hours_saved_per_week": 10,
  "implementation_cost": 5000,
  "monthly_subscription": 99
}
```

---

### AI Academy (`/api/ai-academy`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/modules` | none | List all modules (`?level=beginner`) |
| GET | `/modules/:moduleId` | none | Get module details |
| POST | `/modules/:moduleId/chat` | none | AI tutor chat |
| POST | `/progress` | required | Save module progress / score |
| GET | `/progress` | required | Get all progress with module data |

---

## Deployment

### Option A — VPS with PM2

```bash
# On your VPS
git clone <repo>
cd backend
npm ci --omit=dev
cp .env.example .env && nano .env   # fill in secrets

# Start with PM2
npm run start:pm2 -- --env production

# Persist across reboots
pm2 save
pm2 startup
```

Expose port 3001 via Nginx reverse proxy:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option B — Netlify Functions

1. Copy `netlify.toml` to your repo root (or merge it).
2. Set all env vars in Netlify UI → Site configuration → Environment variables.
3. Push — Netlify builds and deploys the function automatically.

> **Note:** Netlify Functions have a 10-second timeout on the free plan. Large PDF uploads should use pre-signed Supabase Storage URLs in production to bypass this limit.

---

## Authentication flow (frontend integration)

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sign in (magic link)
await supabase.auth.signInWithOtp({ email: 'user@example.com' });

// Get token and attach to all API requests
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

fetch('https://your-backend/api/securechat/documents', {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## Security notes

- The Gemini API key is **never** sent to the browser — all AI calls happen server-side.
- Row Level Security (RLS) ensures users can only access their own data.
- The service role key is **only** used server-side and never exposed to clients.
- Rate limiting protects AI endpoints from abuse.
- Helmet adds security headers; CORS is locked to the Netlify frontend origin.
