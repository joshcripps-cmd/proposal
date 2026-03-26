import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  getAllProposals, createProposal, updateProposal, sendProposal,
  getAllYachts, upsertYachts, getProposalAnalytics,
  getBookingsByYachtId, addBooking, deleteBooking,
} from "../lib/supabase";

// ── Brand ──
const NAVY = "#0f1d2f";
const RED = "#c43a2b";
const GOLD = "#c9a96e";
const CREAM = "#f7f5f0";

// ── VAT by jurisdiction ──
const VAT_RATES = {
  "Croatia": { rate: 13, note: null },
  "Greece": { rate: 5.2, note: null },
  "Spain": { rate: 21, note: null },
  "France": { rate: 20, note: null },
  "Italy": { rate: 22, note: null },
  "Turkey": { rate: 0, note: "Charter license fees apply" },
  "Montenegro": { rate: 0, note: null },
  "BVI": { rate: 0, note: null },
};

// ── XLSX Column Mapping (Yachtfolio Quick Comparison format) ──
function parseYachtfolioXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) { reject(new Error("No data rows")); return; }

        const headers = rows[0].map(h => (h || "").toString().trim().toLowerCase());
        const yachts = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;

          const get = (label) => {
            const idx = headers.findIndex(h => h.includes(label));
            return idx >= 0 ? row[idx] : null;
          };

          // Extract brochure hyperlink
          const bCell = ws[XLSX.utils.encode_cell({ r: i, c: headers.findIndex(h => h.includes("brochure")) })];
          const brochureUrl = bCell?.l?.Target || bCell?.l?.address || null;

          yachts.push({
            name: (get("yacht name") || get("name") || "").toString().trim(),
            length_m: parseFloat(get("length")) || null,
            builder: (get("builder") || "").toString().trim(),
            cabins: parseInt(get("cabins")) || null,
            cabin_config: (get("cabin config") || get("configuration") || "").toString().trim(),
            guests: parseInt(get("guests")) || null,
            crew: parseInt(get("crew")) || null,
            year_built: parseInt(get("year built") || get("built")) || null,
            year_refit: parseInt(get("year refit") || get("refit")) || null,
            winter_port: (get("winter") || "").toString().trim() || null,
            summer_port: (get("summer") || "").toString().trim() || null,
            price_high: parseFloat(get("price high") || get("high")) || null,
            price_low: parseFloat(get("price low") || get("low")) || null,
            brochure_url: brochureUrl,
            active: true,
          });
        }

        resolve(yachts);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Styles ──
const S = {
  page: { minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif" },
  header: { background: NAVY, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 16, fontWeight: 600, letterSpacing: 2 },
  btn: { padding: "10px 24px", background: RED, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: 1 },
  btnOutline: { padding: "10px 24px", background: "transparent", color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: 1 },
  card: { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16 },
  label: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "#999", textTransform: "uppercase", marginBottom: 6 },
  input: { width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" },
  textarea: { width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", minHeight: 100, resize: "vertical", boxSizing: "border-box" },
};

// ── Proposal List ──
function ProposalList() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getAllProposals().then(p => { setProposals(p || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>ROCCABELLA — PROPOSALS</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={S.btnOutline} onClick={() => navigate("/admin/bookings")}>📅 Bookings</button>
          <button style={S.btn} onClick={() => navigate("/admin/new")}>+ New Proposal</button>
        </div>
      </div>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
        {loading ? <div style={{ color: "#999", textAlign: "center", padding: 40 }}>Loading...</div> : (
          proposals.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
              <div style={{ fontSize: 16, color: NAVY, fontWeight: 600, marginBottom: 8 }}>No proposals yet</div>
              <div style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>Upload a Yachtfolio XLSX to create your first proposal.</div>
              <button style={S.btn} onClick={() => navigate("/admin/new")}>Create Proposal</button>
            </div>
          ) : (
            proposals.map(p => (
              <div key={p.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => navigate(`/admin/view/${p.id}`)}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{p.client_name}</div>
                  <div style={{ fontSize: 13, color: "#777" }}>{p.title} · {p.destination}</div>
                  <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                    {p.yacht_count || 0} yachts · {p.total_views || 0} views · Status: <span style={{ color: p.status === "viewed" ? "#22c55e" : p.status === "sent" ? GOLD : "#999", fontWeight: 600 }}>{p.status}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {p.status === "draft" && <button style={S.btn} onClick={(e) => { e.stopPropagation(); sendProposal(p.id).then(() => window.location.reload()); }}>Send</button>}
                  <button style={S.btnOutline} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/p/${p.slug}`); }}>Copy Link</button>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

// ── New Proposal ──
function NewProposal() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: upload, 2: configure, 3: done
  const [parsedYachts, setParsedYachts] = useState([]);
  const [selectedYachtIds, setSelectedYachtIds] = useState(new Set());
  const [dbYachts, setDbYachts] = useState([]); // yachts after upsert
  const [form, setForm] = useState({
    client_name: "", title: "", destination: "", discount: 0,
    broker_friendly: false, message: "", itinerary_link: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdProposal, setCreatedProposal] = useState(null);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const yachts = await parseYachtfolioXLSX(file);
      setParsedYachts(yachts);
      setSelectedYachtIds(new Set(yachts.map((_, i) => i)));
      // Upsert to Supabase
      const saved = await upsertYachts(yachts);
      setDbYachts(saved);
      setStep(2);
    } catch (err) {
      alert("Failed to parse XLSX: " + err.message);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleCreate = async () => {
    if (!form.client_name || !form.title) { alert("Client name and title are required."); return; }
    setSaving(true);
    try {
      const selectedDbIds = dbYachts.filter((_, i) => selectedYachtIds.has(i)).map(y => y.id);
      const prop = await createProposal({ ...form, yacht_ids: selectedDbIds });
      setCreatedProposal(prop);
      setStep(3);
    } catch (err) {
      alert("Failed to create proposal: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>NEW PROPOSAL</div>
        <button style={S.btnOutline} onClick={() => navigate("/admin")}>← Back</button>
      </div>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        {/* Step 1: Upload */}
        {step === 1 && (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📤</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Upload Yachtfolio XLSX</div>
            <div style={{ fontSize: 14, color: "#777", marginBottom: 24 }}>Quick Comparison export from Yachtfolio. Yachts will be upserted to the database.</div>
            <label style={{ ...S.btn, display: "inline-block", cursor: "pointer" }}>
              {uploading ? "Processing..." : "Choose File"}
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && (
          <>
            {/* Yacht selection */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ ...S.label, marginBottom: 16 }}>Yachts from upload ({dbYachts.length})</div>
              {dbYachts.map((y, i) => (
                <label key={y.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedYachtIds.has(i)} onChange={() => {
                    setSelectedYachtIds(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
                  }} />
                  <div>
                    <div style={{ fontWeight: 600, color: NAVY }}>{y.name}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{y.length_m}m · {y.builder} · {y.guests} guests · €{(y.price_low || 0).toLocaleString()}–€{(y.price_high || 0).toLocaleString()}/wk</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Proposal details */}
            <div style={S.card}>
              <div style={{ ...S.label, marginBottom: 16 }}>Proposal Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={S.label}>Client Name *</div>
                  <input style={S.input} value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Mr. & Mrs. Richardson" />
                </div>
                <div>
                  <div style={S.label}>Proposal Title *</div>
                  <input style={S.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Eastern Mediterranean — Summer 2026" />
                </div>
                <div>
                  <div style={S.label}>Destination</div>
                  <input style={S.input} value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Turkey & Greek Islands" />
                </div>
                <div>
                  <div style={S.label}>Discount %</div>
                  <input style={S.input} type="number" min="0" max="50" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <div style={S.label}>Itinerary Link</div>
                  <input style={S.input} value={form.itinerary_link} onChange={e => setForm(f => ({ ...f, itinerary_link: e.target.value }))} placeholder="https://charteritinerary.com/..." />
                </div>
                <div>
                  <div style={S.label}>Mode</div>
                  <select style={S.select} value={form.broker_friendly ? "broker" : "client"} onChange={e => setForm(f => ({ ...f, broker_friendly: e.target.value === "broker" }))}>
                    <option value="client">Client-facing (Roccabella branding + broker details)</option>
                    <option value="broker">Broker-friendly (neutral — no branding or broker info)</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={S.label}>Personal Message</div>
                <textarea style={S.textarea} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Following our conversation, I've curated a selection of exceptional yachts..." />
              </div>
              <button style={{ ...S.btn, width: "100%" }} onClick={handleCreate} disabled={saving}>
                {saving ? "Creating..." : `Create Proposal with ${selectedYachtIds.size} Yachts`}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Done */}
        {step === 3 && createdProposal && (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Proposal Created</div>
            <div style={{ fontSize: 14, color: "#777", marginBottom: 24 }}>
              <strong>{createdProposal.client_name}</strong> — {createdProposal.title}
            </div>
            <div style={{ background: "#f5f5f5", padding: "14px 20px", borderRadius: 8, fontFamily: "monospace", fontSize: 14, marginBottom: 24, wordBreak: "break-all" }}>
              {window.location.origin}/p/{createdProposal.slug}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={S.btn} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${createdProposal.slug}`); }}>Copy Link</button>
              <button style={S.btnOutline} onClick={() => window.open(`/p/${createdProposal.slug}`, "_blank")}>Preview</button>
              <button style={S.btnOutline} onClick={() => navigate("/admin")}>Back to Dashboard</button>
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 16 }}>Status: <strong>Draft</strong> — Click "Send" from the dashboard to mark as sent.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Router ──
// ── Booking Manager ──
function BookingManager() {
  const [yachts, setYachts] = useState([]);
  const [selectedYacht, setSelectedYacht] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", status: "Booked", route: "" });
  const [pdfParsed, setPdfParsed] = useState(null); // { yachtName: [{start, end, status, route}] }
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAllYachts().then(y => { setYachts(y || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedYacht) { setBookings([]); return; }
    setLoading(true);
    getBookingsByYachtId(selectedYacht.id)
      .then(b => { setBookings(b || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedYacht]);

  // Parse Yachtfolio booking PDF text
  const parseBookingPdf = async (file) => {
    const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(" ") + "\n";
    }
    return parseBookingText(fullText);
  };

  const parseBookingText = (text) => {
    const results = {};
    // Match date patterns: "13 Jun 2026" or "02 Jul 2026"
    const dateRe = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi;
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const parseDate = (str) => {
      const parts = str.trim().split(/\s+/);
      if (parts.length !== 3) return null;
      const d = parts[0].padStart(2, "0");
      const m = months[parts[1].toLowerCase()];
      return m ? `${parts[2]}-${m}-${d}` : null;
    };

    // Split text into lines and find yacht sections
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let currentYacht = null;

    // Known yacht name patterns: all-caps words that appear before date patterns
    // Yachtfolio format: "Last update: DATE YACHT_NAME" or just "YACHT_NAME" as header
    const yachtNameRe = /(?:Last update:.*?\d{2}:\d{2}:\d{2}\s+)?([\w''\-\s]+?)(?=\s+Start|\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i;

    for (const line of lines) {
      // Try to find yacht name — typically all caps, sometimes after "Last update: ..."
      const nameMatch = line.match(/Last update:.*?\d{2}:\d{2}:\d{2}\s+(.+)/);
      if (nameMatch) {
        currentYacht = nameMatch[1].trim();
        if (!results[currentYacht]) results[currentYacht] = [];
        continue;
      }

      // Check if line is just a yacht name (all caps, short)
      if (line.length < 40 && line === line.toUpperCase() && !line.match(/\d/) && line.match(/^[A-Z\s'''\-]+$/)) {
        currentYacht = line.trim();
        if (!results[currentYacht]) results[currentYacht] = [];
        continue;
      }

      if (!currentYacht) continue;

      // Find date pairs in the line
      const dates = [...line.matchAll(dateRe)].map(m => m[1]);
      if (dates.length >= 2) {
        const startDate = parseDate(dates[0]);
        const endDate = parseDate(dates[1]);
        if (!startDate || !endDate) continue;

        // Extract status
        let status = "Booked";
        if (/\bOption\b/i.test(line)) status = "Option";
        else if (/\bHold\b/i.test(line)) status = "Hold";
        else if (/\bBlocked\b/i.test(line)) status = "Blocked";

        // Extract route — text after status keyword, typically "- Location to Location"
        let route = null;
        const routeMatch = line.match(/(?:Booked|Option|Hold|Blocked)\s*-\s*(.+)/i);
        if (routeMatch) route = routeMatch[1].trim();

        results[currentYacht].push({ start: startDate, end: endDate, status, route });
      }
    }
    return results;
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setPdfParsed(null);
    try {
      const parsed = await parseBookingPdf(file);
      const yachtCount = Object.keys(parsed).length;
      const bookingCount = Object.values(parsed).reduce((sum, arr) => sum + arr.length, 0);
      if (bookingCount === 0) {
        setImportResult({ success: false, message: "No booking data found in this PDF. Make sure it's a Yachtfolio Booking List export." });
      } else {
        setPdfParsed(parsed);
        setImportResult({ success: true, message: `Found ${bookingCount} bookings for ${yachtCount} yacht${yachtCount > 1 ? "s" : ""}.` });
      }
    } catch (err) {
      setImportResult({ success: false, message: "Failed to parse PDF: " + err.message });
    }
    setImporting(false);
  };

  const handleImportAll = async () => {
    if (!pdfParsed) return;
    setImporting(true);
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const [yachtName, entries] of Object.entries(pdfParsed)) {
      // Match yacht name to database
      const yacht = yachts.find(y => y.name.toUpperCase() === yachtName.toUpperCase());
      if (!yacht) {
        skipped += entries.length;
        errors.push(`${yachtName}: not found in database`);
        continue;
      }
      for (const entry of entries) {
        try {
          await addBooking({
            yacht_id: yacht.id,
            start_date: entry.start,
            end_date: entry.end,
            status: entry.status,
            route: entry.route || null,
          });
          imported++;
        } catch (e) {
          errors.push(`${yachtName} ${entry.start}: ${e.message}`);
        }
      }
    }

    setPdfParsed(null);
    setImportResult({
      success: true,
      message: `Imported ${imported} booking${imported !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped} (yacht not found)` : ""}.${errors.length > 0 ? " Issues: " + errors.slice(0, 3).join("; ") : ""}`,
    });

    // Refresh bookings if a yacht is selected
    if (selectedYacht) {
      const updated = await getBookingsByYachtId(selectedYacht.id);
      setBookings(updated || []);
    }
    setImporting(false);
  };

  const handleAdd = async () => {
    if (!selectedYacht || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      await addBooking({
        yacht_id: selectedYacht.id,
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
        route: form.route || null,
      });
      const updated = await getBookingsByYachtId(selectedYacht.id);
      setBookings(updated || []);
      setForm({ start_date: "", end_date: "", status: "Booked", route: "" });
    } catch (e) {
      alert("Failed to add booking: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this booking?")) return;
    try {
      await deleteBooking(id);
      setBookings(bookings.filter(b => b.id !== id));
    } catch (e) {
      alert("Failed to delete: " + e.message);
    }
  };

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>BOOKING MANAGER</div>
        <button style={S.btnOutline} onClick={() => navigate("/admin")}>← Back</button>
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* PDF Upload */}
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 4 }}>
            Import from Yachtfolio
          </div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
            Export a Booking List PDF from Yachtfolio and upload it here. Bookings will be matched to yachts in your database by name.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={importing} style={{ fontSize: 13 }} />
            {importing && <span style={{ color: GOLD, fontSize: 13, fontWeight: 500 }}>Processing...</span>}
          </div>
          {importResult && (
            <div style={{
              marginTop: 12, padding: "10px 16px", borderRadius: 8, fontSize: 13,
              background: importResult.success ? "#ecfdf5" : "#fef2f2",
              color: importResult.success ? "#065f46" : "#991b1b",
            }}>
              {importResult.message}
            </div>
          )}
          {pdfParsed && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Preview:</div>
              {Object.entries(pdfParsed).map(([name, entries]) => {
                const matched = yachts.find(y => y.name.toUpperCase() === name.toUpperCase());
                return (
                  <div key={name} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: matched ? NAVY : "#999" }}>
                      {name} {matched ? "✓" : "✗ not in database"}
                      <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>{entries.length} booking{entries.length !== 1 ? "s" : ""}</span>
                    </div>
                    {entries.slice(0, 3).map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#777", marginLeft: 16 }}>
                        {e.start} → {e.end} · {e.status}{e.route ? ` · ${e.route}` : ""}
                      </div>
                    ))}
                    {entries.length > 3 && <div style={{ fontSize: 11, color: "#aaa", marginLeft: 16 }}>+{entries.length - 3} more</div>}
                  </div>
                );
              })}
              <button style={{ ...S.btn, marginTop: 12 }} onClick={handleImportAll} disabled={importing}>
                {importing ? "Importing..." : "Import All Bookings"}
              </button>
            </div>
          )}
        </div>

        {/* Manual entry — Yacht selector */}
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 4 }}>Manual Entry</div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>Select a yacht to add individual bookings or view existing ones.</div>
          <select
            style={S.select}
            value={selectedYacht?.id || ""}
            onChange={e => {
              const y = yachts.find(y => y.id === e.target.value);
              setSelectedYacht(y || null);
            }}
          >
            <option value="">— Choose a yacht —</option>
            {yachts.map(y => (
              <option key={y.id} value={y.id}>{y.name} ({y.length_m}m · {y.builder})</option>
            ))}
          </select>
        </div>

        {selectedYacht && (
          <>
            {/* Add booking form */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 16 }}>
                Add Booking — {selectedYacht.name}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={S.label}>Start Date</div>
                  <input type="date" style={S.input} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <div style={S.label}>End Date</div>
                  <input type="date" style={S.input} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div>
                  <div style={S.label}>Status</div>
                  <select style={S.select} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="Booked">Booked</option>
                    <option value="Option">Option</option>
                    <option value="Hold">Hold</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </div>
                <div>
                  <div style={S.label}>Route / Notes</div>
                  <input style={S.input} placeholder="e.g. Athens to Mykonos" value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))} />
                </div>
              </div>
              <button style={S.btn} onClick={handleAdd} disabled={saving || !form.start_date || !form.end_date}>
                {saving ? "Saving..." : "+ Add Booking"}
              </button>
            </div>

            {/* Existing bookings */}
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 16 }}>
                Current Bookings ({bookings.length})
              </div>
              {loading ? (
                <div style={{ color: "#999", padding: 20, textAlign: "center" }}>Loading...</div>
              ) : bookings.length === 0 ? (
                <div style={{ color: "#999", padding: 20, textAlign: "center" }}>No bookings yet for {selectedYacht.name}</div>
              ) : (
                <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 90px 2fr 50px",
                    padding: "10px 16px", background: NAVY, color: "rgba(255,255,255,0.7)",
                    fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
                  }}>
                    <div>Start</div><div>End</div><div>Status</div><div>Route</div><div></div>
                  </div>
                  {bookings.map((b, i) => (
                    <div key={b.id} style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr 90px 2fr 50px",
                      padding: "10px 16px", borderBottom: i < bookings.length - 1 ? "1px solid #f0f0f0" : "none",
                      background: i % 2 === 0 ? "#fafaf8" : "#fff", fontSize: 13, color: NAVY, alignItems: "center",
                    }}>
                      <div>{formatDate(b.start_date)}</div>
                      <div>{formatDate(b.end_date)}</div>
                      <div>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: b.status === "Option" ? "#fef3cd" : b.status === "Hold" ? "#d1ecf1" : b.status === "Blocked" ? "#e2e3e5" : "#fecdd3",
                          color: b.status === "Option" ? "#856404" : b.status === "Hold" ? "#0c5460" : b.status === "Blocked" ? "#383d41" : "#9b1c31",
                        }}>{b.status}</span>
                      </div>
                      <div style={{ color: "#777", fontSize: 12 }}>{b.route || "—"}</div>
                      <div>
                        <button onClick={() => handleDelete(b.id)} style={{
                          background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 16,
                        }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── PIN Gate ──
const ADMIN_PIN = "2026";
const AUTH_KEY = "rb_proposals_auth";

function PinGate({ onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem(AUTH_KEY, "1");
      onSuccess();
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: CREAM, fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 380, width: "100%", padding: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: 6, color: NAVY, marginBottom: 4 }}>ROCCABELLA</div>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#999", marginBottom: 40 }}>YACHTS</div>
        <div style={{ fontSize: 13, color: NAVY, fontWeight: 600, letterSpacing: 2, marginBottom: 24, textTransform: "uppercase" }}>Proposal Manager</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false); }}
            placeholder="Enter PIN"
            style={{
              width: "100%", padding: "14px 20px", border: error ? `2px solid ${RED}` : "1px solid #ccc",
              borderRadius: 8, fontSize: 16, textAlign: "center", letterSpacing: 8, outline: "none",
              boxSizing: "border-box", marginBottom: 16, background: "#fff",
            }}
            autoFocus
          />
          {error && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>Incorrect PIN</div>}
          <button type="submit" style={{ ...S.btn, width: "100%", padding: "14px 24px" }}>Access Dashboard</button>
        </form>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");

  // Load fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  if (!authed) return <PinGate onSuccess={() => setAuthed(true)} />;

  return (
    <Routes>
      <Route index element={<ProposalList />} />
      <Route path="new" element={<NewProposal />} />
      <Route path="bookings" element={<BookingManager />} />
    </Routes>
  );
}
