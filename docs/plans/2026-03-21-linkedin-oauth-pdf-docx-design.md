# Design: LinkedIn OAuth, PDF/DOCX Support & Unified Resume Editor

**Date:** 2026-03-21
**Status:** Approved

## Problem

Agentex currently only accepts LaTeX input, creating friction for users who work with standard document formats (PDF, DOCX). There is no OAuth-based onboarding or LinkedIn integration, requiring users to manually enter all resume data.

## Goals

- Support PDF and DOCX file uploads, converting them to the internal format for tailoring
- Add LinkedIn OAuth for identity and LinkedIn data export upload for full profile import
- Provide a unified structured resume editor that all import methods feed into
- Maintain the existing LaTeX tailoring pipeline as the backend format

## Architecture: Sidepanel-Centric (Approach 3)

### UX Split

**Sidepanel** becomes the "Resume Hub" with three tabs:

1. **Import** — Upload LaTeX/PDF/DOCX files, upload LinkedIn data export (ZIP of CSVs), or enter data manually
2. **Editor** — Unified structured editor showing parsed resume data with editable fields. All import methods populate this same view.
3. **Settings** — Existing settings (API keys, model selection, etc.) remain here

**Floating Panel** stays focused on tailoring:
- Displays current resume summary (from editor)
- Job description input (from current page or manual)
- Generate/tailor button
- PDF preview of tailored output

### Data Flow

```
Import (any source) → Server parses → Structured JSON → Editor (review/edit) → LaTeX template generation → Tailor to job → Compile PDF
```

Structured JSON is the canonical internal format. LaTeX is generated from it when tailoring.

## Server-Side Parsing

Extend the existing Express server with three new endpoints:

### `POST /parse/pdf`
- **Library:** `pdf-parse` for text extraction
- **Structuring:** AI-assisted — send extracted text to the user's configured AI provider to identify sections and return structured JSON
- **Fallback:** If AI structuring fails, return raw text for manual entry

### `POST /parse/docx`
- **Library:** `mammoth.js` for DOCX-to-text conversion
- **Structuring:** Same AI-assisted approach as PDF
- **Fallback:** Same raw text fallback

### `POST /parse/linkedin`
- **Input:** ZIP file from LinkedIn's "Get a copy of your data" feature
- **Parsing:** Direct CSV field mapping (Positions.csv, Education.csv, Skills.csv, Profile.csv)
- **No AI needed:** LinkedIn CSVs have well-defined column structures
- **Language fallback:** Map by column position if headers are non-English

### Structured JSON Schema (shared output)

```json
{
  "contact": { "name", "email", "phone", "location", "linkedin", "website" },
  "summary": "string",
  "experience": [{ "title", "company", "location", "startDate", "endDate", "description", "highlights": [] }],
  "education": [{ "institution", "degree", "field", "startDate", "endDate", "gpa", "highlights": [] }],
  "skills": { "technical": [], "soft": [], "languages": [] },
  "certifications": [{ "name", "issuer", "date" }],
  "projects": [{ "name", "description", "technologies": [], "url" }]
}
```

## LinkedIn OAuth & Data Import

### OAuth Flow

Uses Chrome's `chrome.identity.launchWebAuthFlow` with LinkedIn OpenID Connect:

1. User clicks "Import from LinkedIn" in sidepanel
2. Extension launches LinkedIn OAuth consent screen
3. User authorizes — extension receives basic profile (name, email, picture)
4. Identity stored in `chrome.storage.local`

**Purpose:** Identity only (name/avatar display, potential future sync). LinkedIn's API does not expose full work history.

### Full Profile via Data Export

After OAuth login, a guided flow in the sidepanel:

1. Instructions to download LinkedIn data (Settings > Get a copy of your data)
2. User uploads the resulting ZIP file
3. Extension sends ZIP to `POST /parse/linkedin`
4. Server extracts CSVs, maps to structured JSON, returns it
5. Data populates the unified editor for review

### LinkedIn Developer App

- Scopes: `openid`, `profile`, `email`
- Redirect URI: `https://<extension-id>.chromiumapp.org/`

### Privacy

No LinkedIn data stored server-side. Server parses and returns (stateless). All persistent data stays in `chrome.storage.local`.

## Unified Structured Editor

### Layout

Accordion-style collapsible sections in the sidepanel:

- **Contact Info** — text inputs for name, email, phone, location, links
- **Summary** — textarea for professional summary
- **Experience** — repeatable card group (title, company, location, date range, description, bullet highlights)
- **Education** — repeatable cards (institution, degree, field, dates, GPA, highlights)
- **Skills** — tag-input fields grouped by category (technical, soft, languages)
- **Certifications** — repeatable cards (name, issuer, date)
- **Projects** — repeatable cards (name, description, technologies tags, URL)

### Key Interactions

- Drag-to-reorder within sections
- Add/remove entries with +/trash buttons
- "Import" button re-triggers import flow (with confirmation if data exists)
- "Generate LaTeX" converts editor state to LaTeX via template system

### LaTeX Template System

- Default ATS-friendly resume template ships with extension
- Template uses placeholder markers filled from structured JSON
- Custom template support (map sections to fields) as potential phase 2

### Storage

Editor state (structured JSON) auto-saves to `chrome.storage.local` on edit.

## Error Handling

### PDF/DOCX Parsing Failures
- Image-only/scanned PDFs: clear error message suggesting export from word processor
- AI structuring failure: fall back to raw text in a textarea for manual entry

### LinkedIn Data Export Issues
- Validate ZIP structure for expected CSV filenames
- Show which fields couldn't be imported; let user fill manually
- Handle non-English exports via column-position fallback

### OAuth Failures
- Non-blocking — user can use extension fully without OAuth
- Token expiry: subtle "Re-authenticate" prompt, no functionality blocked

### Large Files
- 10MB upload limit on server
- Upload progress indicator in sidepanel

### Data Conflicts
- Import over existing data triggers confirmation dialog
- Full replacement (no merge) for simplicity

## Testing Strategy

### Server-side (parsing endpoints)
- Unit tests for each parser with sample fixture files
- Schema conformance tests for all output
- Error case tests: corrupted files, empty files, image-only PDFs, unexpected CSV formats

### Extension (editor & import flows)
- Manual testing for OAuth flow
- Editor state persistence tests (save, reload, verify)
- Data flow tests: import -> editor -> LaTeX generation -> tailor -> compile

### Integration
- End-to-end per format: upload sample file -> structured JSON -> editor renders -> LaTeX generated -> PDF compiled

## Non-Goals (Phase 1)

- Custom LaTeX template mapping UI
- LinkedIn API-based profile fetching (API restrictions make this impractical)
- Resume version history / diffing
- Cloud sync of resume data
- Other OAuth providers (Google, GitHub)
