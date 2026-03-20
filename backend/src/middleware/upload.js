const multer = require('multer');

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Store uploads in memory so pdf-parse can read the buffer directly,
// then we push the raw bytes to Supabase Storage.
const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are accepted'), false);
  }
}

const uploadPdf = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('file');

/**
 * Wrap multer in a Promise so route handlers can await it and catch errors
 * consistently via Express error middleware.
 */
function handlePdfUpload(req, res, next) {
  uploadPdf(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds 20 MB limit' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

module.exports = { handlePdfUpload };
