require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const {
  UPLOADS_DIR,
  ensureDirsExist,
  deleteFile,
  deleteFiles,
  registerCleanup
} = require('./utils/fileHelper');

// Initialize app
const app = express();
const PORT = process.env.PORT || 5001;

// Ensure temp/uploads folders exist
ensureDirsExist();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer storage & size limit configurations
const maxFileSizeMb = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 }
});

// Helper: Run shell command as promise
function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Helper: Get LibreOffice executable path
const getSofficePath = () => {
  if (process.env.SOFFICE_PATH && fs.existsSync(process.env.SOFFICE_PATH)) {
    return `"${process.env.SOFFICE_PATH}"`;
  }
  const defaultMacPath = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
  if (fs.existsSync(defaultMacPath)) {
    return `"${defaultMacPath}"`;
  }
  return 'soffice'; // Fallback to path
};

// Helper: Get Ghostscript executable path
const getGsPath = () => {
  if (process.env.GS_PATH) {
    return `"${process.env.GS_PATH}"`;
  }
  return 'gs'; // Fallback to path
};

// Helper: Get pdftoppm executable path
const getPdftoppmPath = () => {
  if (process.env.PDFTOPPM_PATH) {
    return `"${process.env.PDFTOPPM_PATH}"`;
  }
  return 'pdftoppm'; // Fallback to path
};

// --- API ENDPOINTS ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'DocSwift backend is running.' });
});

// 1. PDF to Word (using LibreOffice)
app.post('/api/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const baseName = path.basename(originalName, path.extname(originalName));
  const outputFileName = `${path.basename(inputPath, '.pdf')}.docx`;
  const outputPath = path.join(UPLOADS_DIR, outputFileName);

  const filesToCleanup = [inputPath, outputPath];
  registerCleanup(res, filesToCleanup);

  try {
    const soffice = getSofficePath();
    const cmd = `${soffice} --headless --infilter="writer_pdf_import" --convert-to docx --outdir "${UPLOADS_DIR}" "${inputPath}"`;
    
    await runCommand(cmd);

    if (!fs.existsSync(outputPath)) {
      throw new Error('LibreOffice conversion failed to produce docx file.');
    }

    res.download(outputPath, `${baseName}.docx`, (err) => {
      if (err && !res.headersSent) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to send converted file.' });
      }
    });
  } catch (error) {
    console.error('PDF to Word Conversion Error:', error);
    deleteFiles(filesToCleanup);
    res.status(500).json({
      error: 'Failed to convert PDF to Word. Make sure LibreOffice is installed on the server.',
      details: error.message
    });
  }
});

// 2. Word to PDF (using LibreOffice)
app.post('/api/word-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const baseName = path.basename(originalName, path.extname(originalName));
  const outputFileName = `${path.basename(inputPath, path.extname(inputPath))}.pdf`;
  const outputPath = path.join(UPLOADS_DIR, outputFileName);

  const filesToCleanup = [inputPath, outputPath];
  registerCleanup(res, filesToCleanup);

  try {
    const soffice = getSofficePath();
    const cmd = `${soffice} --headless --convert-to pdf --outdir "${UPLOADS_DIR}" "${inputPath}"`;
    
    await runCommand(cmd);

    if (!fs.existsSync(outputPath)) {
      throw new Error('LibreOffice conversion failed to produce PDF file.');
    }

    res.download(outputPath, `${baseName}.pdf`, (err) => {
      if (err && !res.headersSent) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to send converted file.' });
      }
    });
  } catch (error) {
    console.error('Word to PDF Conversion Error:', error);
    deleteFiles(filesToCleanup);
    res.status(500).json({
      error: 'Failed to convert Word to PDF. Make sure LibreOffice is installed on the server.',
      details: error.message
    });
  }
});

// 3. Image to PDF (using sharp + pdf-lib, pure JS)
app.post('/api/image-to-pdf', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const inputPaths = req.files.map(f => f.path);
  const outputFileName = `${uuidv4()}.pdf`;
  const outputPath = path.join(UPLOADS_DIR, outputFileName);

  const filesToCleanup = [...inputPaths, outputPath];
  registerCleanup(res, filesToCleanup);

  try {
    const pdfDoc = await PDFDocument.create();

    for (const filePath of inputPaths) {
      // Convert image to JPEG using sharp to standardize and get correct dimensions
      const jpegBuffer = await sharp(filePath)
        .jpeg({ quality: 90 })
        .toBuffer();

      const metadata = await sharp(jpegBuffer).metadata();
      const img = await pdfDoc.embedJpg(jpegBuffer);

      // Add a page matching the image dimensions
      const page = pdfDoc.addPage([metadata.width, metadata.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: metadata.width,
        height: metadata.height
      });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    res.download(outputPath, 'docswift-converted.pdf', (err) => {
      if (err && !res.headersSent) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to send converted file.' });
      }
    });
  } catch (error) {
    console.error('Image to PDF Conversion Error:', error);
    deleteFiles(filesToCleanup);
    res.status(500).json({
      error: 'Failed to convert Image to PDF.',
      details: error.message
    });
  }
});

// 4. PDF to Images (using pdftoppm)
app.post('/api/pdf-to-images', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const baseName = path.basename(originalName, path.extname(originalName));
  
  const uniqueId = uuidv4();
  const outputPrefix = path.join(UPLOADS_DIR, uniqueId);
  const filesToCleanup = [inputPath];

  try {
    const pdftoppm = getPdftoppmPath();
    // Run pdftoppm: -png -r 150 (extract images at 150 DPI)
    const cmd = `${pdftoppm} -png -r 150 "${inputPath}" "${outputPrefix}"`;
    
    await runCommand(cmd);

    // Find all generated images matching the prefix
    const files = fs.readdirSync(UPLOADS_DIR);
    const imageFiles = files
      .filter(file => file.startsWith(uniqueId) && file.endsWith('.png'))
      .sort((a, b) => {
        // Sort numerically by page number (e.g. uniqueid-1.png, uniqueid-2.png)
        const numA = parseInt(a.replace(uniqueId + '-', '').replace('.png', ''), 10);
        const numB = parseInt(b.replace(uniqueId + '-', '').replace('.png', ''), 10);
        return numA - numB;
      })
      .map(file => path.join(UPLOADS_DIR, file));

    if (imageFiles.length === 0) {
      throw new Error('No images could be extracted. Make sure poppler is installed on the server.');
    }

    filesToCleanup.push(...imageFiles);

    // If only one image generated, send directly
    if (imageFiles.length === 1) {
      const outputPath = imageFiles[0];
      registerCleanup(res, filesToCleanup);

      res.download(outputPath, `${baseName}-page1.png`, (err) => {
        if (err && !res.headersSent) {
          console.error('Download error:', err);
          res.status(500).json({ error: 'Failed to send image file.' });
        }
      });
    } else {
      // Multiple images -> Zip them
      const zipFileName = `${uuidv4()}.zip`;
      const zipPath = path.join(UPLOADS_DIR, zipFileName);
      filesToCleanup.push(zipPath);
      registerCleanup(res, filesToCleanup);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        res.download(zipPath, `${baseName}-images.zip`, (err) => {
          if (err && !res.headersSent) {
            console.error('Download error:', err);
            res.status(500).json({ error: 'Failed to send zip file.' });
          }
        });
      });

      archive.on('error', (err) => {
        throw err;
      });

      archive.pipe(output);

      imageFiles.forEach((filePath, index) => {
        archive.file(filePath, { name: `page-${index + 1}.png` });
      });

      await archive.finalize();
    }
  } catch (error) {
    console.error('PDF to Images Conversion Error:', error);
    deleteFiles(filesToCleanup);
    res.status(500).json({
      error: 'Failed to convert PDF to Images. Ensure Poppler is installed on the server.',
      details: error.message
    });
  }
});

// 5. Merge PDF (using pdf-lib, pure JS)
app.post('/api/merge-pdf', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const inputPaths = req.files.map(f => f.path);
  const outputFileName = `${uuidv4()}.pdf`;
  const outputPath = path.join(UPLOADS_DIR, outputFileName);

  const filesToCleanup = [...inputPaths, outputPath];
  registerCleanup(res, filesToCleanup);

  try {
    const mergedPdf = await PDFDocument.create();

    for (const filePath of inputPaths) {
      const pdfBytes = fs.readFileSync(filePath);
      const srcPdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(outputPath, mergedPdfBytes);

    res.download(outputPath, 'docswift-merged.pdf', (err) => {
      if (err && !res.headersSent) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to send merged file.' });
      }
    });
  } catch (error) {
    console.error('Merge PDF Error:', error);
    deleteFiles(filesToCleanup);
    res.status(500).json({
      error: 'Failed to merge PDF files.',
      details: error.message
    });
  }
});

// 6. Compress PDF (using Ghostscript with pdf-lib fallback)
app.post('/api/compress-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const baseName = path.basename(originalName, path.extname(originalName));
  const outputFileName = `${uuidv4()}.pdf`;
  const outputPath = path.join(UPLOADS_DIR, outputFileName);

  const filesToCleanup = [inputPath, outputPath];
  registerCleanup(res, filesToCleanup);

  try {
    const gs = getGsPath();
    const cmd = `${gs} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;
    
    try {
      await runCommand(cmd);
      if (!fs.existsSync(outputPath)) {
        throw new Error('Ghostscript produced no output file.');
      }
      console.log('PDF compressed successfully using Ghostscript.');
    } catch (gsError) {
      console.warn('Ghostscript compression failed or not installed. Falling back to pdf-lib structural optimization:', gsError.message);
      
      const pdfBytes = fs.readFileSync(inputPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const optimizedBytes = await pdfDoc.save({ useObjectStreams: true });
      
      fs.writeFileSync(outputPath, optimizedBytes);
    }

    res.download(outputPath, `${baseName}-compressed.pdf`, (err) => {
      if (err && !res.headersSent) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to send compressed file.' });
      }
    });
  } catch (error) {
    console.error('Compress PDF Error:', error);
    deleteFiles(filesToCleanup);
    res.status(500).json({
      error: 'Failed to compress PDF.',
      details: error.message
    });
  }
});

// Global Error Handler for Multer Size Limit
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `File is too large. Maximum size allowed is ${maxFileSizeMb}MB.`
      });
    }
  }
  if (err) {
    console.error('Unhandled Server Error:', err);
    return res.status(500).json({ error: 'An unexpected server error occurred.', details: err.message });
  }
  next();
});

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`DocSwift Backend Server running on port ${PORT}`);
  console.log(`Temporary upload directory: ${UPLOADS_DIR}`);
  console.log(`Max upload size: ${maxFileSizeMb}MB`);
  console.log(`=========================================`);
});
