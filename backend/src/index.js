/**
 * CrownworksNL Backend — Main Express Application
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const securechatRoutes = require('./routes/securechat');
const provetRoutes = require('./routes/provet');
const geminiArchitectRoutes = require('./routes/geminiArchitect');
const ironlogRoutes = require('./routes/ironlog');
const roiRoutes = require('./routes/roiCalculator');
const aiAcademyRoutes = require('./routes/aiAcademy');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://melodious-truffle-2f7d68.netlify.app';

// ── Security headers ──────────────────────────────────────────────────────────

app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin) and listed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// ── Body parsing & compression ────────────────────────────────────────────────

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── Logging ───────────────────────────────────────────────────────────────────

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later' },
});

// Tighter limit for AI endpoints (they cost money per call)
const aiLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit exceeded — please wait a moment' },
});

app.use(globalLimiter);
app.use('/api/securechat/chat', aiLimiter);
app.use('/api/provet/ask', aiLimiter);
app.use('/api/gemini-architect/enhance', aiLimiter);
app.use('/api/ironlog/entries', aiLimiter); // AI summary on create
app.use('/api/roi/calculate', aiLimiter);
app.use('/api/ai-academy/modules', aiLimiter); // chat endpoint

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api/securechat', securechatRoutes);
app.use('/api/provet', provetRoutes);
app.use('/api/gemini-architect', geminiArchitectRoutes);
app.use('/api/ironlog', ironlogRoutes);
app.use('/api/roi', roiRoutes);
app.use('/api/ai-academy', aiAcademyRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`CrownworksNL backend running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});

module.exports = app; // exported for Netlify Functions adapter
