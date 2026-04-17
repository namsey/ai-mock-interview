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
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    const duration = Date.now() - startTime;
    logWarn('Upload API', `Method ${req.method} not allowed`);
    logRequest('/api/upload', req.method, '/api/upload', 405, duration);
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  logInfo('Upload API', 'File upload request received');

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
      const duration = Date.now() - startTime;
      logWarn('Upload API', 'No file provided in upload request');
      logRequest('/api/upload', 'POST', '/api/upload', 400, duration);
      return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }

    // Handle both single file and array of files
    const file = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

    // Validate file type
    try {
      validateFileType(file.originalFilename || file.newFilename);
    } catch (error) {
      const duration = Date.now() - startTime;
      logWarn('Upload API', `Invalid file type: ${file.originalFilename || file.newFilename}`, error);
      logRequest('/api/upload', 'POST', '/api/upload', 400, duration, error);
      return res.status(400).json({ error: error.message });
    }

    // Read file buffer
    const fileBuffer = await fs.readFile(file.filepath);

    // Validate file size
    try {
      validateFileSize(fileBuffer, 5);
    } catch (error) {
      const duration = Date.now() - startTime;
      logWarn('Upload API', `File too large: ${fileBuffer.length} bytes`, error);
      logRequest('/api/upload', 'POST', '/api/upload', 400, duration, error);
      return res.status(400).json({ error: error.message });
    }

    // Parse the file and extract text
    let extractedText;
    try {
      extractedText = await parseFile(fileBuffer, file.originalFilename || file.newFilename);
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Upload API', `Error parsing file: ${file.originalFilename || file.newFilename}`, error);
      logRequest('/api/upload', 'POST', '/api/upload', 400, duration, error);
      return res.status(400).json({ error: error.message });
    }

    // Clean up temporary file
    try {
      await fs.unlink(file.filepath);
    } catch (cleanupError) {
      logWarn('Upload API', `Error cleaning up temp file: ${file.filepath}`, cleanupError);
      // Don't fail the request if cleanup fails
    }

    // Validate extracted text
    if (!extractedText || extractedText.trim().length < 50) {
      const duration = Date.now() - startTime;
      logWarn('Upload API', `Extracted text too short: ${extractedText?.trim().length || 0} characters`);
      logRequest('/api/upload', 'POST', '/api/upload', 400, duration);
      return res.status(400).json({ 
        error: 'Extracted text is too short. Please ensure your CV contains at least 50 characters of content.' 
      });
    }

    const duration = Date.now() - startTime;
    logInfo('Upload API', `File uploaded successfully: ${file.originalFilename || file.newFilename} (${extractedText.length} characters extracted)`);
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
    logError('Upload API', 'Unexpected error during file upload', error);
    
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
