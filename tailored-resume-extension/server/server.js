/**
 * Agentex LaTeX Compilation Server — Production v4.0
 * 
 * Multi-user LaTeX → PDF compilation API. Designed for VPS deployment
 * with Docker, rate limiting, health checks, and CORS control.
 */

require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

// ============================================
// CONFIG
// ============================================

const PORT = parseInt(process.env.PORT, 10) || 3000;
const IS_DEV = process.env.DEV === 'true' || process.env.NODE_ENV === 'development';
const NODE_ENV = IS_DEV ? 'development' : 'production';
const TMP_DIR = process.env.TMP_DIR || '/tmp/agentex';
const PDF_DIR = path.join(TMP_DIR, 'pdf');
const MAX_LATEX_SIZE = parseInt(process.env.MAX_LATEX_SIZE, 10) || 500000; // 500KB
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000; // 1 min
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 30;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL, 10) || 300000; // 5 min

// CORS origins (comma-separated in .env)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Always allow localhost in dev
if (IS_DEV) {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000');
}

console.log(`[Server] Starting Agentex v4.0 (${NODE_ENV})`);
console.log(`[Server] Port: ${PORT}, Origins: ${ALLOWED_ORIGINS.length}`);

// ============================================
// APP SETUP
// ============================================

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

// Request logging
if (NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// CORS
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow chrome extensions
    if (origin.startsWith('chrome-extension://')) return callback(null, true);
    // Check allowed list  
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

// Body parser
app.use(express.json({ limit: process.env.MAX_BODY_SIZE || '2mb' }));

// Rate limiting
const compileLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  message: { error: 'Too many requests. Please wait before trying again.', retryAfter: RATE_LIMIT_WINDOW / 1000 },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip || 'unknown';
  }
});

// ============================================
// HEALTH & INFO
// ============================================

app.get('/health', async (req, res) => {
  const pdflatexOk = await checkPdfLatex();
  res.status(pdflatexOk ? 200 : 503).json({
    status: pdflatexOk ? 'healthy' : 'degraded',
    version: '4.0',
    uptime: Math.floor(process.uptime()),
    pdflatex: pdflatexOk,
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Agentex LaTeX Compilation Server',
    version: '4.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /compile': 'Compile LaTeX to PDF',
      'POST /parse/pdf': 'Extract text from PDF',
      'POST /parse/docx': 'Extract text from DOCX',
      'POST /parse/linkedin': 'Parse LinkedIn data export ZIP',
      'GET /status': 'Server stats',
    }
  });
});

app.get('/status', (req, res) => {
  res.json({
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    version: '4.0',
    environment: NODE_ENV
  });
});

// ============================================
// COMPILE ENDPOINT
// ============================================

app.post('/compile', compileLimiter, async (req, res) => {
  const fileId = uuidv4();
  const startTime = Date.now();

  try {
    const { latex } = req.body;

    // Validate
    if (!latex || typeof latex !== 'string') {
      return res.status(400).json({ error: 'LaTeX source is required' });
    }
    if (latex.length > MAX_LATEX_SIZE) {
      return res.status(400).json({ error: `LaTeX source too large (max ${MAX_LATEX_SIZE / 1000}KB)` });
    }

    console.log(`[Compile] ${fileId} — ${latex.length} chars`);

    // Write .tex file
    const texPath = path.join(TMP_DIR, `${fileId}.tex`);
    const outputDir = PDF_DIR;
    const pdfPath = path.join(outputDir, `${fileId}.pdf`);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(texPath, latex, 'utf8');

    // Compile with pdflatex
    const cmd = `cd "${TMP_DIR}" && pdflatex -interaction=nonstopmode -halt-on-error -output-directory="${outputDir}" "${texPath}"`;

    await new Promise((resolve, reject) => {
      exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
        if (error && !stdout.includes('Output written on')) {
          // Extract LaTeX error
          const latexErr = stdout.match(/^!(.*?)$/m)?.[1]?.trim();
          reject(new Error(latexErr || stderr || error.message));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    // Verify PDF exists
    const stat = await fs.stat(pdfPath).catch(() => null);
    if (!stat || stat.size === 0) {
      throw new Error('PDF output is empty or missing');
    }

    // Send PDF
    const pdfContent = await fs.readFile(pdfPath);
    const elapsed = Date.now() - startTime;
    console.log(`[Compile] ${fileId} — OK (${pdfContent.length} bytes, ${elapsed}ms)`);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="resume-${fileId.slice(0, 8)}.pdf"`,
      'X-Compile-Time': `${elapsed}ms`,
    });
    res.send(pdfContent);

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Compile] ${fileId} — FAIL (${elapsed}ms):`, error.message);

    res.status(500).json({
      error: error.message || 'Compilation failed',
      fileId,
      elapsed: `${elapsed}ms`
    });
  } finally {
    // Async cleanup
    cleanupFiles(fileId).catch(() => { });
  }
});

// ============================================
// FILE UPLOAD (multer)
// ============================================

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================
// PARSE ENDPOINTS
// ============================================

const { parsePdf } = require('./parsers/pdf-parser');

app.post('/parse/pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await parsePdf(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('PDF parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse PDF', details: error.message });
  }
});

const { parseDocx } = require('./parsers/docx-parser');

app.post('/parse/docx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await parseDocx(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('DOCX parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse DOCX', details: error.message });
  }
});

const { parseLinkedinExport } = require('./parsers/linkedin-parser');

app.post('/parse/linkedin', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = parseLinkedinExport(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('LinkedIn parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse LinkedIn export', details: error.message });
  }
});

// ============================================
// UTILITIES
// ============================================

async function checkPdfLatex() {
  return new Promise(resolve => {
    exec('which pdflatex', (error) => {
      resolve(!error);
    });
  });
}

async function cleanupFiles(fileId) {
  const exts = ['.tex', '.log', '.aux', '.out', '.pdf', '.toc', '.nav', '.snm'];
  const dirs = [TMP_DIR, PDF_DIR];

  for (const dir of dirs) {
    for (const ext of exts) {
      await fs.unlink(path.join(dir, `${fileId}${ext}`)).catch(() => { });
    }
  }
}

// Periodic cleanup of orphaned files
setInterval(async () => {
  try {
    const files = await fs.readdir(TMP_DIR).catch(() => []);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat && !stat.isDirectory() && now - stat.mtimeMs > 600000) { // 10 min old
        await fs.unlink(filePath).catch(() => { });
      }
    }
  } catch (e) {
    // silent cleanup failure
  }
}, CLEANUP_INTERVAL);

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// START
// ============================================

async function start() {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.mkdir(PDF_DIR, { recursive: true });

    const hasPdfLatex = await checkPdfLatex();
    if (!hasPdfLatex) {
      console.error('[Server] WARNING: pdflatex not found! Install texlive-full.');
    } else {
      console.log('[Server] OK: pdflatex available');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] OK: Running on http://0.0.0.0:${PORT} (${NODE_ENV})`);
    });
  } catch (error) {
    console.error('[Server] FAIL: Failed to start:', error);
    process.exit(1);
  }
}

start();
