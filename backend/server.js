const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');

// Route controllers
const {
  imageToPdf,
  mergePdf,
  compressPdf,
  splitPdf,
  wordToPdf
} = require('./controllers/docController');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer memory storage configuration (files are kept in memory and never written to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only supported mime types
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
      'text/plain',
      'image/jpeg',
      'image/png'
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.txt') || file.originalname.endsWith('.docx') || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only PDF, DOCX, TXT, JPEG, and PNG files are allowed.'), false);
    }
  }
});

// Routes
app.post('/api/image-to-pdf', upload.array('files', 20), imageToPdf);
app.post('/api/merge-pdf', upload.array('files', 20), mergePdf);
app.post('/api/compress-pdf', upload.single('file'), compressPdf);
app.post('/api/split-pdf', upload.single('file'), splitPdf);
app.post('/api/word-to-pdf', upload.single('file'), wordToPdf);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected error occurred on the server.'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
