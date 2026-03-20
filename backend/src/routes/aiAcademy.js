/**
 * AI Academy routes
 *
 * GET   /api/ai-academy/modules                  — list all modules
 * GET   /api/ai-academy/modules/:moduleId        — get module content + quiz
 * POST  /api/ai-academy/modules/:moduleId/chat   — AI tutor chat for a module
 * POST  /api/ai-academy/progress                 — save progress / quiz score
 * GET   /api/ai-academy/progress                 — get all user progress
 */

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { chat } = require('../services/gemini');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Static module catalogue ───────────────────────────────────────────────────
// In a production system this would live in the database, but static content
// here avoids needing a separate CMS while keeping the backend self-contained.

const MODULES = [
  {
    id: 'intro-to-ai',
    title: 'Introduction to AI',
    description: 'What AI is, how it works, and why it matters for everyday business.',
    level: 'beginner',
    durationMinutes: 15,
    topics: [
      'What is artificial intelligence?',
      'Machine learning vs traditional software',
      'Types of AI: narrow vs general',
      'Real-world business applications',
      'Privacy and ethical considerations',
    ],
  },
  {
    id: 'prompt-engineering',
    title: 'Prompt Engineering Basics',
    description: 'Write prompts that get the results you actually want from AI models.',
    level: 'beginner',
    durationMinutes: 20,
    topics: [
      'Anatomy of a good prompt',
      'Role prompting and system instructions',
      'Chain-of-thought prompting',
      'Few-shot examples',
      'Common pitfalls and how to avoid them',
    ],
  },
  {
    id: 'ai-safety',
    title: 'AI Safety & Responsible Use',
    description: 'Understand the risks of AI and how to use it responsibly.',
    level: 'beginner',
    durationMinutes: 20,
    topics: [
      'Hallucinations and how to spot them',
      'Data privacy — what goes to the cloud?',
      'Bias in AI models',
      'Intellectual property considerations',
      'Best practices for professional use',
    ],
  },
  {
    id: 'ai-for-business',
    title: 'AI for Business Productivity',
    description: 'Practical ways to integrate AI into daily workflows.',
    level: 'intermediate',
    durationMinutes: 25,
    topics: [
      'Automating repetitive tasks',
      'AI-assisted writing and communication',
      'Data analysis with AI',
      'Calculating ROI of AI adoption',
      'Building a business case for AI',
    ],
  },
  {
    id: 'local-ai',
    title: 'Local & Private AI Tools',
    description: 'Run AI models on your own hardware — zero data sent to the cloud.',
    level: 'intermediate',
    durationMinutes: 30,
    topics: [
      'Why local AI matters for privacy',
      'Overview of local LLMs (Ollama, LM Studio)',
      'Hardware requirements and trade-offs',
      'Use cases: document analysis, code assist',
      'Comparing local vs cloud AI performance',
    ],
  },
  {
    id: 'advanced-prompting',
    title: 'Advanced Prompt Strategies',
    description: 'Level-up techniques for power users and developers.',
    level: 'advanced',
    durationMinutes: 35,
    topics: [
      'Tree-of-thought and ReAct patterns',
      'Structured output with JSON mode',
      'Multi-step agent pipelines',
      'RAG — Retrieval Augmented Generation',
      'Evaluating and iterating on prompts',
    ],
  },
];

// ── GET /api/ai-academy/modules ───────────────────────────────────────────────

router.get('/modules', (req, res) => {
  const { level } = req.query;
  const filtered = level
    ? MODULES.filter((m) => m.level === level)
    : MODULES;
  return res.json({ modules: filtered });
});

// ── GET /api/ai-academy/modules/:moduleId ─────────────────────────────────────

router.get('/modules/:moduleId', (req, res) => {
  const mod = MODULES.find((m) => m.id === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Module not found' });
  return res.json({ module: mod });
});

// ── POST /api/ai-academy/modules/:moduleId/chat ───────────────────────────────

router.post('/modules/:moduleId/chat', async (req, res) => {
  const mod = MODULES.find((m) => m.id === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Module not found' });

  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const systemInstruction = `You are an AI tutor for the "${mod.title}" module.
Module description: ${mod.description}
Topics covered: ${mod.topics.join(', ')}.

Your role:
- Answer questions clearly and encourage understanding
- Give practical examples where possible
- Keep explanations appropriate for ${mod.level} level learners
- If asked about topics outside this module, gently redirect back
- Be encouraging and supportive`;

  try {
    const reply = await chat(history, message, systemInstruction);
    return res.json({ reply });
  } catch (err) {
    console.error('AI Academy chat error:', err);
    return res.status(500).json({ error: 'Failed to generate AI tutor response' });
  }
});

// ── POST /api/ai-academy/progress ────────────────────────────────────────────

router.post('/progress', requireAuth, async (req, res) => {
  const { moduleId, completed, score } = req.body;
  if (!moduleId) return res.status(400).json({ error: 'moduleId is required' });

  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return res.status(404).json({ error: 'Module not found' });

  const { data, error } = await supabaseAdmin
    .from('ai_academy_progress')
    .upsert(
      {
        user_id: req.user.id,
        module_id: moduleId,
        completed: completed ?? false,
        score: score ?? null,
        completed_at: completed ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,module_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save progress', detail: error.message });
  return res.json({ progress: data });
});

// ── GET /api/ai-academy/progress ─────────────────────────────────────────────

router.get('/progress', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('ai_academy_progress')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: 'Failed to fetch progress' });

  // Merge progress data with module catalogue
  const progressMap = Object.fromEntries((data ?? []).map((p) => [p.module_id, p]));
  const modulesWithProgress = MODULES.map((m) => ({
    ...m,
    progress: progressMap[m.id] ?? null,
  }));

  return res.json({ modules: modulesWithProgress });
});

module.exports = router;
