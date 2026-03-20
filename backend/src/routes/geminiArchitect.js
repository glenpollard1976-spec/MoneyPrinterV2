/**
 * Gemini Architect routes
 *
 * POST  /api/gemini-architect/enhance    — enhance / expand a rough prompt
 * POST  /api/gemini-architect/save       — save an enhanced prompt (auth optional)
 * GET   /api/gemini-architect/history    — list saved prompts for the user
 * DELETE /api/gemini-architect/:id       — delete a saved prompt
 */

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { generateText } = require('../services/gemini');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/gemini-architect/enhance ───────────────────────────────────────

router.post('/enhance', optionalAuth, async (req, res) => {
  const {
    input,
    goal,
    tone,
    format,
    model = 'gemini-1.5-flash',
  } = req.body;

  if (!input) {
    return res.status(400).json({ error: 'input is required' });
  }

  const metaPrompt = `You are an expert prompt engineer specialising in Google Gemini models.
Your task is to transform the rough user input below into a highly effective, structured prompt.

User's rough input:
"""
${input}
"""

${goal ? `Intended goal: ${goal}` : ''}
${tone ? `Desired tone: ${tone}` : ''}
${format ? `Preferred output format: ${format}` : ''}
Target model: ${model}

Instructions:
1. Identify the core intent and expand it with relevant context.
2. Add specific constraints and output format requirements.
3. Include examples if they would improve clarity.
4. Use role-prompting ("You are a ...") where appropriate.
5. Return ONLY the enhanced prompt — no meta-commentary, no explanations.`;

  try {
    const enhanced = await generateText(metaPrompt, { temperature: 0.6, maxOutputTokens: 1024 });
    return res.json({ enhanced, originalInput: input });
  } catch (err) {
    console.error('Gemini Architect enhance error:', err);
    return res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

// ── POST /api/gemini-architect/save ──────────────────────────────────────────

router.post('/save', optionalAuth, async (req, res) => {
  const { title, originalInput, enhancedPrompt, modelUsed } = req.body;
  if (!originalInput || !enhancedPrompt) {
    return res.status(400).json({ error: 'originalInput and enhancedPrompt are required' });
  }

  const { data, error } = await supabaseAdmin
    .from('gemini_architect_prompts')
    .insert({
      user_id: req.user?.id ?? null,
      title: title ?? null,
      original_input: originalInput,
      enhanced_prompt: enhancedPrompt,
      model_used: modelUsed ?? 'gemini-1.5-flash',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save prompt', detail: error.message });
  return res.status(201).json({ prompt: data });
});

// ── GET /api/gemini-architect/history ────────────────────────────────────────

router.get('/history', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);

  const { data, error } = await supabaseAdmin
    .from('gemini_architect_prompts')
    .select('id, title, original_input, enhanced_prompt, model_used, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: 'Failed to fetch history' });
  return res.json({ prompts: data });
});

// ── DELETE /api/gemini-architect/:id ─────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: record, error: fetchErr } = await supabaseAdmin
    .from('gemini_architect_prompts')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !record) return res.status(404).json({ error: 'Not found' });
  if (record.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

  const { error } = await supabaseAdmin
    .from('gemini_architect_prompts')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: 'Failed to delete prompt' });
  return res.json({ success: true });
});

module.exports = router;
