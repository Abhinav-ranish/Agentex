const mammoth = require('mammoth');

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  if (!text || text.trim().length < 20) {
    return { success: false, error: 'Could not extract meaningful text from DOCX file.', rawText: text || '' };
  }
  return { success: true, rawText: text.trim(), warnings: result.messages.filter(m => m.type === 'warning').map(m => m.message) };
}

module.exports = { parseDocx };
