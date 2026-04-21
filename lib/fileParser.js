/**
 * lib/fileParser.js
 *
 * Parses uploaded CV files (TXT, PDF, DOCX) into plain text.
 * Phase 1 carry-over — no changes for Phase 2.
 *
 * Supported formats: .txt, .pdf, .doc, .docx
 */

const ALLOWED_EXTENSIONS = ['txt', 'pdf', 'doc', 'docx'];

/**
 * Validates the file extension against allowed types.
 * @param {string} filename
 * @throws {Error} if file type is not supported
 */
function validateFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: .${ext}. Please upload a .txt, .pdf, or .docx file.`);
  }
}

/**
 * Validates file size is within the limit.
 * @param {Buffer} buffer
 * @param {number} maxMB - Maximum file size in megabytes
 * @throws {Error} if file exceeds limit
 */
function validateFileSize(buffer, maxMB = 5) {
  const maxBytes = maxMB * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error(`File is too large. Maximum size is ${maxMB}MB.`);
  }
}

/**
 * Parses a file buffer into plain text based on its extension.
 * @param {Buffer} buffer - File contents
 * @param {string} filename - Original filename (used to determine format)
 * @returns {Promise<string>} Extracted plain text
 */
async function parseFile(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'txt':
      return parseTxt(buffer);
    case 'pdf':
      return parsePdf(buffer);
    case 'doc':
    case 'docx':
      return parseDocx(buffer);
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

// ─── Format Parsers ───────────────────────────────────────────────────────────

function parseTxt(buffer) {
  return buffer.toString('utf-8');
}

async function parsePdf(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('No text found in PDF. The file may be image-based or password protected.');
    }
    return data.text;
  } catch (err) {
    if (err.message.includes('No text found')) throw err;
    throw new Error('Failed to parse PDF. Please ensure it is not encrypted or try pasting your CV text directly.');
  }
}

async function parseDocx(buffer) {
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('No text found in document. Please try pasting your CV text directly.');
    }
    return result.value;
  } catch (err) {
    if (err.message.includes('No text found')) throw err;
    throw new Error('Failed to parse Word document. Please try a .txt file or paste your CV text directly.');
  }
}

module.exports = { parseFile, validateFileType, validateFileSize };
