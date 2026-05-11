/**
 * pages/api/upload.js
 * 
 * API endpoint to handle file uploads (PDF, Word, TXT)
 * Parses the file and returns the extracted text content
 */

import formidable from 'formidable';
import { parseFile, validateFileSize, validateFileType } from '../../lib/fileParser';
import { logError, logInfo, logWarn, logRequest } from '../../lib/logger.js';
import fs from 'fs/promises';

// Disable Next.js default body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const startTime = Date.now();
  
  logInfo('/api/upload', 'Request received', { method: req.method });
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    logWarn('/api/upload', 'Method not allowed', { method: req.method });
    logRequest('/api/upload', req.method, '/api/upload', 405, Date.now() - startTime);
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    // Parse the multipart form data
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5MB limit
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Get the uploaded file
    const uploadedFile = files.file;
    
    if (!uploadedFile) {
      logWarn('/api/upload', 'No file provided');
      logRequest('/api/upload', 'POST', '/api/upload', 400, Date.now() - startTime);
      return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }

    // Handle both single file and array of files
    const file = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;
    const fileName = file.originalFilename || file.newFilename;
    
    logInfo('/api/upload', 'File received', { fileName, size: file.size });

    // Validate file type
    try {
      validateFileType(fileName);
      logInfo('/api/upload', 'File type validated', { fileName });
    } catch (error) {
      logWarn('/api/upload', 'Invalid file type', { fileName, error: error.message });
      logRequest('/api/upload', 'POST', '/api/upload', 400, Date.now() - startTime, error);
      return res.status(400).json({ error: error.message });
    }

    // Read file buffer
    const fileBuffer = await fs.readFile(file.filepath);

    // Validate file size
    try {
      validateFileSize(fileBuffer, 5);
      logInfo('/api/upload', 'File size validated', { fileName, size: fileBuffer.length });
    } catch (error) {
      logWarn('/api/upload', 'File too large', { fileName, size: fileBuffer.length });
      logRequest('/api/upload', 'POST', '/api/upload', 400, Date.now() - startTime, error);
      return res.status(400).json({ error: error.message });
    }

    // Parse the file and extract text
    let extractedText;
    try {
      logInfo('/api/upload', 'Parsing file', { fileName });
      extractedText = await parseFile(fileBuffer, fileName);
      logInfo('/api/upload', 'File parsed successfully', { fileName, textLength: extractedText.length });
    } catch (error) {
      logError('/api/upload', 'Failed to parse file', error);
      logRequest('/api/upload', 'POST', '/api/upload', 400, Date.now() - startTime, error);
      return res.status(400).json({ error: error.message });
    }

    // Clean up temporary file
    try {
      await fs.unlink(file.filepath);
      logInfo('/api/upload', 'Temp file cleaned up', { filePath: file.filepath });
    } catch (cleanupError) {
      logWarn('/api/upload', 'Failed to clean up temp file', { filePath: file.filepath, error: cleanupError.message });
      // Don't fail the request if cleanup fails
    }

    // Validate extracted text
    if (!extractedText || extractedText.trim().length < 50) {
      logWarn('/api/upload', 'Extracted text too short', { 
        fileName, 
        length: extractedText?.trim().length || 0 
      });
      logRequest('/api/upload', 'POST', '/api/upload', 400, Date.now() - startTime);
      return res.status(400).json({ 
        error: 'Extracted text is too short. Please ensure your CV contains at least 50 characters of content.' 
      });
    }

    const duration = Date.now() - startTime;
    logInfo('/api/upload', 'File uploaded successfully', { 
      fileName, 
      textLength: extractedText.length,
      duration: `${duration}ms`
    });
    logRequest('/api/upload', 'POST', '/api/upload', 200, duration);

    // Return the extracted text
    return res.status(200).json({
      success: true,
      text: extractedText,
      fileName: file.originalFilename || file.newFilename,
      fileType: (file.originalFilename || file.newFilename).split('.').pop()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logError('/api/upload', 'Unexpected error during file upload', error);
    
    if (error.message && error.message.includes('maxFileSize')) {
      logRequest('/api/upload', 'POST', '/api/upload', 400, duration, error);
      return res.status(400).json({ error: 'File is too large. Maximum size is 5MB.' });
    }
    
    logRequest('/api/upload', 'POST', '/api/upload', 500, duration, error);
    return res.status(500).json({ 
      error: 'Failed to process file upload. Please try again or paste your CV text directly.' 
    });
  }
}
