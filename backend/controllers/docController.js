const { PDFDocument } = require('pdf-lib');
const archiver = require('archiver');
const mammoth = require('mammoth');
const htmlPdf = require('html-pdf-node');

// 1. Image to PDF
const imageToPdf = async (req, res, next) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images provided.' });
    }

    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
      let image;
      if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
        image = await pdfDoc.embedJpg(file.buffer);
      } else if (file.mimetype === 'image/png') {
        image = await pdfDoc.embedPng(file.buffer);
      } else {
        continue;
      }

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
};

// 2. Merge PDF
const mergePdf = async (req, res, next) => {
  try {
    const files = req.files;
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 PDF files to merge.' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const pdf = await PDFDocument.load(file.buffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=merged.pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
};

// 3. Compress PDF
const compressPdf = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No PDF provided.' });
    }

    // Basic optimization with pdf-lib by loading and saving without redundant objects
    const pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    
    // Setting useObjectStreams to true can slightly reduce size in modern PDFs
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=compressed.pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
};

// 4. Split PDF
const splitPdf = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No PDF provided.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const numberOfPages = pdfDoc.getPageCount();

    if (numberOfPages === 1) {
      return res.status(400).json({ error: 'PDF has only 1 page. Cannot split.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=split_pages.zip');

    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.on('error', function(err) {
      throw err;
    });

    archive.pipe(res);

    for (let i = 0; i < numberOfPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);
      const newPdfBytes = await newPdf.save();
      
      archive.append(Buffer.from(newPdfBytes), { name: `page_${i + 1}.pdf` });
    }

    await archive.finalize();
  } catch (err) {
    next(err);
  }
};

// 5. Word to PDF
const wordToPdf = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No Word document provided.' });
    }

    // Convert Word to HTML
    const result = await mammoth.convertToHtml({ buffer: file.buffer });
    let html = result.value;

    // Simple wrapper to make it look decent
    html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
            img { max-width: 100%; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;

    // Convert HTML to PDF
    const options = { format: 'A4', margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } };
    const pdfFile = { content: html };

    htmlPdf.generatePdf(pdfFile, options).then(pdfBuffer => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
      res.send(pdfBuffer);
    }).catch(err => {
      next(err);
    });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  imageToPdf,
  mergePdf,
  compressPdf,
  splitPdf,
  wordToPdf
};
