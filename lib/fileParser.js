/**
 * lib/fileParser.js
 * 
 * Utility for parsing different file types (.txt, .pdf, .docx)
 * Extracts text content from uploaded CV files
 */

const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { logError, logInfo, logWarn } = require('./logger.js');

/**
 * Parse uploaded file and extract text content
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} fileName - Original file name
 * @returns {Promise<string>} Extracted text content
 */
async function parseFile(fileBuffer, fileName) {
  try {
    const fileExtension = fileName.toLowerCase().split('.').pop();
    
    logInfo('File Parser', `Parsing ${fileExtension.toUpperCase()} file: ${fileName}`);
    
    switch (fileExtension) {
      case 'txt':
        return parseTextFile(fileBuffer);
      
      case 'pdf':
        return parsePdfFile(fileBuffer);
      
      case 'doc':
      case 'docx':
        return parseWordFile(fileBuffer);
      
      default:
        throw new Error(`Unsupported file type: .${fileExtension}. Please upload .txt, .pdf, or .docx files.`);
    }
  } catch (error) {
    logError('File Parser', `Error parsing file ${fileName}`, error);
    throw error;
  }
}

/**
 * Parse text file
 */
function parseTextFile(buffer) {
  try {
    return buffer.toString('utf-8');
  } catch (error) {
    throw new Error('Failed to parse text file. Please ensure it is a valid UTF-8 encoded file.');
  }
}

/**
 * Parse PDF file
 */
async function parsePdfFile(buffer) {
  try {
    logInfo('File Parser', `Attempting to parse PDF (${buffer.length} bytes)`);
    
    const data = await pdf(buffer);
    
    logInfo('File Parser', `PDF parsed successfully - extracted ${data.text?.length || 0} characters`);
    
    if (!data.text || data.text.trim().length === 0) {
      logWarn('File Parser', 'PDF file contains no readable text');
      throw new Error('PDF file appears to be empty or contains no readable text.');
    }
    
    return data.text;
  } catch (error) {
    logError('File Parser', 'Failed to parse PDF file', error);
    
    if (error.message.includes('empty') || error.message.includes('readable text')) {
      throw error;
    }
    
    // Provide more specific error message based on error type
    if (error.message.includes('Invalid PDF structure') || error.message.includes('PDF header')) {
      throw new Error('Invalid PDF file format. The file may be corrupted or not a valid PDF.');
    }
    
    throw new Error('Failed to parse PDF file. Please ensure it is a valid PDF document.');
  }
}

/**
 * Parse Word file (.doc, .docx)
 */
async function parseWordFile(buffer) {
  try {
    logInfo('File Parser', `Attempting to parse Word document (${buffer.length} bytes)`);
    
    const result = await mammoth.extractRawText({ buffer });
    
    logInfo('File Parser', `Word document parsed successfully - extracted ${result.value?.length || 0} characters`);
    
    if (!result.value || result.value.trim().length === 0) {
      logWarn('File Parser', 'Word document contains no readable text');
      throw new Error('Word document appears to be empty or contains no readable text.');
    }
    
    // Log any warnings from mammoth
    if (result.messages && result.messages.length > 0) {
      logWarn('File Parser', 'Word document parsing warnings', { messages: result.messages });
    }
    
    return result.value;
  } catch (error) {
    logError('File Parser', 'Failed to parse Word document', error);
    
    if (error.message.includes('empty') || error.message.includes('readable text')) {
      throw error;
    }
    throw new Error('Failed to parse Word document. Please ensure it is a valid .docx file.');
  }
}

/**
 * Validate file size
 * @param {Buffer} buffer - File buffer
 * @param {number} maxSizeMB - Maximum size in MB (default 5MB)
 */
function validateFileSize(buffer, maxSizeMB = 5) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  
  if (buffer.length > maxBytes) {
    throw new Error(`File is too large. Maximum size is ${maxSizeMB}MB.`);
  }
  
  return true;
}

/**
 * Validate file type
 * @param {string} fileName - File name with extension
 */
function validateFileType(fileName) {
  const allowedExtensions = ['txt', 'pdf', 'doc', 'docx'];
  const fileExtension = fileName.toLowerCase().split('.').pop();
  
  if (!allowedExtensions.includes(fileExtension)) {
    throw new Error(`Invalid file type. Please upload one of: ${allowedExtensions.join(', ')}`);
  }
  
  return true;
}

module.exports = {
  parseFile,
  validateFileSize,
  validateFileType
};
