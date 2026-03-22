import { useState } from 'react'
import { api } from '../api.js'

const defaultForm = {
  company_name: '',
  industry: '',
  employees: '',
  hourly_rate: '',
  hours_saved_per_week: '',
  implementation_cost: '',
  monthly_subscription: '',
}

function fmt(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function ROICalculator() {
  const [form, setForm] = useState(defaultForm)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function field(k) { return (e) => setForm((f) => ({ ...f, [k]: e.target.value })) }

  async function calculate(e) {
    e.preventDefault()
    setLoading(true); setError(''); setResult(null)
    try {
      const body = {
        ...form,
        employees: form.employees ? +form.employees : undefined,
        hourly_rate: +form.hourly_rate,
        hours_saved_per_week: +form.hours_saved_per_week,
        implementation_cost: +form.implementation_cost,
        monthly_subscription: +form.monthly_subscription,
      }
      const data = await api.calculateRoi(body)
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const r = result?.results

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 ROI Calculator</h1>
        <p>Calculate the return on investment for AI automation in your business.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="card" onSubmit={calculate}>
        <h3 style={{ marginBottom: '1rem' }}>Company Details</h3>
        <div className="form-row">
          <div className="form-group"><label>Company Name</label><input value={form.company_name} onChange={field('company_name')} placeholder="Acme Corp" /></div>
          <div className="form-group"><label>Industry</label><input value={form.industry} onChange={field('industry')} placeholder="e.g. Trucking, Healthcare" /></div>
        </div>
        <div className="form-group"><label>Number of Employees</label><input type="number" min="1" value={form.employees} onChange={field('employees')} /></div>

        <hr className="divider" />
        <h3 style={{ marginBottom: '1rem' }}>Financial Inputs</h3>
        <div className="form-row">
          <div className="form-group"><label>Average Hourly Rate ($) *</label><input required type="number" min="0" value={form.hourly_rate} onChange={field('hourly_rate')} placeholder="50" /></div>
          <div className="form-group"><label>Hours Saved Per Week *</label><input required type="number" min="0" value={form.hours_saved_per_week} onChange={field('hours_saved_per_week')} placeholder="10" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Implementation Cost ($) *</label><input required type="number" min="0" value={form.implementation_cost} onChange={field('implementation_cost')} placeholder="5000" /></div>
          <div className="form-group"><label>Monthly Subscription ($) *</label><input required type="number" min="0" value={form.monthly_subscription} onChange={field('monthly_subscription')} placeholder="200" /></div>
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
          {loading ? <><span className="spinner" /> Calculating...</> : '📊 Calculate ROI'}
        </button>
      </form>

      {r && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="roi-result">
            <div className="roi-result-header">
              <h2>{form.company_name || 'Your Company'} · AI Automation ROI</h2>
              <div className="roi-pct">{r.calculated_roi > 0 ? '+' : ''}{r.calculated_roi}%</div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                First-Year Return on Investment
                {r.payback_months && ` · Payback in ${r.payback_months} months`}
              </p>
            </div>
            <div className="roi-body">
              <div className="roi-line"><span className="lbl">Weekly Time Savings</span><span className="val">{fmt(r.weeklySavings)}</span></div>
              <div className="roi-line"><span className="lbl">Annual Time Savings</span><span className="val">{fmt(r.annualSavings)}</span></div>
              <div className="roi-line"><span className="lbl">Annual Tool Cost</span><span className="val">{fmt(r.annualCost)}</span></div>
              <div className="roi-line"><span className="lbl">Net Annual Benefit</span><span className="val" style={{ color: r.netAnnualBenefit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(r.netAnnualBenefit)}</span></div>
              <div className="roi-line"><span className="lbl">Total First-Year Cost</span><span className="val">{fmt(r.totalFirstYearCost)}</span></div>
              <div className="roi-line"><span className="lbl">Payback Period</span><span className="val">{r.payback_months ? `${r.payback_months} months` : '—'}</span></div>
            </div>
          </div>

          {result.ai_narrative && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>AI Analysis</h3>
              <div className="narrative">{result.ai_narrative}</div>
            </div>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => { setForm(defaultForm); setResult(null) }}>Reset</button>
          </div>
        </div>
      )}
    </div>
  )
}
