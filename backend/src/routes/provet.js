/**
 * ProVet Manager routes
 *
 * Pets
 *   POST   /api/provet/pets              — create a pet
 *   GET    /api/provet/pets              — list user's pets
 *   GET    /api/provet/pets/:id          — get single pet
 *   PUT    /api/provet/pets/:id          — update pet
 *   DELETE /api/provet/pets/:id          — delete pet
 *
 * Health logs
 *   POST   /api/provet/pets/:id/logs     — add health log entry (AI triage included)
 *   GET    /api/provet/pets/:id/logs     — list logs for a pet
 *   DELETE /api/provet/logs/:logId       — delete a log entry
 *
 * AI Vet agent
 *   POST   /api/provet/ask               — free-form AI vet question (no pet required)
 */

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { generateText } = require('../services/gemini');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All ProVet routes require authentication
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

function ownershipGuard(record, userId, res) {
  if (!record) {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  if (record.user_id !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

async function generateAiTriage(pet, logEntry) {
  const prompt = `You are a professional veterinary AI assistant.
A pet owner has logged the following health observation for their ${pet.species}:

Pet details:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed ?? 'Unknown'}
- Age: ${pet.age_years ?? 'Unknown'} years
- Weight: ${pet.weight_kg ?? 'Unknown'} kg

Log entry (type: ${logEntry.log_type}):
"${logEntry.description}"

Severity indicated by owner: ${logEntry.severity ?? 'not specified'}

Please provide:
1. A brief assessment of the situation
2. Recommended immediate actions
3. Whether this requires urgent veterinary attention (yes/no and why)
4. Helpful home-care tips if appropriate

Keep your response concise, practical, and compassionate. This is not a substitute for professional veterinary care.`;

  return generateText(prompt, { temperature: 0.4, maxOutputTokens: 512 });
}

// ── Pets ─────────────────────────────────────────────────────────────────────

router.post('/pets', async (req, res) => {
  const { name, species, breed, age_years, weight_kg, notes } = req.body;
  if (!name || !species) {
    return res.status(400).json({ error: 'name and species are required' });
  }

  const { data, error } = await supabaseAdmin
    .from('provet_pets')
    .insert({ user_id: req.user.id, name, species, breed, age_years, weight_kg, notes })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create pet', detail: error.message });
  return res.status(201).json({ pet: data });
});

router.get('/pets', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('provet_pets')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch pets' });
  return res.json({ pets: data });
});

router.get('/pets/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('provet_pets')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Pet not found' });
  if (!ownershipGuard(data, req.user.id, res)) return;
  return res.json({ pet: data });
});

router.put('/pets/:id', async (req, res) => {
  const { name, species, breed, age_years, weight_kg, notes } = req.body;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('provet_pets')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !ownershipGuard(existing, req.user.id, res)) return;

  const { data, error } = await supabaseAdmin
    .from('provet_pets')
    .update({ name, species, breed, age_years, weight_kg, notes, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update pet' });
  return res.json({ pet: data });
});

router.delete('/pets/:id', async (req, res) => {
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('provet_pets')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !ownershipGuard(existing, req.user.id, res)) return;

  const { error } = await supabaseAdmin.from('provet_pets').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to delete pet' });
  return res.json({ success: true });
});

// ── Health logs ───────────────────────────────────────────────────────────────

router.post('/pets/:id/logs', async (req, res) => {
  const { log_type, description, severity } = req.body;
  if (!log_type || !description) {
    return res.status(400).json({ error: 'log_type and description are required' });
  }

  // Verify pet ownership
  const { data: pet, error: petErr } = await supabaseAdmin
    .from('provet_pets')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (petErr || !ownershipGuard(pet, req.user.id, res)) return;

  // Generate AI triage response
  let ai_response = null;
  try {
    ai_response = await generateAiTriage(pet, { log_type, description, severity });
  } catch (aiErr) {
    console.error('AI triage generation failed:', aiErr.message);
    // Non-fatal — continue without AI response
  }

  const { data, error } = await supabaseAdmin
    .from('provet_health_logs')
    .insert({
      pet_id: req.params.id,
      user_id: req.user.id,
      log_type,
      description,
      severity,
      ai_response,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create log entry', detail: error.message });
  return res.status(201).json({ log: data });
});

router.get('/pets/:id/logs', async (req, res) => {
  // Verify pet ownership
  const { data: pet, error: petErr } = await supabaseAdmin
    .from('provet_pets')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (petErr || !ownershipGuard(pet, req.user.id, res)) return;

  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  const offset = parseInt(req.query.offset ?? '0', 10);

  const { data, error } = await supabaseAdmin
    .from('provet_health_logs')
    .select('*')
    .eq('pet_id', req.params.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: 'Failed to fetch logs' });
  return res.json({ logs: data });
});

router.delete('/logs/:logId', async (req, res) => {
  const { data: log, error: fetchErr } = await supabaseAdmin
    .from('provet_health_logs')
    .select('id, user_id')
    .eq('id', req.params.logId)
    .single();

  if (fetchErr || !ownershipGuard(log, req.user.id, res)) return;

  const { error } = await supabaseAdmin
    .from('provet_health_logs')
    .delete()
    .eq('id', req.params.logId);

  if (error) return res.status(500).json({ error: 'Failed to delete log' });
  return res.json({ success: true });
});

// ── AI Vet — free-form question ───────────────────────────────────────────────

router.post('/ask', async (req, res) => {
  const { question, petId } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  let petContext = '';
  if (petId) {
    const { data: pet } = await supabaseAdmin
      .from('provet_pets')
      .select('*')
      .eq('id', petId)
      .eq('user_id', req.user.id)
      .single();

    if (pet) {
      petContext = `
Pet details:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed ?? 'Unknown'}
- Age: ${pet.age_years ?? 'Unknown'} years
- Weight: ${pet.weight_kg ?? 'Unknown'} kg
`;
    }
  }

  const prompt = `You are a knowledgeable and compassionate veterinary AI assistant.
${petContext ? petContext : ''}
Answer the following question clearly and practically:

"${question}"

Important: Always recommend consulting a licensed veterinarian for diagnosis and treatment.`;

  try {
    const answer = await generateText(prompt, { temperature: 0.5, maxOutputTokens: 1024 });
    return res.json({ answer });
  } catch (err) {
    console.error('ProVet ask error:', err);
    return res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

module.exports = router;
