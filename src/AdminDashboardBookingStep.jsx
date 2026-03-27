// AdminDashboardBookingStep.jsx
// Drop this as Step 3 in AdminDashboard.jsx's proposal creation flow.
// Also re-use the "Refresh availability" button in the proposal list view.

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { parseBookingPDF, saveBookingsToSupabase } from "./BookingPDFParser";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const styles = {
  zone: {
    border: '2px dashed #d1d5db',
    borderRadius: 12,
    padding: '2rem',
    textAlign: 'center',
    background: '#f9fafb',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  zoneActive: { borderColor: '#193660', background: '#eff6ff' },
  zoneLabel: { fontSize: 14, color: '#6b7280' },
  statusOk: { background: '#d1fae5', color: '#065f46', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 10 },
  statusErr: { background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 10 },
  statusInfo: { background: '#dbeafe', color: '#1e40af', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 10 },
  yachtPill: {
    display: 'inline-block', background: '#193660', color: '#fff',
    borderRadius: 20, fontSize: 12, padding: '3px 10px', margin: '3px 4px',
  },
};

async function extractTextFromPDF(file) {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join('\n') + '\n';
  }
  return text;
}

export default function BookingPDFStep({ proposalId, onComplete }) {
  const [status, setStatus] = useState(null); // null | 'parsing' | { ok, yachts, saved, errors } | 'error'
  const [dragging, setDragging] = useState(false);

  async function handleFile(file) {
    if (!file || !file.name.endsWith('.pdf')) { setStatus({ ok: false, msg: 'Please upload a PDF file.' }); return; }
    if (!proposalId) { setStatus({ ok: false, msg: 'Save the proposal first before uploading bookings.' }); return; }
    setStatus('parsing');
    try {
      const text = await extractTextFromPDF(file);
      const parsed = parseBookingPDF(text);
      if (!parsed.length) throw new Error('No yachts found in PDF');
      const result = await saveBookingsToSupabase(parsed, proposalId, supabaseUrl, supabaseKey);
      setStatus({ ok: true, yachts: parsed, saved: result.saved, errors: result.errors });
      if (onComplete) onComplete(parsed);
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  const isObj = status && typeof status === 'object';

  return (
    <div>
      <div
        style={{ ...styles.zone, ...(dragging ? styles.zoneActive : {}) }}
        onClick={() => document.getElementById('bookingPdfInput').click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input id="bookingPdfInput" type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        <div style={styles.zoneLabel}>
          <strong>Upload Yachtfolio booking PDF</strong><br />
          Drag & drop or click to browse · Covers all yachts in this proposal
        </div>
      </div>

      {status === 'parsing' && <div style={styles.statusInfo}>⏳ Parsing PDF and saving to Supabase…</div>}
      {isObj && status.ok && (
        <div style={styles.statusOk}>
          ✓ Saved {status.saved} booking{status.saved !== 1 ? 's' : ''} for: {status.yachts.map(y => <span key={y.name} style={styles.yachtPill}>{y.name}</span>)}
          {status.errors.length > 0 && <div style={{ marginTop: 6, color: '#92400e' }}>Warnings: {status.errors.join(', ')}</div>}
        </div>
      )}
      {isObj && !status.ok && <div style={styles.statusErr}>✗ {status.msg}</div>}
    </div>
  );
}
