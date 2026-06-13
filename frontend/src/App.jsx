import React, { useState, useRef } from 'react';
import { 
  LayoutDashboard, 
  Image as ImageIcon,
  FileDown, 
  Minimize2, 
  Scissors, 
  FileText, 
  Copy,
  Download, 
  Upload, 
  ArrowRight, 
  AlertTriangle,
  Loader2,
  FileVideo,
  Layers,
  FileImage
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const API_BASE = 'http://localhost:5001/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Shared file states
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const fileInputRef = useRef(null);

  const triggerError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 8000);
  };

  const resetState = () => {
    setSelectedFiles([]);
    setError(null);
    setProgressMsg('');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Generic backend API call
  const processBackendCall = async (endpoint, formData, filename, isZip = false) => {
    setLoading(true);
    setProgressMsg('Uploading and processing...');
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = 'Processing failed.';
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch (e) {
          errorMsg = `Server error: ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      setProgressMsg('Downloading result...');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProgressMsg('Done!');
      setTimeout(() => resetState(), 3000);
    } catch (err) {
      triggerError(err.message);
      setProgressMsg('');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = () => {
    if (selectedFiles.length === 0) {
      triggerError('Please select files first.');
      return;
    }

    const formData = new FormData();
    
    if (activeTab === 'image-to-pdf' || activeTab === 'merge-pdf') {
      selectedFiles.forEach(file => formData.append('files', file));
      processBackendCall(activeTab, formData, activeTab === 'image-to-pdf' ? 'images-converted.pdf' : 'merged.pdf');
    } else if (activeTab === 'compress-pdf' || activeTab === 'split-pdf' || activeTab === 'word-to-pdf') {
      formData.append('file', selectedFiles[0]);
      const filename = activeTab === 'split-pdf' ? 'split_pages.zip' : (activeTab === 'word-to-pdf' ? 'converted.pdf' : 'compressed.pdf');
      processBackendCall(activeTab, formData, filename, activeTab === 'split-pdf');
    } else if (activeTab === 'pdf-to-images') {
      processPdfToImages(selectedFiles[0]);
    }
  };

  // Frontend PDF to Images processing
  const processPdfToImages = async (file) => {
    setLoading(true);
    setProgressMsg('Extracting images from PDF...');
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const zip = new JSZip();

      for (let i = 1; i <= numPages; i++) {
        setProgressMsg(`Processing page ${i} of ${numPages}...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        
        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        zip.file(`page_${i}.jpg`, blob);
      }

      setProgressMsg('Zipping images...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pdf_images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProgressMsg('Done!');
      setTimeout(() => resetState(), 3000);
    } catch (err) {
      console.error(err);
      triggerError('Failed to extract images from PDF.');
      setProgressMsg('');
    } finally {
      setLoading(false);
    }
  };

  const renderUploadZone = (accept, multiple, description) => (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title"><Upload size={18} /> Upload Files</span>
        {selectedFiles.length > 0 && (
          <button className="btn-secondary btn" onClick={resetState}>Clear</button>
        )}
      </div>

      <div 
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange}
          accept={accept}
          multiple={multiple}
        />
        <Upload className="upload-icon" size={48} />
        <div>
          <p style={{ fontWeight: 600 }}>Drag and drop your file(s) here</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>or click to browse local files</p>
        </div>
        <span className="upload-hint">{description}</span>
      </div>

      {selectedFiles.length > 0 && (
        <div className="selected-files-list">
          <h4>Selected Files ({selectedFiles.length}):</h4>
          <ul>
            {selectedFiles.map((f, i) => (
              <li key={i}>
                {f.name} <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>×</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && progressMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', color: 'var(--text-secondary)' }}>
          <Loader2 className="spinner" size={20} />
          <span>{progressMsg}</span>
        </div>
      )}

      <button 
        className="btn btn-primary" 
        style={{ width: '100%', marginTop: '1.5rem' }}
        onClick={handleProcess}
        disabled={loading || selectedFiles.length === 0 || (!multiple && selectedFiles.length > 1) || (activeTab === 'merge-pdf' && selectedFiles.length < 2)}
      >
        {loading ? <Loader2 className="spinner" size={16} /> : <FileDown size={16} />}
        Process Document
      </button>
    </div>
  );

  return (
    <div className="app-container">
      {/* Background blobs for premium glassmorphism effect */}
      <div className="bg-blobs">
        <div className="bg-blob-1"></div>
        <div className="bg-blob-2"></div>
      </div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <a href="#" className="logo-container" onClick={() => setActiveTab('dashboard')}>
          <div className="logo-icon" style={{ background: 'var(--accent-cyan)' }}>
            <FileVideo size={22} color="#fff" />
          </div>
          <span className="logo-text">DocSwift</span>
        </a>

        <nav className="nav-menu">
          <li>
            <button className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); resetState(); }}>
              <LayoutDashboard size={18} /> Dashboard
            </button>
          </li>
          <li className="nav-group-title">PDF Tools</li>
          <li>
            <button className={`nav-link ${activeTab === 'image-to-pdf' ? 'active' : ''}`} onClick={() => { setActiveTab('image-to-pdf'); resetState(); }}>
              <ImageIcon size={18} /> Image to PDF
            </button>
          </li>
          <li>
            <button className={`nav-link ${activeTab === 'merge-pdf' ? 'active' : ''}`} onClick={() => { setActiveTab('merge-pdf'); resetState(); }}>
              <Layers size={18} /> Merge PDF
            </button>
          </li>
          <li>
            <button className={`nav-link ${activeTab === 'compress-pdf' ? 'active' : ''}`} onClick={() => { setActiveTab('compress-pdf'); resetState(); }}>
              <Minimize2 size={18} /> Compress PDF
            </button>
          </li>
          <li>
            <button className={`nav-link ${activeTab === 'split-pdf' ? 'active' : ''}`} onClick={() => { setActiveTab('split-pdf'); resetState(); }}>
              <Scissors size={18} /> Split PDF
            </button>
          </li>
          <li>
            <button className={`nav-link ${activeTab === 'pdf-to-images' ? 'active' : ''}`} onClick={() => { setActiveTab('pdf-to-images'); resetState(); }}>
              <FileImage size={18} /> PDF to Images
            </button>
          </li>
          <li className="nav-group-title">Convert from Word</li>
          <li>
            <button className={`nav-link ${activeTab === 'word-to-pdf' ? 'active' : ''}`} onClick={() => { setActiveTab('word-to-pdf'); resetState(); }}>
              <FileText size={18} /> Word to PDF
            </button>
          </li>
        </nav>

        <div className="sidebar-footer">
          <p>DocSwift v2.0</p>
          <p>Simple Document Converter</p>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="main-content">
        
        {/* Global Error Banner */}
        {error && (
          <div className="alert-box">
            <AlertTriangle size={18} />
            <div>
              <strong>Action Failed:</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Dynamic Content Views */}
        
        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="content-header">
              <h1>Welcome to DocSwift</h1>
              <p>Lightning fast, entirely free, and beautifully simple online document utilities.</p>
            </div>
            
            <div className="dashboard-grid">
              <div className="tool-card" onClick={() => { setActiveTab('image-to-pdf'); resetState(); }}>
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}><ImageIcon size={24} color="#fff" /></div>
                <h3 className="card-title">Image to PDF</h3>
                <p className="card-desc">Convert JPG, PNG images into a single PDF document instantly.</p>
                <div className="card-action">Launch Tool <ArrowRight size={14} /></div>
              </div>

              <div className="tool-card" onClick={() => { setActiveTab('merge-pdf'); resetState(); }}>
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}><Layers size={24} color="#fff" /></div>
                <h3 className="card-title">Merge PDF</h3>
                <p className="card-desc">Combine multiple PDFs into a single, unified document.</p>
                <div className="card-action">Launch Tool <ArrowRight size={14} /></div>
              </div>

              <div className="tool-card" onClick={() => { setActiveTab('compress-pdf'); resetState(); }}>
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}><Minimize2 size={24} color="#fff" /></div>
                <h3 className="card-title">Compress PDF</h3>
                <p className="card-desc">Reduce the file size of your PDF while maintaining quality.</p>
                <div className="card-action">Launch Tool <ArrowRight size={14} /></div>
              </div>

              <div className="tool-card" onClick={() => { setActiveTab('split-pdf'); resetState(); }}>
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}><Scissors size={24} color="#fff" /></div>
                <h3 className="card-title">Split PDF</h3>
                <p className="card-desc">Extract pages from your PDF or save each page as a separate PDF.</p>
                <div className="card-action">Launch Tool <ArrowRight size={14} /></div>
              </div>

              <div className="tool-card" onClick={() => { setActiveTab('pdf-to-images'); resetState(); }}>
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' }}><FileImage size={24} color="#fff" /></div>
                <h3 className="card-title">PDF to Images</h3>
                <p className="card-desc">Extract all pages of a PDF into high-quality JPEG images securely in your browser.</p>
                <div className="card-action">Launch Tool <ArrowRight size={14} /></div>
              </div>

              <div className="tool-card" onClick={() => { setActiveTab('word-to-pdf'); resetState(); }}>
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' }}><FileText size={24} color="#fff" /></div>
                <h3 className="card-title">Word to PDF</h3>
                <p className="card-desc">Convert your DOCX files to PDF format.</p>
                <div className="card-action">Launch Tool <ArrowRight size={14} /></div>
              </div>
            </div>
          </div>
        )}

        {/* Tool Views */}
        {activeTab === 'image-to-pdf' && (
          <div className="workspace-grid">
            {renderUploadZone('image/png, image/jpeg', true, 'Supports JPG, PNG')}
            <div className="panel instructions-panel">
              <h3><ImageIcon size={18} /> About Image to PDF</h3>
              <p>Easily convert multiple images into a single PDF file. Order of upload will be preserved.</p>
            </div>
          </div>
        )}

        {activeTab === 'merge-pdf' && (
          <div className="workspace-grid">
            {renderUploadZone('.pdf', true, 'Select at least 2 PDF files to merge')}
            <div className="panel instructions-panel">
              <h3><Layers size={18} /> About Merge PDF</h3>
              <p>Combine multiple PDFs into one unified document. They will be appended in the order you select them.</p>
            </div>
          </div>
        )}

        {activeTab === 'compress-pdf' && (
          <div className="workspace-grid">
            {renderUploadZone('.pdf', false, 'Select a single PDF file')}
            <div className="panel instructions-panel">
              <h3><Minimize2 size={18} /> About Compress PDF</h3>
              <p>Reduces file size by optimizing document objects and structure.</p>
            </div>
          </div>
        )}

        {activeTab === 'split-pdf' && (
          <div className="workspace-grid">
            {renderUploadZone('.pdf', false, 'Select a multi-page PDF file')}
            <div className="panel instructions-panel">
              <h3><Scissors size={18} /> About Split PDF</h3>
              <p>Splits a PDF into individual pages and downloads them as a convenient ZIP file.</p>
            </div>
          </div>
        )}

        {activeTab === 'word-to-pdf' && (
          <div className="workspace-grid">
            {renderUploadZone('.docx', false, 'Supports Word DOCX files')}
            <div className="panel instructions-panel">
              <h3><FileText size={18} /> About Word to PDF</h3>
              <p>Converts Word documents (DOCX) into PDF format. Complex formatting might be simplified.</p>
            </div>
          </div>
        )}

        {activeTab === 'pdf-to-images' && (
          <div className="workspace-grid">
            {renderUploadZone('.pdf', false, 'Select a PDF file')}
            <div className="panel instructions-panel">
              <h3><FileImage size={18} /> About PDF to Images</h3>
              <p>Extracts all pages from your PDF as high-quality JPEGs. This process runs securely in your browser without sending the file to any server.</p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
