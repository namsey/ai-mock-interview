/**
 * pages/api/upload.js
 * 
 * API endpoint to handle file uploads (PDF, Word, TXT)
 * Parses the file and returns the extracted text content
 */

import formidable from 'formidable';
import { parseFile, validateFileSize, validateFileType } from '../../lib/fileParser';
import fs from 'fs/promises';

// Disable Next.js default body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
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
      return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }

    // Handle both single file and array of files
    const file = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

    // Validate file type
    try {
      validateFileType(file.originalFilename || file.newFilename);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Read file buffer
    const fileBuffer = await fs.readFile(file.filepath);

    // Validate file size
    try {
      validateFileSize(fileBuffer, 5);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Parse the file and extract text
    let extractedText;
    try {
      extractedText = await parseFile(fileBuffer, file.originalFilename || file.newFilename);
    } catch (error) {
      console.error('[Upload API] Error parsing file:', error);
      return res.status(400).json({ error: error.message });
    }

    // Clean up temporary file
    try {
      await fs.unlink(file.filepath);
    } catch (cleanupError) {
      console.error('[Upload API] Error cleaning up temp file:', cleanupError);
      // Don't fail the request if cleanup fails
    }

    // Validate extracted text
    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Extracted text is too short. Please ensure your CV contains at least 50 characters of content.' 
      });
    }

    // Return the extracted text
    return res.status(200).json({
      success: true,
      text: extractedText,
      fileName: file.originalFilename || file.newFilename,
      fileType: (file.originalFilename || file.newFilename).split('.').pop()
    });

  } catch (error) {
    console.error('[Upload API] Unexpected error:', error);
    
    if (error.message && error.message.includes('maxFileSize')) {
      return res.status(400).json({ error: 'File is too large. Maximum size is 5MB.' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to process file upload. Please try again or paste your CV text directly.' 
    });
  }
}
