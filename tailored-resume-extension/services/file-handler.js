/**
 * File Handler Service
 * 
 * Manages file upload and processing for resume files.
 * Supports LaTeX (.tex), PDF (.pdf), and DOCX (.docx) formats.
 * 
 * @class FileHandler
 * @module services/file-handler
 */
class FileHandler {
  /**
   * Initialize File Handler
   * Sets up LaTeX file handler
   */
  constructor() {
    this.supportedTypes = {
      'tex': this.handleLatex.bind(this),
      'pdf': this.handleBinary.bind(this),
      'docx': this.handleBinary.bind(this)
    };
    this.debug = true;
  }

  /**
   * Log debug messages
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    if (this.debug) {
      console.log('[FileHandler]', ...args);
    }
  }

  /**
   * Handle file upload
   * Routes file to appropriate handler based on extension
   * 
   * @param {File} file - Uploaded file object
   * @returns {Promise<Object>} Processed file data with type, content, and preview
   * @throws {Error} If file type is not supported
   */
  async handleFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const handler = this.supportedTypes[extension];
    
    if (!handler) {
      throw new Error(`Unsupported file type: ${extension}. Only LaTeX (.tex), PDF (.pdf), and DOCX (.docx) files are supported.`);
    }

    this.log('Processing file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    const result = await handler(file);
    const ext = file.name.split('.').pop().toLowerCase();
    result.requiresServerParsing = (ext === 'pdf' || ext === 'docx');
    return result;
  }

  /**
   * Handle LaTeX file
   * Reads file as plain text and validates basic LaTeX structure
   * 
   * @param {File} file - LaTeX file
   * @returns {Promise<Object>} LaTeX content object
   * @throws {Error} If file reading fails or content is invalid
   */
  async handleLatex(file) {
    try {
      const content = await this.readFileAsText(file);
      
      // Basic validation of LaTeX content
      if (!content || content.trim().length === 0) {
        throw new Error('LaTeX file is empty');
      }

      // Check for basic LaTeX structure
      if (!content.includes('\\documentclass') && !content.includes('\\begin{document}')) {
        this.log('Warning: File may not be a valid LaTeX document');
      }

      this.log('LaTeX file processed successfully:', {
        contentLength: content.length,
        hasDocumentClass: content.includes('\\documentclass'),
        hasBeginDocument: content.includes('\\begin{document}')
      });

      return {
        type: 'latex',
        content,
        preview: content,
        success: true
      };
    } catch (error) {
      this.log('LaTeX processing error:', error);
      throw new Error(`Failed to process LaTeX file: ${error.message}`);
    }
  }

  /**
   * Handle binary file (PDF/DOCX)
   * Stores file reference for server-side parsing
   *
   * @param {File} file - Binary file
   * @returns {Promise<Object>} Binary file reference object
   */
  async handleBinary(file) {
    return {
      type: file.name.split('.').pop().toLowerCase(),
      file: file,
      preview: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      success: true
    };
  }

  /**
   * Read file as text
   * @private
   * @param {File} file - File to read
   * @returns {Promise<string>} File content as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

// Register globally for use in the extension
window.FileHandler = FileHandler;
console.log('[FileHandler] File Handler registered successfully (LaTeX, PDF, DOCX)'); 