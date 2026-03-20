/**
 * Netlify Functions adapter
 *
 * This wraps the Express app so every request to /.netlify/functions/api/*
 * is handled by the same Express routes.
 *
 * Deployment:
 *   1. Add to netlify.toml (see example below):
 *
 *      [build]
 *        functions = "backend/netlify/functions"
 *        command   = "cd backend && npm ci"
 *
 *      [[redirects]]
 *        from   = "/api/*"
 *        to     = "/.netlify/functions/api/:splat"
 *        status = 200
 *
 *   2. Set all environment variables in the Netlify UI (Site → Environment).
 *   3. Deploy as usual — the function bundle is built automatically.
 *
 * Limitations vs. VPS deployment:
 *   - Cold start latency (~200-500 ms)
 *   - 10-second execution timeout on the free plan (26 s on Pro)
 *   - Maximum payload size 6 MB (use pre-signed URLs for large PDFs in production)
 */

const serverless = require('serverless-http');

// Load env vars when running locally with `netlify dev`
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '../../.env' });
}

const app = require('../../src/index');

module.exports.handler = serverless(app, {
  // Strip the Netlify Functions prefix so Express sees /api/... paths
  request(req) {
    req.url = req.url.replace(/^\/?\.netlify\/functions\/api/, '') || '/';
  },
});
