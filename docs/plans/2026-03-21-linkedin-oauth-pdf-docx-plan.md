# LinkedIn OAuth, PDF/DOCX Support & Unified Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PDF/DOCX file support, LinkedIn OAuth + data export import, and a unified structured resume editor to the Agentex Chrome extension.

**Architecture:** Sidepanel-centric — the sidepanel becomes a "Resume Hub" with Import/Editor/Settings tabs. Server gains parsing endpoints for PDF (pdf-parse), DOCX (mammoth.js), and LinkedIn CSV exports. Structured JSON becomes the canonical internal format; LaTeX is generated from it via a template system.

**Tech Stack:** Express.js (server), pdf-parse, mammoth.js, adm-zip, csv-parse, Chrome Identity API, vanilla JS/CSS

**Design Doc:** `docs/plans/2026-03-21-linkedin-oauth-pdf-docx-design.md`

---

## Task 1: Define Structured Resume JSON Schema

**Files:**
- Create: `tailored-resume-extension/services/resume-schema.js`

**Step 1: Create the schema module**

This module exports the canonical schema, a validation function, and an empty template. Used by both server parsers and the extension editor.

```javascript
// resume-schema.js
const RESUME_SCHEMA = {
  contact: { name: '', email: '', phone: '', location: '', linkedin: '', website: '' },
  summary: '',
  experience: [],
  education: [],
  skills: { technical: [], soft: [], languages: [] },
  certifications: [],
  projects: []
};

const EXPERIENCE_TEMPLATE = {
  title: '', company: '', location: '', startDate: '', endDate: '', description: '', highlights: []
};

const EDUCATION_TEMPLATE = {
  institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '', highlights: []
};

const CERTIFICATION_TEMPLATE = { name: '', issuer: '', date: '' };

const PROJECT_TEMPLATE = { name: '', description: '', technologies: [], url: '' };

function createEmptyResume() {
  return JSON.parse(JSON.stringify(RESUME_SCHEMA));
}

function validateResume(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be an object' };
  if (!data.contact || typeof data.contact !== 'object') return { valid: false, error: 'Missing contact object' };
  if (!Array.isArray(data.experience)) return { valid: false, error: 'experience must be an array' };
  if (!Array.isArray(data.education)) return { valid: false, error: 'education must be an array' };
  if (!data.skills || typeof data.skills !== 'object') return { valid: false, error: 'Missing skills object' };
  if (!Array.isArray(data.certifications)) return { valid: false, error: 'certifications must be an array' };
  if (!Array.isArray(data.projects)) return { valid: false, error: 'projects must be an array' };
  return { valid: true };
}

// Support both Node.js (server) and browser (extension) environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESUME_SCHEMA, EXPERIENCE_TEMPLATE, EDUCATION_TEMPLATE, CERTIFICATION_TEMPLATE, PROJECT_TEMPLATE, createEmptyResume, validateResume };
}
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/services/resume-schema.js
git commit -m "feat: add structured resume JSON schema module"
```

---

## Task 2: Server — Install Parsing Dependencies

**Files:**
- Modify: `tailored-resume-extension/server/package.json` (lines 6-9, dependencies)

**Step 1: Install dependencies**

```bash
cd tailored-resume-extension/server
npm install pdf-parse mammoth adm-zip csv-parse multer
```

- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX to text conversion
- `adm-zip` — ZIP file extraction (for LinkedIn exports)
- `csv-parse` — CSV parsing (for LinkedIn CSVs)
- `multer` — File upload middleware for Express

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add pdf-parse, mammoth, adm-zip, csv-parse, multer dependencies"
```

---

## Task 3: Server — Add PDF Parsing Endpoint

**Files:**
- Create: `tailored-resume-extension/server/parsers/pdf-parser.js`
- Modify: `tailored-resume-extension/server/server.js` (add endpoint after line ~209)

**Step 1: Create PDF parser module**

```javascript
// server/parsers/pdf-parser.js
const pdfParse = require('pdf-parse');

async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  if (!text || text.trim().length < 20) {
    return {
      success: false,
      error: 'Could not extract meaningful text from PDF. This may be an image-based/scanned PDF. Try exporting from your word processor instead.',
      rawText: text || ''
    };
  }

  return {
    success: true,
    rawText: text.trim(),
    pageCount: data.numpages
  };
}

module.exports = { parsePdf };
```

**Step 2: Add multer and PDF endpoint to server.js**

Add after the existing `/compile` endpoint (around line 209) in `server/server.js`:

```javascript
// --- File Upload Middleware ---
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// --- PDF Parse Endpoint ---
const { parsePdf } = require('./parsers/pdf-parser');

app.post('/parse/pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await parsePdf(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('PDF parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse PDF', details: error.message });
  }
});
```

**Step 3: Test manually**

```bash
cd tailored-resume-extension/server
node server.js &
curl -X POST http://localhost:3000/parse/pdf -F "file=@test-resume.pdf"
```

Expected: JSON with `{ success: true, rawText: "...", pageCount: N }`

**Step 4: Commit**

```bash
git add server/parsers/pdf-parser.js server/server.js
git commit -m "feat: add POST /parse/pdf endpoint with pdf-parse"
```

---

## Task 4: Server — Add DOCX Parsing Endpoint

**Files:**
- Create: `tailored-resume-extension/server/parsers/docx-parser.js`
- Modify: `tailored-resume-extension/server/server.js` (add endpoint after PDF endpoint)

**Step 1: Create DOCX parser module**

```javascript
// server/parsers/docx-parser.js
const mammoth = require('mammoth');

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  if (!text || text.trim().length < 20) {
    return {
      success: false,
      error: 'Could not extract meaningful text from DOCX file.',
      rawText: text || ''
    };
  }

  return {
    success: true,
    rawText: text.trim(),
    warnings: result.messages.filter(m => m.type === 'warning').map(m => m.message)
  };
}

module.exports = { parseDocx };
```

**Step 2: Add DOCX endpoint to server.js**

```javascript
// --- DOCX Parse Endpoint ---
const { parseDocx } = require('./parsers/docx-parser');

app.post('/parse/docx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await parseDocx(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('DOCX parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse DOCX', details: error.message });
  }
});
```

**Step 3: Commit**

```bash
git add server/parsers/docx-parser.js server/server.js
git commit -m "feat: add POST /parse/docx endpoint with mammoth.js"
```

---

## Task 5: Server — Add LinkedIn Data Export Parsing Endpoint

**Files:**
- Create: `tailored-resume-extension/server/parsers/linkedin-parser.js`
- Modify: `tailored-resume-extension/server/server.js` (add endpoint)

**Step 1: Create LinkedIn parser module**

```javascript
// server/parsers/linkedin-parser.js
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');

const EXPECTED_FILES = {
  positions: 'Positions.csv',
  education: 'Education.csv',
  skills: 'Skills.csv',
  profile: 'Profile.csv',
  certifications: 'Certifications.csv',
  projects: 'Projects.csv'
};

function parseLinkedinExport(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const fileMap = {};
  const warnings = [];

  // Find CSV files (may be in subdirectories)
  for (const entry of entries) {
    const name = entry.entryName.split('/').pop();
    for (const [key, expectedName] of Object.entries(EXPECTED_FILES)) {
      if (name === expectedName) {
        fileMap[key] = entry.getData().toString('utf-8');
      }
    }
  }

  const resume = {
    contact: { name: '', email: '', phone: '', location: '', linkedin: '', website: '' },
    summary: '',
    experience: [],
    education: [],
    skills: { technical: [], soft: [], languages: [] },
    certifications: [],
    projects: []
  };

  // Parse Profile.csv
  if (fileMap.profile) {
    try {
      const rows = parse(fileMap.profile, { columns: true, skip_empty_lines: true, relax_column_count: true });
      if (rows.length > 0) {
        const p = rows[0];
        resume.contact.name = `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim();
        resume.summary = p['Summary'] || p['Headline'] || '';
        resume.contact.location = p['Geo Location'] || p['Location'] || '';
      }
    } catch (e) {
      warnings.push('Could not parse Profile.csv: ' + e.message);
    }
  }

  // Parse Positions.csv
  if (fileMap.positions) {
    try {
      const rows = parse(fileMap.positions, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.experience = rows.map(row => ({
        title: row['Title'] || '',
        company: row['Company Name'] || '',
        location: row['Location'] || '',
        startDate: formatLinkedinDate(row['Started On']),
        endDate: row['Finished On'] ? formatLinkedinDate(row['Finished On']) : 'Present',
        description: row['Description'] || '',
        highlights: []
      }));
    } catch (e) {
      warnings.push('Could not parse Positions.csv: ' + e.message);
    }
  }

  // Parse Education.csv
  if (fileMap.education) {
    try {
      const rows = parse(fileMap.education, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.education = rows.map(row => ({
        institution: row['School Name'] || '',
        degree: row['Degree Name'] || '',
        field: row['Notes'] || '',
        startDate: row['Start Date'] || '',
        endDate: row['End Date'] || '',
        gpa: '',
        highlights: row['Activities and Societies'] ? [row['Activities and Societies']] : []
      }));
    } catch (e) {
      warnings.push('Could not parse Education.csv: ' + e.message);
    }
  }

  // Parse Skills.csv
  if (fileMap.skills) {
    try {
      const rows = parse(fileMap.skills, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.skills.technical = rows.map(row => row['Name'] || row[Object.keys(row)[0]] || '').filter(Boolean);
    } catch (e) {
      warnings.push('Could not parse Skills.csv: ' + e.message);
    }
  }

  // Parse Certifications.csv
  if (fileMap.certifications) {
    try {
      const rows = parse(fileMap.certifications, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.certifications = rows.map(row => ({
        name: row['Name'] || '',
        issuer: row['Authority'] || '',
        date: row['Started On'] || ''
      }));
    } catch (e) {
      warnings.push('Could not parse Certifications.csv: ' + e.message);
    }
  }

  // Parse Projects.csv (if present)
  if (fileMap.projects) {
    try {
      const rows = parse(fileMap.projects, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.projects = rows.map(row => ({
        name: row['Title'] || '',
        description: row['Description'] || '',
        technologies: [],
        url: row['Url'] || ''
      }));
    } catch (e) {
      warnings.push('Could not parse Projects.csv: ' + e.message);
    }
  }

  const foundFiles = Object.keys(fileMap);
  const missingFiles = Object.entries(EXPECTED_FILES)
    .filter(([key]) => !fileMap[key])
    .map(([, name]) => name);

  if (missingFiles.length > 0) {
    warnings.push(`Missing files in export: ${missingFiles.join(', ')}. Those sections will be empty.`);
  }

  return {
    success: foundFiles.length > 0,
    resume,
    foundFiles: foundFiles.map(k => EXPECTED_FILES[k]),
    warnings,
    error: foundFiles.length === 0 ? 'No recognized LinkedIn CSV files found in the ZIP archive.' : undefined
  };
}

function formatLinkedinDate(dateStr) {
  if (!dateStr) return '';
  // LinkedIn dates are typically "Mon YYYY" or "YYYY"
  return dateStr.trim();
}

module.exports = { parseLinkedinExport };
```

**Step 2: Add LinkedIn endpoint to server.js**

```javascript
// --- LinkedIn Export Parse Endpoint ---
const { parseLinkedinExport } = require('./parsers/linkedin-parser');

app.post('/parse/linkedin', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = parseLinkedinExport(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('LinkedIn parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse LinkedIn export', details: error.message });
  }
});
```

**Step 3: Commit**

```bash
git add server/parsers/linkedin-parser.js server/server.js
git commit -m "feat: add POST /parse/linkedin endpoint for LinkedIn data export ZIP"
```

---

## Task 6: Server — Unit Tests for Parsers

**Files:**
- Create: `tailored-resume-extension/server/tests/parsers.test.js`
- Create: `tailored-resume-extension/server/tests/fixtures/` (test files)
- Modify: `tailored-resume-extension/server/package.json` (add test script)

**Step 1: Add jest to dev dependencies**

```bash
cd tailored-resume-extension/server
npm install --save-dev jest
```

**Step 2: Update package.json test script**

Change the `test` script in `server/package.json`:

```json
"test": "jest --verbose"
```

**Step 3: Create test fixtures directory**

```bash
mkdir -p tailored-resume-extension/server/tests/fixtures
```

Create a minimal LinkedIn ZIP fixture programmatically in the test.

**Step 4: Write parser tests**

```javascript
// server/tests/parsers.test.js
const { parseLinkedinExport } = require('../parsers/linkedin-parser');
const AdmZip = require('adm-zip');

describe('LinkedIn Parser', () => {
  function createTestZip(files) {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
      zip.addFile(name, Buffer.from(content, 'utf-8'));
    }
    return zip.toBuffer();
  }

  test('parses valid LinkedIn export with positions and profile', () => {
    const zipBuffer = createTestZip({
      'Profile.csv': 'First Name,Last Name,Headline,Summary,Geo Location\nJohn,Doe,Software Engineer,Experienced dev,San Francisco',
      'Positions.csv': 'Company Name,Title,Description,Location,Started On,Finished On\nAcme Inc,Senior Dev,Built things,SF,Jan 2020,Dec 2023',
      'Skills.csv': 'Name\nJavaScript\nPython\nReact'
    });

    const result = parseLinkedinExport(zipBuffer);

    expect(result.success).toBe(true);
    expect(result.resume.contact.name).toBe('John Doe');
    expect(result.resume.experience).toHaveLength(1);
    expect(result.resume.experience[0].title).toBe('Senior Dev');
    expect(result.resume.experience[0].company).toBe('Acme Inc');
    expect(result.resume.skills.technical).toEqual(['JavaScript', 'Python', 'React']);
  });

  test('returns warnings for missing CSV files', () => {
    const zipBuffer = createTestZip({
      'Profile.csv': 'First Name,Last Name\nJane,Smith'
    });

    const result = parseLinkedinExport(zipBuffer);

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Missing files');
  });

  test('fails gracefully with empty ZIP', () => {
    const zip = new AdmZip();
    zip.addFile('random.txt', Buffer.from('not a csv'));
    const result = parseLinkedinExport(zip.toBuffer());

    expect(result.success).toBe(false);
    expect(result.error).toContain('No recognized LinkedIn CSV files');
  });

  test('handles education and certifications', () => {
    const zipBuffer = createTestZip({
      'Profile.csv': 'First Name,Last Name\nTest,User',
      'Education.csv': 'School Name,Degree Name,Notes,Start Date,End Date,Activities and Societies\nMIT,BS,Computer Science,2016,2020,Robotics Club',
      'Certifications.csv': 'Name,Authority,Started On\nAWS Solutions Architect,Amazon,2022'
    });

    const result = parseLinkedinExport(zipBuffer);

    expect(result.resume.education).toHaveLength(1);
    expect(result.resume.education[0].institution).toBe('MIT');
    expect(result.resume.certifications).toHaveLength(1);
    expect(result.resume.certifications[0].name).toBe('AWS Solutions Architect');
  });
});
```

**Step 5: Run tests to verify they pass**

```bash
cd tailored-resume-extension/server
npm test
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add server/tests/ server/package.json
git commit -m "test: add unit tests for LinkedIn export parser"
```

---

## Task 7: Server — AI-Assisted Structuring Endpoint

**Files:**
- Create: `tailored-resume-extension/server/parsers/ai-structurer.js`
- Modify: `tailored-resume-extension/server/server.js` (update PDF/DOCX endpoints)

The PDF/DOCX endpoints currently return raw text. This task adds an optional AI structuring step: the client sends its API key + provider alongside the file, and the server calls the AI to structure the raw text into the resume JSON schema.

**Step 1: Create AI structurer module**

```javascript
// server/parsers/ai-structurer.js

const STRUCTURING_PROMPT = `You are a resume parser. Given the raw text extracted from a resume document, extract and return a JSON object with this exact structure. Return ONLY valid JSON, no markdown or explanation.

{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
  "summary": "",
  "experience": [{ "title": "", "company": "", "location": "", "startDate": "", "endDate": "", "description": "", "highlights": [""] }],
  "education": [{ "institution": "", "degree": "", "field": "", "startDate": "", "endDate": "", "gpa": "", "highlights": [""] }],
  "skills": { "technical": [""], "soft": [""], "languages": [""] },
  "certifications": [{ "name": "", "issuer": "", "date": "" }],
  "projects": [{ "name": "", "description": "", "technologies": [""], "url": "" }]
}

Rules:
- Extract all information present. Leave empty strings for missing fields.
- For highlights, break descriptions into bullet points where appropriate.
- For skills, categorize into technical (programming, tools, frameworks), soft (leadership, communication), and languages (English, Spanish, etc.).
- Dates should be kept in their original format (e.g., "Jan 2020", "2020").
- Return empty arrays [] for sections with no data, not arrays with empty template objects.`;

async function structureWithAI(rawText, provider, apiKey, modelId) {
  const userMessage = `Here is the raw text extracted from a resume:\n\n${rawText}`;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: STRUCTURING_PROMPT + '\n\n' + userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  if (provider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        system: STRUCTURING_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text;
    return JSON.parse(extractJson(text));
  }

  if (provider === 'groq' || provider === 'openrouter') {
    const baseUrl = provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: STRUCTURING_PROMPT },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' }
      })
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    return JSON.parse(text);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

function extractJson(text) {
  // Try to find JSON in markdown code blocks or raw text
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1].trim();
  // Try raw JSON
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

module.exports = { structureWithAI };
```

**Step 2: Update PDF and DOCX endpoints in server.js**

Update both endpoints to accept optional `provider`, `apiKey`, `modelId` fields in the request body (sent as form fields alongside the file). If provided, run AI structuring. If not, return raw text only.

```javascript
// Update POST /parse/pdf
const { structureWithAI } = require('./parsers/ai-structurer');

app.post('/parse/pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await parsePdf(req.file.buffer);
    if (!result.success) {
      return res.json(result);
    }

    // If AI credentials provided, attempt structuring
    const { provider, apiKey, modelId } = req.body;
    if (provider && apiKey && modelId) {
      try {
        const structured = await structureWithAI(result.rawText, provider, apiKey, modelId);
        return res.json({ success: true, resume: structured, rawText: result.rawText });
      } catch (aiError) {
        console.error('AI structuring failed, returning raw text:', aiError.message);
        return res.json({ success: true, rawText: result.rawText, structuringFailed: true });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('PDF parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse PDF', details: error.message });
  }
});

// Same pattern for POST /parse/docx — add AI structuring
```

Apply the identical AI structuring pattern to the DOCX endpoint.

**Step 3: Commit**

```bash
git add server/parsers/ai-structurer.js server/server.js
git commit -m "feat: add AI-assisted resume structuring for PDF/DOCX parsing"
```

---

## Task 8: Extension — Update Manifest for New Permissions

**Files:**
- Modify: `tailored-resume-extension/manifest.json` (lines 6-20)

**Step 1: Add identity permission and LinkedIn host**

Add to the `permissions` array (line 6-12):
```json
"identity"
```

Add to the `host_permissions` array (line 14-20):
```json
"https://www.linkedin.com/*",
"https://api.linkedin.com/*"
```

Add to `web_accessible_resources` (line 62-72), ensure `services/resume-schema.js` is accessible.

**Step 2: Commit**

```bash
git add tailored-resume-extension/manifest.json
git commit -m "feat: add identity permission and LinkedIn host permissions to manifest"
```

---

## Task 9: Extension — Update File Handler for PDF/DOCX

**Files:**
- Modify: `tailored-resume-extension/services/file-handler.js` (lines 16-21, 41-56)

**Step 1: Extend supported types**

Update the constructor (line 16-21) to add PDF and DOCX handlers:

```javascript
constructor() {
  this.supportedTypes = {
    'tex': this.handleLatex.bind(this),
    'pdf': this.handleBinary.bind(this),
    'docx': this.handleBinary.bind(this)
  };
  this.debug = true;
}
```

**Step 2: Add binary file handler method**

Add a new method after `handleLatex` (after line 96):

```javascript
async handleBinary(file) {
  return {
    type: file.name.split('.').pop().toLowerCase(),
    file: file,  // Pass the raw File object for upload to server
    preview: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
    success: true
  };
}
```

**Step 3: Update handleFile to return the raw file for server-parsed formats**

Update `handleFile` (line 41-56) to distinguish between client-parsed (LaTeX) and server-parsed (PDF/DOCX) types:

```javascript
async handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const handler = this.supportedTypes[ext];

  if (!handler) {
    throw new Error(`Unsupported file format: .${ext}. Supported formats: ${Object.keys(this.supportedTypes).map(e => '.' + e).join(', ')}`);
  }

  const result = await handler(file);
  result.requiresServerParsing = (ext === 'pdf' || ext === 'docx');
  return result;
}
```

**Step 4: Commit**

```bash
git add tailored-resume-extension/services/file-handler.js
git commit -m "feat: extend file handler to support PDF and DOCX uploads"
```

---

## Task 10: Extension — LinkedIn OAuth Service

**Files:**
- Create: `tailored-resume-extension/services/linkedin-auth.js`

**Step 1: Create LinkedIn auth module**

```javascript
// services/linkedin-auth.js
const LinkedInAuth = {
  // Replace with actual LinkedIn App Client ID after registration
  CLIENT_ID: 'YOUR_LINKEDIN_CLIENT_ID',
  REDIRECT_URI: chrome.identity.getRedirectURL('linkedin'),
  SCOPES: 'openid profile email',

  async login() {
    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', this.CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', this.REDIRECT_URI);
    authUrl.searchParams.set('scope', this.SCOPES);
    authUrl.searchParams.set('state', crypto.randomUUID());

    try {
      const redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
      });

      const url = new URL(redirectUrl);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        throw new Error(`LinkedIn OAuth denied: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Store the auth code — token exchange happens server-side
      // For now, store basic auth state
      await chrome.storage.local.set({
        linkedinAuth: {
          code,
          timestamp: Date.now(),
          authenticated: true
        }
      });

      return { success: true, code };
    } catch (err) {
      console.error('LinkedIn OAuth error:', err);
      return { success: false, error: err.message };
    }
  },

  async logout() {
    await chrome.storage.local.remove(['linkedinAuth', 'linkedinProfile']);
    return { success: true };
  },

  async getAuthState() {
    const { linkedinAuth } = await chrome.storage.local.get('linkedinAuth');
    return {
      authenticated: !!linkedinAuth?.authenticated,
      timestamp: linkedinAuth?.timestamp
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LinkedInAuth;
}
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/services/linkedin-auth.js
git commit -m "feat: add LinkedIn OAuth service using Chrome Identity API"
```

---

## Task 11: Extension — Restructure Sidepanel HTML with Tabs

**Files:**
- Modify: `tailored-resume-extension/sidepanel.html` (major restructure)

**Step 1: Add tab navigation after the header (line ~32)**

Insert after the header section, before the main content:

```html
<!-- Tab Navigation -->
<div class="tab-nav">
  <button class="tab-btn active" data-tab="import">Import</button>
  <button class="tab-btn" data-tab="editor">Editor</button>
  <button class="tab-btn" data-tab="settings">Settings</button>
</div>
```

**Step 2: Wrap existing upload section in an "import" tab pane**

Wrap lines ~57-72 (resume upload section) in a tab container and add the new import options:

```html
<!-- Import Tab -->
<div class="tab-pane active" id="tab-import">
  <div class="import-section">
    <h3 class="section-title">Upload Resume</h3>
    <p class="section-desc">Upload a LaTeX, PDF, or DOCX file</p>
    <!-- Existing drop zone, updated to accept .pdf,.docx,.tex -->
    <div id="resume-upload" class="drop-zone">
      <span class="material-icons drop-icon">upload_file</span>
      <p>Drop your resume here</p>
      <p class="drop-hint">.tex, .pdf, .docx</p>
      <input type="file" id="resume-file" accept=".tex,.pdf,.docx" hidden>
    </div>
    <div id="file-status" class="file-status"></div>
    <div id="upload-progress" class="upload-progress" hidden>
      <div class="progress-bar"><div class="progress-fill" id="upload-progress-fill"></div></div>
      <span id="upload-progress-text">Uploading...</span>
    </div>
  </div>

  <div class="import-divider"><span>or</span></div>

  <!-- LinkedIn Import -->
  <div class="import-section">
    <h3 class="section-title">Import from LinkedIn</h3>
    <div id="linkedin-auth-section">
      <button id="linkedin-login-btn" class="btn btn-linkedin">
        <span class="linkedin-icon">in</span>
        Sign in with LinkedIn
      </button>
      <div id="linkedin-profile" class="linkedin-profile" hidden>
        <span id="linkedin-name"></span>
        <button id="linkedin-logout" class="btn-link">Sign out</button>
      </div>
    </div>
    <div id="linkedin-export-section" class="linkedin-export" hidden>
      <p class="section-desc">Upload your LinkedIn data export (ZIP file)</p>
      <ol class="linkedin-steps">
        <li>Go to LinkedIn Settings &gt; Data Privacy &gt; Get a copy of your data</li>
        <li>Select the data you want and request the archive</li>
        <li>Once received, upload the ZIP file below</li>
      </ol>
      <div id="linkedin-upload" class="drop-zone drop-zone-sm">
        <span class="material-icons drop-icon">folder_zip</span>
        <p>Drop LinkedIn export ZIP here</p>
        <input type="file" id="linkedin-file" accept=".zip" hidden>
      </div>
    </div>
  </div>

  <!-- Manual Entry -->
  <div class="import-section">
    <h3 class="section-title">Start from Scratch</h3>
    <button id="manual-entry-btn" class="btn btn-secondary">Create Empty Resume</button>
  </div>
</div>
```

**Step 3: Add editor tab pane (new HTML)**

```html
<!-- Editor Tab -->
<div class="tab-pane" id="tab-editor">
  <div id="editor-empty" class="editor-empty">
    <span class="material-icons">description</span>
    <p>No resume data yet. Import a file or start from scratch.</p>
    <button class="btn btn-primary" data-switch-tab="import">Go to Import</button>
  </div>

  <div id="editor-content" class="editor-content" hidden>
    <div class="editor-actions">
      <button id="editor-import-btn" class="btn btn-sm btn-secondary">Re-import</button>
      <button id="editor-generate-latex" class="btn btn-sm btn-primary">Generate LaTeX</button>
    </div>

    <!-- Contact Section -->
    <div class="accordion-section" data-section="contact">
      <button class="accordion-header">
        <span class="material-icons">person</span>
        Contact Info
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <div class="form-grid">
          <div class="form-field"><label>Name</label><input type="text" data-field="contact.name"></div>
          <div class="form-field"><label>Email</label><input type="email" data-field="contact.email"></div>
          <div class="form-field"><label>Phone</label><input type="tel" data-field="contact.phone"></div>
          <div class="form-field"><label>Location</label><input type="text" data-field="contact.location"></div>
          <div class="form-field"><label>LinkedIn</label><input type="url" data-field="contact.linkedin"></div>
          <div class="form-field"><label>Website</label><input type="url" data-field="contact.website"></div>
        </div>
      </div>
    </div>

    <!-- Summary Section -->
    <div class="accordion-section" data-section="summary">
      <button class="accordion-header">
        <span class="material-icons">notes</span>
        Summary
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <textarea data-field="summary" rows="4" placeholder="Professional summary..."></textarea>
      </div>
    </div>

    <!-- Experience Section -->
    <div class="accordion-section" data-section="experience">
      <button class="accordion-header">
        <span class="material-icons">work</span>
        Experience
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <div id="experience-list" class="repeatable-list"></div>
        <button class="btn btn-add" data-add="experience">
          <span class="material-icons">add</span> Add Experience
        </button>
      </div>
    </div>

    <!-- Education Section -->
    <div class="accordion-section" data-section="education">
      <button class="accordion-header">
        <span class="material-icons">school</span>
        Education
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <div id="education-list" class="repeatable-list"></div>
        <button class="btn btn-add" data-add="education">
          <span class="material-icons">add</span> Add Education
        </button>
      </div>
    </div>

    <!-- Skills Section -->
    <div class="accordion-section" data-section="skills">
      <button class="accordion-header">
        <span class="material-icons">psychology</span>
        Skills
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <div class="form-field">
          <label>Technical Skills</label>
          <div class="tag-input" data-field="skills.technical" data-placeholder="Type a skill and press Enter"></div>
        </div>
        <div class="form-field">
          <label>Soft Skills</label>
          <div class="tag-input" data-field="skills.soft" data-placeholder="Type a skill and press Enter"></div>
        </div>
        <div class="form-field">
          <label>Languages</label>
          <div class="tag-input" data-field="skills.languages" data-placeholder="Type a language and press Enter"></div>
        </div>
      </div>
    </div>

    <!-- Certifications Section -->
    <div class="accordion-section" data-section="certifications">
      <button class="accordion-header">
        <span class="material-icons">verified</span>
        Certifications
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <div id="certifications-list" class="repeatable-list"></div>
        <button class="btn btn-add" data-add="certifications">
          <span class="material-icons">add</span> Add Certification
        </button>
      </div>
    </div>

    <!-- Projects Section -->
    <div class="accordion-section" data-section="projects">
      <button class="accordion-header">
        <span class="material-icons">code</span>
        Projects
        <span class="material-icons accordion-arrow">expand_more</span>
      </button>
      <div class="accordion-body">
        <div id="projects-list" class="repeatable-list"></div>
        <button class="btn btn-add" data-add="projects">
          <span class="material-icons">add</span> Add Project
        </button>
      </div>
    </div>
  </div>
</div>
```

**Step 4: Move existing settings into a "settings" tab pane**

Wrap the existing settings view (lines ~161-289) in:

```html
<!-- Settings Tab -->
<div class="tab-pane" id="tab-settings">
  <!-- Existing settings content: dark mode, API keys, guardrails, etc. -->
  <!-- Also add the existing knowledge base, focus areas, custom instructions here -->
</div>
```

Move the model selector, knowledge base, tailoring instructions, and download name from the old main-view into the settings tab.

**Step 5: Commit**

```bash
git add tailored-resume-extension/sidepanel.html
git commit -m "feat: restructure sidepanel with Import/Editor/Settings tabs"
```

---

## Task 12: Extension — Sidepanel CSS for New Components

**Files:**
- Modify: `tailored-resume-extension/style.css` (add new component styles)
- Modify: `tailored-resume-extension/sidepanel.css` (extend)

**Step 1: Add tab navigation styles**

Add to `style.css`:

```css
/* Tab Navigation */
.tab-nav {
  display: flex;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-elevated);
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-btn {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: none;
  color: var(--fg-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.tab-btn:hover { color: var(--fg-primary); }
.tab-btn.active {
  color: var(--accent-icon);
  border-bottom-color: var(--accent-icon);
}

.tab-pane { display: none; padding: 16px; }
.tab-pane.active { display: block; }

/* Accordion */
.accordion-section {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  overflow: hidden;
}

.accordion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: var(--bg-elevated);
  color: var(--fg-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.accordion-arrow {
  margin-left: auto;
  transition: transform 0.2s;
}

.accordion-section.open .accordion-arrow { transform: rotate(180deg); }

.accordion-body {
  display: none;
  padding: 12px 16px;
}

.accordion-section.open .accordion-body { display: block; }

/* Form Grid */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.form-field label {
  display: block;
  font-size: 11px;
  color: var(--fg-secondary);
  margin-bottom: 4px;
  font-weight: 500;
}

.form-field input,
.form-field textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--fg-primary);
  font-size: 13px;
}

/* Tag Input */
.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  min-height: 36px;
  cursor: text;
}

.tag-input .tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--accent-icon);
  color: white;
  border-radius: 12px;
  font-size: 12px;
}

.tag-input .tag .tag-remove {
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
}

.tag-input .tag-input-field {
  border: none;
  outline: none;
  background: none;
  color: var(--fg-primary);
  font-size: 13px;
  flex: 1;
  min-width: 80px;
}

/* Repeatable Cards */
.repeatable-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 8px;
  position: relative;
  background: var(--bg-primary);
}

.repeatable-card .card-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: none;
  color: var(--fg-secondary);
  cursor: pointer;
  font-size: 18px;
}

.repeatable-card .card-remove:hover { color: #e74c3c; }

.btn-add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--fg-secondary);
  cursor: pointer;
  width: 100%;
  justify-content: center;
  font-size: 13px;
}

.btn-add:hover {
  border-color: var(--accent-icon);
  color: var(--accent-icon);
}

/* Import Section */
.import-section { margin-bottom: 20px; }
.import-divider {
  text-align: center;
  color: var(--fg-secondary);
  font-size: 12px;
  margin: 16px 0;
  position: relative;
}
.import-divider span {
  background: var(--bg-primary);
  padding: 0 12px;
  position: relative;
  z-index: 1;
}
.import-divider::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 50%;
  border-top: 1px solid var(--border-default);
}

/* LinkedIn Button */
.btn-linkedin {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #0A66C2;
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  width: 100%;
  justify-content: center;
}
.btn-linkedin:hover { background: #004182; }
.linkedin-icon {
  font-weight: 700;
  font-size: 16px;
}

/* Editor Empty State */
.editor-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--fg-secondary);
}
.editor-empty .material-icons { font-size: 48px; margin-bottom: 12px; }

/* Upload Progress */
.upload-progress { margin-top: 8px; }
.progress-bar {
  height: 4px;
  background: var(--border-default);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent-icon);
  width: 0;
  transition: width 0.3s;
}

.linkedin-steps {
  font-size: 12px;
  color: var(--fg-secondary);
  padding-left: 20px;
  margin: 8px 0 12px;
  line-height: 1.6;
}

.drop-zone-sm { padding: 16px; }
.drop-zone-sm p { font-size: 13px; }
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/style.css tailored-resume-extension/sidepanel.css
git commit -m "feat: add CSS styles for tabs, accordion, editor, and import components"
```

---

## Task 13: Extension — Resume Editor JavaScript

**Files:**
- Create: `tailored-resume-extension/services/resume-editor.js`

**Step 1: Create the editor controller**

This module manages the structured editor state, renders cards, handles tag inputs, and auto-saves to `chrome.storage.local`.

```javascript
// services/resume-editor.js
const ResumeEditor = {
  data: null, // Current structured resume JSON
  container: null, // #editor-content element
  saveTimeout: null,

  init(container) {
    this.container = container;
    this.setupAccordions();
    this.setupAddButtons();
    this.loadFromStorage();
  },

  setupAccordions() {
    this.container.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        header.closest('.accordion-section').classList.toggle('open');
      });
    });
  },

  setupAddButtons() {
    this.container.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.add;
        this.addEntry(section);
      });
    });
  },

  async loadFromStorage() {
    const { resumeStructured } = await chrome.storage.local.get('resumeStructured');
    if (resumeStructured) {
      this.setData(resumeStructured);
    }
  },

  setData(data) {
    this.data = data;
    this.render();
    document.getElementById('editor-empty')?.setAttribute('hidden', '');
    document.getElementById('editor-content')?.removeAttribute('hidden');
  },

  render() {
    if (!this.data) return;

    // Contact fields
    this.container.querySelectorAll('[data-field^="contact."]').forEach(input => {
      const field = input.dataset.field.split('.')[1];
      input.value = this.data.contact?.[field] || '';
      input.addEventListener('input', () => {
        this.data.contact[field] = input.value;
        this.scheduleSave();
      });
    });

    // Summary
    const summaryField = this.container.querySelector('[data-field="summary"]');
    if (summaryField) {
      summaryField.value = this.data.summary || '';
      summaryField.addEventListener('input', () => {
        this.data.summary = summaryField.value;
        this.scheduleSave();
      });
    }

    // Repeatable sections
    this.renderRepeatable('experience', this.data.experience, this.renderExperienceCard.bind(this));
    this.renderRepeatable('education', this.data.education, this.renderEducationCard.bind(this));
    this.renderRepeatable('certifications', this.data.certifications, this.renderCertificationCard.bind(this));
    this.renderRepeatable('projects', this.data.projects, this.renderProjectCard.bind(this));

    // Tag inputs
    this.renderTagInput('skills.technical', this.data.skills?.technical || []);
    this.renderTagInput('skills.soft', this.data.skills?.soft || []);
    this.renderTagInput('skills.languages', this.data.skills?.languages || []);
  },

  renderRepeatable(section, items, cardRenderer) {
    const list = document.getElementById(`${section}-list`);
    if (!list) return;
    list.innerHTML = '';
    (items || []).forEach((item, index) => {
      const card = cardRenderer(item, index, section);
      list.appendChild(card);
    });
  },

  renderExperienceCard(item, index, section) {
    return this.createCard(section, index, [
      { label: 'Title', field: 'title', value: item.title },
      { label: 'Company', field: 'company', value: item.company },
      { label: 'Location', field: 'location', value: item.location },
      { label: 'Start Date', field: 'startDate', value: item.startDate },
      { label: 'End Date', field: 'endDate', value: item.endDate },
      { label: 'Description', field: 'description', value: item.description, type: 'textarea' }
    ]);
  },

  renderEducationCard(item, index, section) {
    return this.createCard(section, index, [
      { label: 'Institution', field: 'institution', value: item.institution },
      { label: 'Degree', field: 'degree', value: item.degree },
      { label: 'Field', field: 'field', value: item.field },
      { label: 'Start Date', field: 'startDate', value: item.startDate },
      { label: 'End Date', field: 'endDate', value: item.endDate },
      { label: 'GPA', field: 'gpa', value: item.gpa }
    ]);
  },

  renderCertificationCard(item, index, section) {
    return this.createCard(section, index, [
      { label: 'Name', field: 'name', value: item.name },
      { label: 'Issuer', field: 'issuer', value: item.issuer },
      { label: 'Date', field: 'date', value: item.date }
    ]);
  },

  renderProjectCard(item, index, section) {
    return this.createCard(section, index, [
      { label: 'Name', field: 'name', value: item.name },
      { label: 'Description', field: 'description', value: item.description, type: 'textarea' },
      { label: 'URL', field: 'url', value: item.url }
    ]);
  },

  createCard(section, index, fields) {
    const card = document.createElement('div');
    card.className = 'repeatable-card';
    card.dataset.index = index;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove';
    removeBtn.innerHTML = '<span class="material-icons">close</span>';
    removeBtn.addEventListener('click', () => {
      this.data[section].splice(index, 1);
      this.scheduleSave();
      this.render();
    });
    card.appendChild(removeBtn);

    const grid = document.createElement('div');
    grid.className = 'form-grid';

    fields.forEach(f => {
      const div = document.createElement('div');
      div.className = 'form-field';
      if (f.type === 'textarea') div.style.gridColumn = '1 / -1';

      const label = document.createElement('label');
      label.textContent = f.label;
      div.appendChild(label);

      const input = f.type === 'textarea'
        ? document.createElement('textarea')
        : document.createElement('input');
      input.value = f.value || '';
      if (f.type === 'textarea') input.rows = 3;

      input.addEventListener('input', () => {
        this.data[section][index][f.field] = input.value;
        this.scheduleSave();
      });

      div.appendChild(input);
      grid.appendChild(div);
    });

    card.appendChild(grid);
    return card;
  },

  renderTagInput(fieldPath, tags) {
    const container = this.container.querySelector(`[data-field="${fieldPath}"]`);
    if (!container) return;

    container.innerHTML = '';
    const [section, subfield] = fieldPath.split('.');

    tags.forEach((tag, i) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = tag;

      const remove = document.createElement('span');
      remove.className = 'tag-remove';
      remove.textContent = '\u00d7';
      remove.addEventListener('click', () => {
        this.data[section][subfield].splice(i, 1);
        this.scheduleSave();
        this.renderTagInput(fieldPath, this.data[section][subfield]);
      });

      tagEl.appendChild(remove);
      container.appendChild(tagEl);
    });

    const input = document.createElement('input');
    input.className = 'tag-input-field';
    input.placeholder = container.dataset.placeholder || 'Add...';
    input.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
        e.preventDefault();
        if (!this.data[section]) this.data[section] = {};
        if (!this.data[section][subfield]) this.data[section][subfield] = [];
        this.data[section][subfield].push(input.value.trim());
        this.scheduleSave();
        this.renderTagInput(fieldPath, this.data[section][subfield]);
      }
    });
    container.appendChild(input);
  },

  addEntry(section) {
    const templates = {
      experience: { title: '', company: '', location: '', startDate: '', endDate: '', description: '', highlights: [] },
      education: { institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '', highlights: [] },
      certifications: { name: '', issuer: '', date: '' },
      projects: { name: '', description: '', technologies: [], url: '' }
    };

    if (!this.data[section]) this.data[section] = [];
    this.data[section].push({ ...templates[section] });
    this.scheduleSave();
    this.render();
  },

  scheduleSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.save(), 500);
  },

  async save() {
    if (!this.data) return;
    await chrome.storage.local.set({ resumeStructured: this.data });
  },

  getData() {
    return this.data;
  }
};
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/services/resume-editor.js
git commit -m "feat: add resume editor controller with accordion, cards, tag inputs, auto-save"
```

---

## Task 14: Extension — LaTeX Template System

**Files:**
- Create: `tailored-resume-extension/services/latex-template.js`

**Step 1: Create LaTeX template generator**

Converts structured JSON into a clean, ATS-friendly LaTeX resume.

```javascript
// services/latex-template.js
function generateLatex(resume) {
  const lines = [];

  lines.push('\\documentclass[letterpaper,11pt]{article}');
  lines.push('\\usepackage[empty]{fullpage}');
  lines.push('\\usepackage{titlesec}');
  lines.push('\\usepackage[usenames,dvipsnames]{color}');
  lines.push('\\usepackage{enumitem}');
  lines.push('\\usepackage[hidelinks]{hyperref}');
  lines.push('\\usepackage[english]{babel}');
  lines.push('\\usepackage{tabularx}');
  lines.push('');
  lines.push('\\addtolength{\\oddsidemargin}{-0.5in}');
  lines.push('\\addtolength{\\evensidemargin}{-0.5in}');
  lines.push('\\addtolength{\\textwidth}{1in}');
  lines.push('\\addtolength{\\topmargin}{-0.5in}');
  lines.push('\\addtolength{\\textheight}{1.0in}');
  lines.push('');
  lines.push('\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule\\vspace{-5pt}]');
  lines.push('');
  lines.push('\\newcommand{\\resumeItem}[1]{\\item\\small{#1\\vspace{-2pt}}}');
  lines.push('\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\ \\textit{\\small#3} & \\textit{\\small #4}\\end{tabular*}\\vspace{-7pt}}');
  lines.push('\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2\\end{tabular*}\\vspace{-7pt}}');
  lines.push('');
  lines.push('\\begin{document}');
  lines.push('');

  // Contact header
  const c = resume.contact || {};
  const contactParts = [c.phone, c.email, c.linkedin, c.website].filter(Boolean);
  lines.push(`\\begin{center}`);
  lines.push(`  \\textbf{\\Huge \\scshape ${escLatex(c.name || 'Your Name')}} \\\\ \\vspace{1pt}`);
  if (c.location) lines.push(`  \\small ${escLatex(c.location)} $|$`);
  lines.push(`  \\small ${contactParts.map(p => escLatex(p)).join(' $|$ ')}`);
  lines.push(`\\end{center}`);
  lines.push('');

  // Summary
  if (resume.summary) {
    lines.push('\\section{Summary}');
    lines.push(escLatex(resume.summary));
    lines.push('');
  }

  // Experience
  if (resume.experience?.length) {
    lines.push('\\section{Experience}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.experience.forEach(exp => {
      lines.push(`  \\resumeSubheading{${escLatex(exp.title)}}{${escLatex(exp.startDate)} -- ${escLatex(exp.endDate)}}{${escLatex(exp.company)}}{${escLatex(exp.location)}}`);
      if (exp.description || exp.highlights?.length) {
        lines.push('  \\begin{itemize}');
        if (exp.description) lines.push(`    \\resumeItem{${escLatex(exp.description)}}`);
        (exp.highlights || []).forEach(h => {
          if (h) lines.push(`    \\resumeItem{${escLatex(h)}}`);
        });
        lines.push('  \\end{itemize}');
      }
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  // Education
  if (resume.education?.length) {
    lines.push('\\section{Education}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.education.forEach(edu => {
      const degreeField = [edu.degree, edu.field].filter(Boolean).join(' in ');
      const gpaStr = edu.gpa ? ` -- GPA: ${escLatex(edu.gpa)}` : '';
      lines.push(`  \\resumeSubheading{${escLatex(edu.institution)}}{${escLatex(edu.startDate)} -- ${escLatex(edu.endDate)}}{${escLatex(degreeField)}${gpaStr}}{}`);
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  // Skills
  const allSkills = [
    ...(resume.skills?.technical || []),
    ...(resume.skills?.soft || []),
    ...(resume.skills?.languages || [])
  ];
  if (allSkills.length) {
    lines.push('\\section{Skills}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    lines.push('  \\small{\\item{');
    if (resume.skills.technical?.length) lines.push(`    \\textbf{Technical:} ${resume.skills.technical.map(escLatex).join(', ')} \\\\`);
    if (resume.skills.soft?.length) lines.push(`    \\textbf{Soft Skills:} ${resume.skills.soft.map(escLatex).join(', ')} \\\\`);
    if (resume.skills.languages?.length) lines.push(`    \\textbf{Languages:} ${resume.skills.languages.map(escLatex).join(', ')}`);
    lines.push('  }}');
    lines.push('\\end{itemize}');
    lines.push('');
  }

  // Projects
  if (resume.projects?.length) {
    lines.push('\\section{Projects}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.projects.forEach(proj => {
      const techStr = proj.technologies?.length ? ` $|$ \\emph{${proj.technologies.map(escLatex).join(', ')}}` : '';
      lines.push(`  \\resumeProjectHeading{\\textbf{${escLatex(proj.name)}}${techStr}}{}`);
      if (proj.description) {
        lines.push('  \\begin{itemize}');
        lines.push(`    \\resumeItem{${escLatex(proj.description)}}`);
        lines.push('  \\end{itemize}');
      }
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  // Certifications
  if (resume.certifications?.length) {
    lines.push('\\section{Certifications}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.certifications.forEach(cert => {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      lines.push(`  \\item\\small{${parts.map(escLatex).join(' -- ')}}`);
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  lines.push('\\end{document}');

  return lines.join('\n');
}

function escLatex(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, m => '\\' + m)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateLatex, escLatex };
}
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/services/latex-template.js
git commit -m "feat: add LaTeX template generator for structured resume JSON"
```

---

## Task 15: Extension — Sidepanel JavaScript Updates

**Files:**
- Modify: `tailored-resume-extension/sidepanel.js` (major updates)
- Modify: `tailored-resume-extension/sidepanel.html` (add script tags)

**Step 1: Add new script tags to sidepanel.html**

Before the existing script tags (line ~295-296), add:

```html
<script src="services/resume-schema.js"></script>
<script src="services/resume-editor.js"></script>
<script src="services/latex-template.js"></script>
<script src="services/linkedin-auth.js"></script>
```

**Step 2: Add tab switching logic to sidepanel.js**

Add after the `init()` call setup (around line 41):

```javascript
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Cross-tab switching buttons
  document.querySelectorAll('[data-switch-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.switchTab;
      document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.click();
    });
  });
}
```

**Step 3: Add file upload handler for PDF/DOCX**

Update the upload handler (lines 227-249) to handle server-parsed formats:

```javascript
async function handleFileUpload(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'tex') {
    // Existing LaTeX handling
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      await chrome.storage.local.set({ resumeLatex: content, resumeFilename: file.name });
      showToast('LaTeX resume loaded', 'success');
      updateBanner();
    };
    reader.readAsText(file);
    return;
  }

  if (ext === 'pdf' || ext === 'docx') {
    // Show progress
    const progress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('upload-progress-fill');
    progress?.removeAttribute('hidden');
    progressFill.style.width = '30%';

    // Get AI credentials for structuring
    const storage = await chrome.storage.local.get(['selectedProvider', 'selectedModelId', 'geminiApiKey', 'claudeApiKey', 'groqApiKey', 'openrouterApiKey']);
    const provider = storage.selectedProvider || 'gemini';
    const apiKeyMap = { gemini: 'geminiApiKey', claude: 'claudeApiKey', groq: 'groqApiKey', openrouter: 'openrouterApiKey' };
    const apiKey = storage[apiKeyMap[provider]] || '';
    const modelId = storage.selectedModelId || '';

    // Upload to server
    const formData = new FormData();
    formData.append('file', file);
    if (apiKey) {
      formData.append('provider', provider);
      formData.append('apiKey', apiKey);
      formData.append('modelId', modelId);
    }

    try {
      progressFill.style.width = '60%';
      const serverUrl = await getServerUrl();
      const resp = await fetch(`${serverUrl}/parse/${ext}`, { method: 'POST', body: formData });
      const result = await resp.json();

      progressFill.style.width = '90%';

      if (result.resume) {
        // AI structuring succeeded — load into editor
        await chrome.storage.local.set({ resumeStructured: result.resume, resumeFilename: file.name });
        ResumeEditor.setData(result.resume);
        document.querySelector('.tab-btn[data-tab="editor"]')?.click();
        showToast('Resume parsed and loaded', 'success');
      } else if (result.rawText) {
        // Raw text only — show message
        showToast('File parsed but could not auto-structure. Please fill in the editor manually.', 'warning');
        // Store raw text for reference
        await chrome.storage.local.set({ resumeRawText: result.rawText, resumeFilename: file.name });
      } else {
        showToast(result.error || 'Failed to parse file', 'error');
      }
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    } finally {
      progressFill.style.width = '100%';
      setTimeout(() => { progress?.setAttribute('hidden', ''); progressFill.style.width = '0'; }, 500);
    }

    updateBanner();
    return;
  }

  showToast(`Unsupported file format: .${ext}`, 'error');
}

async function getServerUrl() {
  // Check config for server URL
  return typeof config !== 'undefined' && config.SERVER_URL
    ? config.SERVER_URL
    : 'http://localhost:3000';
}
```

**Step 4: Add LinkedIn OAuth handler**

```javascript
function setupLinkedIn() {
  const loginBtn = document.getElementById('linkedin-login-btn');
  const logoutBtn = document.getElementById('linkedin-logout');
  const profileSection = document.getElementById('linkedin-profile');
  const exportSection = document.getElementById('linkedin-export-section');
  const linkedinFile = document.getElementById('linkedin-file');
  const linkedinUpload = document.getElementById('linkedin-upload');

  // Check existing auth state
  LinkedInAuth.getAuthState().then(state => {
    if (state.authenticated) {
      showLinkedInLoggedIn();
    }
  });

  loginBtn?.addEventListener('click', async () => {
    const result = await LinkedInAuth.login();
    if (result.success) {
      showLinkedInLoggedIn();
      showToast('Signed in with LinkedIn', 'success');
    } else {
      showToast('LinkedIn sign-in failed: ' + result.error, 'error');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await LinkedInAuth.logout();
    loginBtn?.removeAttribute('hidden');
    profileSection?.setAttribute('hidden', '');
    exportSection?.setAttribute('hidden', '');
    showToast('Signed out of LinkedIn', 'info');
  });

  // LinkedIn ZIP upload
  linkedinUpload?.addEventListener('click', () => linkedinFile?.click());
  linkedinFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleLinkedinExport(file);
  });

  function showLinkedInLoggedIn() {
    loginBtn?.setAttribute('hidden', '');
    profileSection?.removeAttribute('hidden');
    exportSection?.removeAttribute('hidden');
  }
}

async function handleLinkedinExport(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const serverUrl = await getServerUrl();
    const resp = await fetch(`${serverUrl}/parse/linkedin`, { method: 'POST', body: formData });
    const result = await resp.json();

    if (result.success && result.resume) {
      const existing = await chrome.storage.local.get('resumeStructured');
      if (existing.resumeStructured) {
        if (!confirm('This will replace your current resume data. Continue?')) return;
      }

      await chrome.storage.local.set({ resumeStructured: result.resume, resumeFilename: 'LinkedIn Import' });
      ResumeEditor.setData(result.resume);
      document.querySelector('.tab-btn[data-tab="editor"]')?.click();

      if (result.warnings?.length) {
        showToast(`Imported with warnings: ${result.warnings[0]}`, 'warning');
      } else {
        showToast('LinkedIn data imported successfully', 'success');
      }
    } else {
      showToast(result.error || 'Failed to parse LinkedIn export', 'error');
    }
  } catch (err) {
    showToast('LinkedIn import failed: ' + err.message, 'error');
  }
}
```

**Step 5: Add "Generate LaTeX" button handler**

```javascript
function setupEditorActions() {
  document.getElementById('editor-generate-latex')?.addEventListener('click', async () => {
    const data = ResumeEditor.getData();
    if (!data) {
      showToast('No resume data in editor', 'error');
      return;
    }

    const latex = generateLatex(data);
    await chrome.storage.local.set({ resumeLatex: latex });
    showToast('LaTeX generated from editor data. Ready to tailor!', 'success');
    updateBanner();
  });

  document.getElementById('manual-entry-btn')?.addEventListener('click', () => {
    const emptyResume = createEmptyResume();
    ResumeEditor.setData(emptyResume);
    document.querySelector('.tab-btn[data-tab="editor"]')?.click();
  });

  document.getElementById('editor-import-btn')?.addEventListener('click', () => {
    if (ResumeEditor.getData()) {
      if (!confirm('Re-importing will replace your current editor data. Continue?')) return;
    }
    document.querySelector('.tab-btn[data-tab="import"]')?.click();
  });
}
```

**Step 6: Wire everything into init()**

Add calls to `setupTabs()`, `setupLinkedIn()`, `setupEditorActions()`, and `ResumeEditor.init(document.getElementById('editor-content'))` inside the existing `init()` function.

**Step 7: Commit**

```bash
git add tailored-resume-extension/sidepanel.js tailored-resume-extension/sidepanel.html
git commit -m "feat: wire up tab navigation, file uploads, LinkedIn import, and editor in sidepanel"
```

---

## Task 16: Extension — Update Background.js Message Routing

**Files:**
- Modify: `tailored-resume-extension/background.js` (add new message types)

**Step 1: Add new message handlers**

Add to the `handleMessage` async function (after line ~329):

```javascript
case 'GET_STRUCTURED_RESUME': {
  const { resumeStructured } = await chrome.storage.local.get('resumeStructured');
  return { resume: resumeStructured || null };
}

case 'SAVE_STRUCTURED_RESUME': {
  await chrome.storage.local.set({ resumeStructured: request.resume });
  return { success: true };
}

case 'GENERATE_LATEX_FROM_STRUCTURED': {
  // The content panel can request LaTeX generation from structured data
  const { resumeStructured: data } = await chrome.storage.local.get('resumeStructured');
  if (!data) return { error: 'No structured resume data' };
  // Import latex-template.js in service worker context
  // Note: Service worker needs importScripts for this
  return { latex: request.latex }; // Client generates LaTeX and passes it
}
```

**Step 2: Update GET_STATUS to include structured resume info**

In the `GET_STATUS` handler (line ~191), add:

```javascript
const { resumeStructured } = await chrome.storage.local.get('resumeStructured');
// Add to the return object:
// hasStructuredResume: !!resumeStructured
```

**Step 3: Commit**

```bash
git add tailored-resume-extension/background.js
git commit -m "feat: add structured resume message handlers to background service worker"
```

---

## Task 17: Extension — Update Content Panel for Structured Data Awareness

**Files:**
- Modify: `tailored-resume-extension/content-panel.js` (update status check)

**Step 1: Update refreshStatus to check for structured resume**

In `refreshStatus()` (lines 598-618), update to also check for `resumeStructured`:

The content panel's generate flow already sends `GENERATE_RESUME` to background, which reads `resumeLatex` from storage. Since the sidepanel's "Generate LaTeX" button writes to `resumeLatex`, the content panel doesn't need major changes — it will pick up the generated LaTeX automatically.

Update the status check to also consider structured data as "has resume":

```javascript
// In the GET_STATUS response handling, add:
// state.hasResume = resp.hasResume || resp.hasStructuredResume;
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/content-panel.js
git commit -m "feat: update content panel to recognize structured resume data"
```

---

## Task 18: Server — Create Parsers Directory & Add to Docker

**Files:**
- Modify: `tailored-resume-extension/server/Dockerfile`

**Step 1: Ensure parsers directory is included in Docker build**

The Dockerfile should already copy everything via `COPY . .`, but verify and ensure the `parsers/` directory is included. Also update `package.json` to ensure new dependencies are installed.

**Step 2: Commit**

```bash
git add tailored-resume-extension/server/Dockerfile
git commit -m "chore: ensure server Docker build includes parsers directory"
```

---

## Task 19: Integration Testing — End-to-End Verification

**Files:**
- Create: `tailored-resume-extension/server/tests/integration.test.js`

**Step 1: Write integration tests for server endpoints**

```javascript
// server/tests/integration.test.js
const { execSync } = require('child_process');
const path = require('path');

describe('Server Parse Endpoints (integration)', () => {
  let serverProcess;
  const SERVER_URL = 'http://localhost:3001';

  beforeAll(async () => {
    // Start server on test port
    process.env.PORT = 3001;
    // Server would need to be started separately for integration tests
    // This test file assumes the server is running
  });

  test('POST /parse/pdf returns raw text for a text-based PDF', async () => {
    // This test requires a sample PDF in fixtures/
    // Skip if no fixture available
    const fixturePath = path.join(__dirname, 'fixtures', 'sample-resume.pdf');
    try {
      require('fs').accessSync(fixturePath);
    } catch {
      console.log('Skipping: no sample-resume.pdf fixture');
      return;
    }

    const formData = new FormData();
    formData.append('file', new Blob([require('fs').readFileSync(fixturePath)]), 'resume.pdf');

    const resp = await fetch(`${SERVER_URL}/parse/pdf`, { method: 'POST', body: formData });
    const data = await resp.json();

    expect(data.success).toBe(true);
    expect(data.rawText).toBeTruthy();
    expect(data.rawText.length).toBeGreaterThan(20);
  });

  test('POST /parse/linkedin rejects invalid ZIP', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['not a zip file']), 'export.zip');

    const resp = await fetch(`${SERVER_URL}/parse/linkedin`, { method: 'POST', body: formData });
    const data = await resp.json();

    expect(resp.status).toBe(500);
  });
});
```

**Step 2: Commit**

```bash
git add tailored-resume-extension/server/tests/integration.test.js
git commit -m "test: add integration test scaffolding for parse endpoints"
```

---

## Task 20: Final Cleanup & Documentation

**Files:**
- Modify: `tailored-resume-extension/server/server.js` (add CORS for new endpoints)
- Modify: `docs/API.md` (document new endpoints)

**Step 1: Ensure CORS allows the extension origin for parse endpoints**

The existing CORS config in server.js (lines 48-84) should already cover this since it allows the extension origin. Verify the `corsOptions` includes the extension's origin pattern.

**Step 2: Add API documentation for new endpoints**

Add to `docs/API.md`:

```markdown
### POST /parse/pdf
Uploads a PDF file and extracts text. Optionally structures it into resume JSON via AI.

**Body:** `multipart/form-data`
- `file` (required): PDF file
- `provider` (optional): AI provider name (gemini, claude, groq, openrouter)
- `apiKey` (optional): API key for the provider
- `modelId` (optional): Model ID to use

**Response:** `{ success, rawText, resume?, structuringFailed? }`

### POST /parse/docx
Same as PDF but for DOCX files.

### POST /parse/linkedin
Uploads a LinkedIn data export ZIP and returns structured resume JSON.

**Body:** `multipart/form-data`
- `file` (required): ZIP file from LinkedIn data export

**Response:** `{ success, resume, foundFiles, warnings, error? }`
```

**Step 3: Commit**

```bash
git add docs/API.md tailored-resume-extension/server/server.js
git commit -m "docs: add API documentation for parse endpoints"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Schema | Structured resume JSON schema module |
| 2 | Server | Install parsing dependencies |
| 3 | Server | PDF parsing endpoint |
| 4 | Server | DOCX parsing endpoint |
| 5 | Server | LinkedIn CSV export parsing endpoint |
| 6 | Server | Unit tests for parsers |
| 7 | Server | AI-assisted structuring for PDF/DOCX |
| 8 | Extension | Update manifest permissions |
| 9 | Extension | Update file handler for PDF/DOCX |
| 10 | Extension | LinkedIn OAuth service |
| 11 | Extension | Sidepanel HTML restructure (tabs) |
| 12 | Extension | CSS for new components |
| 13 | Extension | Resume editor JavaScript controller |
| 14 | Extension | LaTeX template generator |
| 15 | Extension | Sidepanel JS updates (uploads, LinkedIn, editor wiring) |
| 16 | Extension | Background.js new message handlers |
| 17 | Extension | Content panel structured data awareness |
| 18 | Server | Docker build update |
| 19 | Testing | Integration test scaffolding |
| 20 | Docs | API docs and cleanup |

**Dependencies:** Tasks 1-7 (server) and 8-14 (extension modules) can be done in parallel. Tasks 15-17 depend on both groups. Tasks 18-20 are final cleanup.
