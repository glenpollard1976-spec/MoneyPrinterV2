-- ============================================================
-- CrownworksNL Backend — Initial Schema Migration
-- Run this against your Supabase project via the SQL editor
-- or the Supabase CLI: supabase db push
-- ============================================================

-- Enable pgvector for embeddings-based similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- SecureChat
-- ============================================================

CREATE TABLE IF NOT EXISTS securechat_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  file_path    TEXT,
  file_size    INTEGER,
  page_count   INTEGER,
  chunk_count  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS securechat_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES securechat_documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  -- text-embedding-004 outputs 768-dimension vectors
  embedding    vector(768),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for approximate nearest-neighbour search on embeddings
CREATE INDEX IF NOT EXISTS securechat_chunks_embedding_idx
  ON securechat_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- ProVet Manager
-- ============================================================

CREATE TABLE IF NOT EXISTS provet_pets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  species     TEXT NOT NULL,
  breed       TEXT,
  age_years   NUMERIC(4,1),
  weight_kg   NUMERIC(6,2),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provet_health_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       UUID NOT NULL REFERENCES provet_pets(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'observation' | 'medication' | 'appointment' | 'symptom' | 'emergency'
  log_type     TEXT NOT NULL,
  description  TEXT NOT NULL,
  -- 'low' | 'medium' | 'high' | 'emergency'
  severity     TEXT,
  ai_response  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- IronLog
-- ============================================================

CREATE TABLE IF NOT EXISTS ironlog_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date          DATE NOT NULL,
  start_time          TEXT,
  end_time            TEXT,
  odometer_start      INTEGER,
  odometer_end        INTEGER,
  cargo_description   TEXT,
  route_from          TEXT,
  route_to            TEXT,
  notes               TEXT,
  ai_summary          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROI Calculator
-- ============================================================

CREATE TABLE IF NOT EXISTS roi_calculations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES auth.users(id),
  company_name            TEXT,
  industry                TEXT,
  employees               INTEGER,
  hourly_rate             NUMERIC(10,2),
  hours_saved_per_week    NUMERIC(8,2),
  implementation_cost     NUMERIC(12,2),
  monthly_subscription    NUMERIC(10,2),
  calculated_roi          NUMERIC(8,2),
  payback_months          NUMERIC(6,1),
  annual_savings          NUMERIC(12,2),
  notes                   TEXT,
  ai_narrative            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI Academy
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_academy_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id     TEXT NOT NULL,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  score         INTEGER,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, module_id)
);

-- ============================================================
-- Gemini Architect
-- ============================================================

CREATE TABLE IF NOT EXISTS gemini_architect_prompts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id),
  title            TEXT,
  original_input   TEXT NOT NULL,
  enhanced_prompt  TEXT NOT NULL,
  model_used       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE securechat_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE securechat_chunks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE provet_pets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE provet_health_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ironlog_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_calculations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_academy_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_architect_prompts  ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own rows
CREATE POLICY "securechat_documents_owner" ON securechat_documents
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "securechat_chunks_owner" ON securechat_chunks
  FOR ALL USING (
    document_id IN (
      SELECT id FROM securechat_documents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "provet_pets_owner" ON provet_pets
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "provet_health_logs_owner" ON provet_health_logs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "ironlog_entries_owner" ON ironlog_entries
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "roi_calculations_owner" ON roi_calculations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "ai_academy_progress_owner" ON ai_academy_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "gemini_architect_prompts_owner" ON gemini_architect_prompts
  FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================
-- Helper function: match_securechat_chunks
-- Used for vector similarity search in SecureChat RAG
-- ============================================================

CREATE OR REPLACE FUNCTION match_securechat_chunks(
  query_embedding   vector(768),
  match_document_id UUID,
  match_count       INT DEFAULT 5
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  chunk_index INTEGER,
  similarity  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.content,
    sc.chunk_index,
    1 - (sc.embedding <=> query_embedding) AS similarity
  FROM securechat_chunks sc
  WHERE sc.document_id = match_document_id
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
