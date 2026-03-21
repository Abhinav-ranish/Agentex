const pdfParse = require('pdf-parse');

async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;
  if (!text || text.trim().length < 20) {
    return { success: false, error: 'Could not extract meaningful text from PDF. This may be an image-based/scanned PDF. Try exporting from your word processor instead.', rawText: text || '' };
  }
  return { success: true, rawText: text.trim(), pageCount: data.numpages };
}

module.exports = { parsePdf };
