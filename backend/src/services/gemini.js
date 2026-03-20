const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY environment variable');
}

const genAI = new GoogleGenerativeAI(apiKey);
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';

// ── Text generation ──────────────────────────────────────────────────────────

/**
 * Send a single-turn prompt to Gemini and return the text response.
 * @param {string} prompt
 * @param {object} [options]
 * @param {number} [options.maxOutputTokens]
 * @param {number} [options.temperature]
 * @returns {Promise<string>}
 */
async function generateText(prompt, options = {}) {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
    },
  });
  return result.response.text();
}

/**
 * Multi-turn chat with an optional system instruction.
 * @param {Array<{role: 'user'|'model', parts: string}>} history
 * @param {string} userMessage
 * @param {string} [systemInstruction]
 * @returns {Promise<string>}
 */
async function chat(history, userMessage, systemInstruction) {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
  });

  const formattedHistory = history.map((h) => ({
    role: h.role,
    parts: [{ text: h.parts }],
  }));

  const chatSession = model.startChat({ history: formattedHistory });
  const result = await chatSession.sendMessage(userMessage);
  return result.response.text();
}

// ── Embeddings ───────────────────────────────────────────────────────────────

/**
 * Generate a 768-dimension embedding for a single piece of text.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedText(text) {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Batch-embed an array of strings.
 * Gemini's batchEmbedContents handles up to 100 requests per call.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const requests = texts.map((t) => ({ content: { parts: [{ text: t }] } }));
  const result = await model.batchEmbedContents({ requests });
  return result.embeddings.map((e) => e.values);
}

module.exports = { generateText, chat, embedText, embedBatch };
