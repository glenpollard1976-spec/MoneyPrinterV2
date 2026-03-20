/**
 * IronLog routes — offline-first trucker daily logs with AI summaries
 *
 * POST   /api/ironlog/entries             — create a log entry
 * GET    /api/ironlog/entries             — list entries (filterable by date range)
 * GET    /api/ironlog/entries/:id         — get single entry
 * PUT    /api/ironlog/entries/:id         — update entry
 * DELETE /api/ironlog/entries/:id         — delete entry
 * POST   /api/ironlog/entries/:id/summary — (re)generate AI summary for an entry
 * GET    /api/ironlog/stats               — aggregate stats (distance, hours, etc.)
 */

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { generateText } = require('../services/gemini');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

function ownerCheck(record, userId, res) {
  if (!record) { res.status(404).json({ error: 'Not found' }); return false; }
  if (record.user_id !== userId) { res.status(403).json({ error: 'Access denied' }); return false; }
  return true;
}

async function buildAiSummary(entry) {
  const distanceMiles = entry.odometer_end && entry.odometer_start
    ? entry.odometer_end - entry.odometer_start
    : null;

  const prompt = `You are an AI assistant helping a truck driver summarise their daily log.
Generate a concise, professional summary (2-4 sentences) of the following log entry:

Date: ${entry.entry_date}
Start time: ${entry.start_time ?? 'N/A'}
End time: ${entry.end_time ?? 'N/A'}
Route: ${entry.route_from ?? '?'} → ${entry.route_to ?? '?'}
Distance driven: ${distanceMiles !== null ? `${distanceMiles} miles` : 'unknown'}
Cargo: ${entry.cargo_description ?? 'Not specified'}
Notes: ${entry.notes ?? 'None'}

Return only the summary text.`;

  return generateText(prompt, { temperature: 0.3, maxOutputTokens: 256 });
}

// ── POST /api/ironlog/entries ─────────────────────────────────────────────────

router.post('/entries', async (req, res) => {
  const {
    entry_date,
    start_time,
    end_time,
    odometer_start,
    odometer_end,
    cargo_description,
    route_from,
    route_to,
    notes,
  } = req.body;

  if (!entry_date) {
    return res.status(400).json({ error: 'entry_date is required (YYYY-MM-DD)' });
  }

  // Auto-generate AI summary if we have enough data
  let ai_summary = null;
  try {
    ai_summary = await buildAiSummary({
      entry_date, start_time, end_time, odometer_start, odometer_end,
      cargo_description, route_from, route_to, notes,
    });
  } catch (e) {
    console.error('IronLog AI summary failed:', e.message);
  }

  const { data, error } = await supabaseAdmin
    .from('ironlog_entries')
    .insert({
      user_id: req.user.id,
      entry_date,
      start_time,
      end_time,
      odometer_start,
      odometer_end,
      cargo_description,
      route_from,
      route_to,
      notes,
      ai_summary,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create entry', detail: error.message });
  return res.status(201).json({ entry: data });
});

// ── GET /api/ironlog/entries ──────────────────────────────────────────────────

router.get('/entries', async (req, res) => {
  const { from, to, limit = '50', offset = '0' } = req.query;
  const limitNum = Math.min(parseInt(limit, 10), 200);
  const offsetNum = parseInt(offset, 10);

  let query = supabaseAdmin
    .from('ironlog_entries')
    .select('*')
    .eq('user_id', req.user.id)
    .order('entry_date', { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (from) query = query.gte('entry_date', from);
  if (to) query = query.lte('entry_date', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch entries' });
  return res.json({ entries: data });
});

// ── GET /api/ironlog/entries/:id ──────────────────────────────────────────────

router.get('/entries/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('ironlog_entries')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !ownerCheck(data, req.user.id, res)) return;
  return res.json({ entry: data });
});

// ── PUT /api/ironlog/entries/:id ──────────────────────────────────────────────

router.put('/entries/:id', async (req, res) => {
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('ironlog_entries')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !ownerCheck(existing, req.user.id, res)) return;

  const {
    entry_date, start_time, end_time,
    odometer_start, odometer_end, cargo_description,
    route_from, route_to, notes,
  } = req.body;

  const { data, error } = await supabaseAdmin
    .from('ironlog_entries')
    .update({
      entry_date, start_time, end_time,
      odometer_start, odometer_end, cargo_description,
      route_from, route_to, notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update entry' });
  return res.json({ entry: data });
});

// ── DELETE /api/ironlog/entries/:id ──────────────────────────────────────────

router.delete('/entries/:id', async (req, res) => {
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('ironlog_entries')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !ownerCheck(existing, req.user.id, res)) return;

  const { error } = await supabaseAdmin.from('ironlog_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to delete entry' });
  return res.json({ success: true });
});

// ── POST /api/ironlog/entries/:id/summary ────────────────────────────────────

router.post('/entries/:id/summary', async (req, res) => {
  const { data: entry, error: fetchErr } = await supabaseAdmin
    .from('ironlog_entries')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !ownerCheck(entry, req.user.id, res)) return;

  try {
    const ai_summary = await buildAiSummary(entry);

    const { data, error } = await supabaseAdmin
      .from('ironlog_entries')
      .update({ ai_summary, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save summary' });
    return res.json({ entry: data });
  } catch (err) {
    console.error('AI summary error:', err);
    return res.status(500).json({ error: 'Failed to generate AI summary' });
  }
});

// ── GET /api/ironlog/stats ────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const { from, to } = req.query;

  let query = supabaseAdmin
    .from('ironlog_entries')
    .select('entry_date, odometer_start, odometer_end, start_time, end_time')
    .eq('user_id', req.user.id);

  if (from) query = query.gte('entry_date', from);
  if (to) query = query.lte('entry_date', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch stats' });

  const totalMiles = data.reduce((sum, e) => {
    if (e.odometer_start != null && e.odometer_end != null) {
      return sum + (e.odometer_end - e.odometer_start);
    }
    return sum;
  }, 0);

  return res.json({
    entryCount: data.length,
    totalMiles,
    periodFrom: from ?? null,
    periodTo: to ?? null,
  });
});

module.exports = router;
