/**
 * SecureChat routes
 *
 * POST   /api/securechat/upload           — upload PDF, extract text, embed chunks
 * POST   /api/securechat/chat             — RAG chat with a document
 * GET    /api/securechat/documents        — list user's documents
 * DELETE /api/securechat/documents/:id   — delete document + all chunks
 */

const express = require('express');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../config/supabase');
const { embedText, embedBatch, chat } = require('../services/gemini');
const { handlePdfUpload } = require('../middleware/upload');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const PDF_BUCKET = process.env.SUPABASE_PDF_BUCKET || 'securechat-pdfs';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks of ~500 words.
 * Overlap prevents context from being cut at chunk boundaries.
 */
function chunkText(text, chunkSize = 500, overlap = 50) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start += chunkSize - overlap;
  }
  return chunks;
}

/**
 * Embed chunks in batches of 100 (Gemini batchEmbedContents limit).
 */
async function embedChunksInBatches(chunks) {
  const BATCH = 100;
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const batchEmbeddings = await embedBatch(batch);
    embeddings.push(...batchEmbeddings);
  }
  return embeddings;
}

// ── POST /api/securechat/upload ───────────────────────────────────────────────

router.post('/upload', optionalAuth, handlePdfUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file provided' });
  }

  const userId = req.user?.id ?? null;
  const filename = req.file.originalname;
  const fileBuffer = req.file.buffer;

  try {
    // 1. Parse PDF
    const pdfData = await pdfParse(fileBuffer);
    const rawText = pdfData.text.trim();

    if (!rawText) {
      return res.status(422).json({ error: 'Could not extract text from PDF (may be image-only)' });
    }

    // 2. Upload raw PDF to Supabase Storage
    const storagePath = `${userId ?? 'anon'}/${uuidv4()}-${filename}`;
    const { error: storageError } = await supabaseAdmin.storage
      .from(PDF_BUCKET)
      .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: false });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      // Non-fatal: continue without a stored copy
    }

    // 3. Chunk the text
    const chunks = chunkText(rawText);

    // 4. Insert document record
    const { data: doc, error: docError } = await supabaseAdmin
      .from('securechat_documents')
      .insert({
        user_id: userId,
        filename,
        file_path: storagePath,
        file_size: fileBuffer.length,
        page_count: pdfData.numpages,
        chunk_count: chunks.length,
      })
      .select()
      .single();

    if (docError) {
      return res.status(500).json({ error: 'Failed to create document record', detail: docError.message });
    }

    // 5. Generate embeddings for all chunks
    const embeddings = await embedChunksInBatches(chunks);

    // 6. Store chunks + embeddings
    const chunkRows = chunks.map((content, i) => ({
      document_id: doc.id,
      chunk_index: i,
      content,
      embedding: JSON.stringify(embeddings[i]),
    }));

    const { error: chunkError } = await supabaseAdmin
      .from('securechat_chunks')
      .insert(chunkRows);

    if (chunkError) {
      // Roll back document record to avoid orphans
      await supabaseAdmin.from('securechat_documents').delete().eq('id', doc.id);
      return res.status(500).json({ error: 'Failed to store document chunks', detail: chunkError.message });
    }

    return res.status(201).json({
      document: {
        id: doc.id,
        filename: doc.filename,
        pageCount: doc.page_count,
        chunkCount: chunks.length,
        createdAt: doc.created_at,
      },
    });
  } catch (err) {
    console.error('SecureChat upload error:', err);
    return res.status(500).json({ error: 'Internal server error during upload' });
  }
});

// ── POST /api/securechat/chat ─────────────────────────────────────────────────

router.post('/chat', optionalAuth, async (req, res) => {
  const { documentId, message, history = [] } = req.body;

  if (!documentId || !message) {
    return res.status(400).json({ error: 'documentId and message are required' });
  }

  try {
    // 1. Verify document exists (and belongs to user if authenticated)
    const query = supabaseAdmin
      .from('securechat_documents')
      .select('id, filename, user_id')
      .eq('id', documentId);

    const { data: doc, error: docErr } = await query.single();

    if (docErr || !doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If doc has a user_id, only that user may query it
    if (doc.user_id && req.user?.id !== doc.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 2. Embed the user query
    const queryEmbedding = await embedText(message);

    // 3. Vector similarity search for top-k relevant chunks
    const { data: matchedChunks, error: matchErr } = await supabaseAdmin.rpc(
      'match_securechat_chunks',
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_document_id: documentId,
        match_count: 5,
      }
    );

    if (matchErr) {
      console.error('Vector search error:', matchErr);
      return res.status(500).json({ error: 'Vector search failed' });
    }

    // 4. Build context from top chunks
    const context = matchedChunks.map((c) => c.content).join('\n\n---\n\n');

    const systemInstruction = `You are a helpful assistant answering questions about the document "${doc.filename}".
Use only the information provided in the context below to answer the user's question.
If the answer is not in the context, say you don't have enough information.
Always be concise, accurate, and professional.

DOCUMENT CONTEXT:
${context}`;

    // 5. Generate response via Gemini
    const reply = await chat(history, message, systemInstruction);

    return res.json({
      reply,
      sourcesUsed: matchedChunks.length,
      documentId,
    });
  } catch (err) {
    console.error('SecureChat chat error:', err);
    return res.status(500).json({ error: 'Internal server error during chat' });
  }
});

// ── GET /api/securechat/documents ────────────────────────────────────────────

router.get('/documents', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('securechat_documents')
    .select('id, filename, file_size, page_count, chunk_count, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }

  return res.json({ documents: data });
});

// ── DELETE /api/securechat/documents/:id ─────────────────────────────────────

router.delete('/documents/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  // Verify ownership
  const { data: doc, error: fetchErr } = await supabaseAdmin
    .from('securechat_documents')
    .select('id, user_id, file_path')
    .eq('id', id)
    .single();

  if (fetchErr || !doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (doc.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Delete storage file if present
  if (doc.file_path) {
    await supabaseAdmin.storage.from(PDF_BUCKET).remove([doc.file_path]);
  }

  // Cascading delete: chunks are deleted via FK ON DELETE CASCADE
  const { error: deleteErr } = await supabaseAdmin
    .from('securechat_documents')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    return res.status(500).json({ error: 'Failed to delete document' });
  }

  return res.json({ success: true });
});

module.exports = router;
