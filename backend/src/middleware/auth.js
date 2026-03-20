const { supabaseAdmin } = require('../config/supabase');

/**
 * requireAuth — validates the Supabase JWT sent in the Authorization header.
 * Attaches `req.user` on success; returns 401 on failure.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = data.user;
  next();
}

/**
 * optionalAuth — same as requireAuth but does not block unauthenticated requests.
 * Sets req.user to null when no valid token is provided.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7);
  const { data } = await supabaseAdmin.auth.getUser(token);
  req.user = data?.user ?? null;
  next();
}

module.exports = { requireAuth, optionalAuth };
