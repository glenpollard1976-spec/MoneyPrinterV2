/**
 * ROI Calculator routes
 *
 * POST  /api/roi/calculate    — calculate ROI + generate AI narrative
 * POST  /api/roi/save         — save a calculation (auth optional)
 * GET   /api/roi/history      — list saved calculations
 * DELETE /api/roi/:id         — delete a saved calculation
 */

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { generateText } = require('../services/gemini');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── Calculation engine ────────────────────────────────────────────────────────

function computeRoi({
  hourly_rate,
  hours_saved_per_week,
  implementation_cost,
  monthly_subscription,
}) {
  const weeklySavings = hourly_rate * hours_saved_per_week;
  const annualSavings = weeklySavings * 52;
  const annualCost = monthly_subscription * 12;
  const netAnnualBenefit = annualSavings - annualCost;
  const totalFirstYearCost = implementation_cost + annualCost;
  const roi = totalFirstYearCost > 0
    ? ((annualSavings - totalFirstYearCost) / totalFirstYearCost) * 100
    : 0;
  const paybackMonths = weeklySavings > 0
    ? (implementation_cost / (weeklySavings * (52 / 12)))
    : null;

  return {
    weeklySavings: +weeklySavings.toFixed(2),
    annualSavings: +annualSavings.toFixed(2),
    annualCost: +annualCost.toFixed(2),
    netAnnualBenefit: +netAnnualBenefit.toFixed(2),
    totalFirstYearCost: +totalFirstYearCost.toFixed(2),
    calculated_roi: +roi.toFixed(2),
    payback_months: paybackMonths !== null ? +paybackMonths.toFixed(1) : null,
  };
}

async function generateRoiNarrative(input, results) {
  const prompt = `You are a business analyst helping a company understand their AI ROI.
Write a short (3-5 sentences), professional narrative about the following ROI calculation:

Company: ${input.company_name ?? 'the company'}
Industry: ${input.industry ?? 'unknown industry'}
Employees: ${input.employees ?? 'N/A'}
Hourly rate: $${input.hourly_rate}
Hours saved per week: ${input.hours_saved_per_week}
Implementation cost: $${input.implementation_cost}
Monthly subscription: $${input.monthly_subscription}

Results:
- Annual time savings value: $${results.annualSavings.toLocaleString()}
- Annual tool cost: $${results.annualCost.toLocaleString()}
- Net annual benefit: $${results.netAnnualBenefit.toLocaleString()}
- First-year ROI: ${results.calculated_roi}%
- Payback period: ${results.payback_months ?? 'N/A'} months

Write a compelling, factual narrative that highlights the key financial benefits.`;

  return generateText(prompt, { temperature: 0.5, maxOutputTokens: 256 });
}

// ── POST /api/roi/calculate ───────────────────────────────────────────────────

router.post('/calculate', optionalAuth, async (req, res) => {
  const {
    company_name,
    industry,
    employees,
    hourly_rate,
    hours_saved_per_week,
    implementation_cost,
    monthly_subscription,
  } = req.body;

  if (
    hourly_rate == null ||
    hours_saved_per_week == null ||
    implementation_cost == null ||
    monthly_subscription == null
  ) {
    return res.status(400).json({
      error: 'hourly_rate, hours_saved_per_week, implementation_cost, and monthly_subscription are required',
    });
  }

  const results = computeRoi({
    hourly_rate: +hourly_rate,
    hours_saved_per_week: +hours_saved_per_week,
    implementation_cost: +implementation_cost,
    monthly_subscription: +monthly_subscription,
  });

  let ai_narrative = null;
  try {
    ai_narrative = await generateRoiNarrative(
      { company_name, industry, employees, hourly_rate, hours_saved_per_week, implementation_cost, monthly_subscription },
      results
    );
  } catch (e) {
    console.error('ROI narrative generation failed:', e.message);
  }

  return res.json({ results, ai_narrative, inputs: req.body });
});

// ── POST /api/roi/save ────────────────────────────────────────────────────────

router.post('/save', optionalAuth, async (req, res) => {
  const {
    company_name, industry, employees,
    hourly_rate, hours_saved_per_week,
    implementation_cost, monthly_subscription,
    calculated_roi, payback_months, annual_savings,
    notes, ai_narrative,
  } = req.body;

  const { data, error } = await supabaseAdmin
    .from('roi_calculations')
    .insert({
      user_id: req.user?.id ?? null,
      company_name, industry, employees,
      hourly_rate, hours_saved_per_week,
      implementation_cost, monthly_subscription,
      calculated_roi, payback_months, annual_savings,
      notes, ai_narrative,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save calculation', detail: error.message });
  return res.status(201).json({ calculation: data });
});

// ── GET /api/roi/history ──────────────────────────────────────────────────────

router.get('/history', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('roi_calculations')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: 'Failed to fetch history' });
  return res.json({ calculations: data });
});

// ── DELETE /api/roi/:id ───────────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: record, error: fetchErr } = await supabaseAdmin
    .from('roi_calculations')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !record) return res.status(404).json({ error: 'Not found' });
  if (record.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

  const { error } = await supabaseAdmin.from('roi_calculations').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to delete calculation' });
  return res.json({ success: true });
});

module.exports = router;
