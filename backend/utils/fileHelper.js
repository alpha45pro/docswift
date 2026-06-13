const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'temp', 'uploads');

// Ensure temp/uploads directory exists
function ensureDirsExist() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Safely delete a file or directory
 * @param {string} filePath 
 */
function deleteFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.error(`Failed to delete temporary file: ${filePath}`, err);
  }
}

/**
 * Clean up multiple files
 * @param {string[]} filePaths 
 */
function deleteFiles(filePaths) {
  if (!Array.isArray(filePaths)) return;
  filePaths.forEach(deleteFile);
}

/**
 * Setup automatic cleanup of files after a response finishes or closes.
 * @param {object} res Express response object
 * @param {string[]} filesToCleanup Array of absolute file paths to delete
 */
function registerCleanup(res, filesToCleanup) {
  const cleanup = () => {
    deleteFiles(filesToCleanup);
  };
  res.on('finish', cleanup);
  res.on('close', cleanup);
}

module.exports = {
  UPLOADS_DIR,
  ensureDirsExist,
  deleteFile,
  deleteFiles,
  registerCleanup
};
