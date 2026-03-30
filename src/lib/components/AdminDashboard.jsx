import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  getAllProposals, createProposal, updateProposal, sendProposal,
  getAllYachts, upsertYachts, getProposalAnalytics,
} from "../lib/supabase";
import { supabase } from "../lib/supabase";

// ── Brand ──
const NAVY = "#0f1d2f";
const RED = "#c43a2b";
const GOLD = "#c9a96e";
const CREAM = "#f7f5f0";
const SLATE = "#64748b";
const WHITE = "#fff";
const BORDER = "#e2e0db";

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

// ══════════════════════════════════════════════════
// Booking PDF Parser (Yachtfolio format)
// After positional reassembly, each PDF row becomes one line.
// Yacht names appear on their own line immediately after a "Last update: ..." line.
// Format per page header: "Last update: DD Mon YYYY HH:MM:SS" then next line = YACHT NAME
// Some yachts have no date after "Last update:" so name follows immediately on next line.
// ══════════════════════════════════════════════════
const DATE_RE = /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const SKIP_SET = new Set(['Start', 'End', 'Status', 'Booking list', 'No records to display']);
const STATUS_RE = /^(Booked|Option|Transit|Shipyard|Boat Show|Unavailable|Flexible use)/i;
const LAST_UPDATE_RE = /^Last update:\s*(?:\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s*)?(.*)$/i;
const DATETIME_ONLY_RE = /^\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}$/;

function parseDate(s) {
  if (!s) return null;
  const p = s.trim().split(/\s+/);
  if (p.length < 3) return null;
  const d = parseInt(p[0]), m = MONTHS[p[1]], y = parseInt(p[2]);
  if (isNaN(d) || m === undefined || isNaN(y)) return null;
  return new Date(y, m, d);
}

function toISO(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseBookingPDFText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Phase 1: Extract yacht names
  // After positional reassembly, a "Last update:" line is followed by:
  //   - optionally a datetime-only line (if name wasn't on same row)
  //   - then the YACHT NAME on its own line
  // OR the name is already extracted inline: "Last update: DD Mon YYYY HH:MM:SS YACHT NAME"
  const yachtNames = [];
  const yachtSet = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!LAST_UPDATE_RE.test(line)) continue;

    const m = LAST_UPDATE_RE.exec(line);
    const inline = (m[1] || '').trim();

    if (inline && !DATETIME_ONLY_RE.test(inline) && !/^\d{2}:\d{2}:\d{2}$/.test(inline)) {
      // Name is inline on the same line
      const name = inline.replace(/\d{2}:\d{2}:\d{2}\s*/, '').trim();
      if (name && !yachtSet.has(name)) { yachtSet.add(name); yachtNames.push(name); }
    } else {
      // Name is on the next non-empty line (skip a possible time-only fragment)
      let j = i + 1;
      while (j < lines.length && /^\d{2}:\d{2}:\d{2}$/.test(lines[j])) j++;
      if (j < lines.length) {
        const name = lines[j].trim();
        // Validate: not a date, not "Last update", not a skip word, not a timestamp
        if (
          name &&
          !LAST_UPDATE_RE.test(name) &&
          !DATE_RE.test(name) &&
          !SKIP_SET.has(name) &&
          !/^\d{2}\/\d{2}\/\d{4}/.test(name) &&
          !/^https?:\/\//.test(name) &&
          !/^\d+\/\d+$/.test(name) &&
          !DATETIME_ONLY_RE.test(name) &&
          name !== 'YACHTFOLIO - Booking list' &&
          !yachtSet.has(name)
        ) {
          yachtSet.add(name);
          yachtNames.push(name);
        }
      }
    }
  }

  if (!yachtNames.length) return [];

  // Build map
  const yachtMap = {};
  for (const n of yachtNames) yachtMap[n] = { name: n, bookings: [] };

  // Phase 2: Walk lines, assign bookings to yachts in order
  // Each "Start" / "End" / "Status" header sequence advances the yacht index
  let yachtIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip boilerplate
    if (LAST_UPDATE_RE.test(line)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
    if (/^https?:\/\//.test(line)) continue;
    if (/^\d+\/\d+$/.test(line)) continue;
    if (line === 'YACHTFOLIO - Booking list') continue;
    if (line === 'No records to display') continue;
    if (DATETIME_ONLY_RE.test(line)) continue;
    if (/^\d{2}:\d{2}:\d{2}$/.test(line)) continue;
    if (yachtSet.has(line)) continue;

    // "Start End Status" header = advance to next yacht
    if (line === 'Start' && lines[i + 1] === 'End' && lines[i + 2] === 'Status') {
      yachtIndex++;
      i += 2;
      continue;
    }
    if (line === 'Start' || line === 'End' || line === 'Status') continue;

    if (yachtIndex < 0 || yachtIndex >= yachtNames.length) continue;
    const currentYacht = yachtMap[yachtNames[yachtIndex]];

    // Parse a booking: DD Mon YYYY line followed by another DD Mon YYYY line
    if (DATE_RE.test(line)) {
      const nextLine = lines[i + 1];
      if (nextLine && DATE_RE.test(nextLine)) {
        const startDate = parseDate(line);
        const endDate = parseDate(nextLine);

        // Collect status+route tokens until next date / header / boilerplate
        const statusParts = [];
        let k = i + 2;
        while (k < lines.length) {
          const l = lines[k];
          if (DATE_RE.test(l)) break;
          if (LAST_UPDATE_RE.test(l)) break;
          if (l === 'Start') break;
          if (/^\d{2}\/\d{2}\/\d{4}/.test(l)) break;
          if (/^https?:\/\//.test(l)) break;
          if (/^\d+\/\d+$/.test(l)) break;
          if (l === 'YACHTFOLIO - Booking list') break;
          if (l === 'No records to display') break;
          if (yachtSet.has(l)) break;
          statusParts.push(l);
          k++;
        }

        const statusRaw = statusParts.join(' ').replace(/[🇮🇹🇬🇷🇭🇷]/gu, '').trim();
        const typeMatch = STATUS_RE.exec(statusRaw);
        const status = typeMatch
          ? typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase()
          : 'Booked';
        const route = statusRaw
          .replace(/^(Booked|Option|Transit|Shipyard|Boat Show|Unavailable|Flexible use)\s*[-–]?\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (startDate && endDate) {
          currentYacht.bookings.push({
            start_date: toISO(startDate),
            end_date: toISO(endDate),
            status,
            route,
          });
        }
        i = k - 1;
      }
    }
  }

  return yachtNames.map(n => yachtMap[n]).filter(y => y.bookings.length > 0);
}
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

async function saveBookingsForProposal(parsedYachts, proposalId, dbYachts) {
  const results = { saved: 0, matched: 0, errors: [] };

  // Build name -> id map from the yachts in the proposal
  const nameMap = {};
  for (const y of dbYachts) {
    nameMap[y.name.toUpperCase()] = y.id;
  }

  // Also look up any yacht names from PDF that aren't in the proposal set
  const unmatchedNames = parsedYachts
    .map(y => y.name.toUpperCase())
    .filter(n => !nameMap[n]);

  if (unmatchedNames.length > 0) {
    const { data } = await supabase
      .from('yachts')
      .select('id, name')
      .in('name', unmatchedNames);
    if (data) {
      for (const y of data) {
        if (!nameMap[y.name.toUpperCase()]) {
          nameMap[y.name.toUpperCase()] = y.id;
        }
      }
    }
  }

  // Delete existing bookings for this proposal (refresh)
  if (proposalId) {
    await supabase.from('yacht_bookings').delete().eq('proposal_id', proposalId);
  }

  // Build all booking rows
  const allRows = [];
  for (const yacht of parsedYachts) {
    const yachtId = nameMap[yacht.name.toUpperCase()] || null;
    if (yachtId) results.matched++;
    for (const b of yacht.bookings) {
      allRows.push({
        proposal_id: proposalId,
        yacht_id: yachtId,
        yacht_name: yacht.name,
        start_date: b.start_date,
        end_date: b.end_date,
        status: b.status,
        route: b.route,
      });
    }
  }

  if (allRows.length > 0) {
    for (let i = 0; i < allRows.length; i += 50) {
      const batch = allRows.slice(i, i + 50);
      const { error } = await supabase.from('yacht_bookings').insert(batch);
      if (error) {
        results.errors.push(error.message);
      } else {
        results.saved += batch.length;
      }
    }
  }

  return results;
}

// ══════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════
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
  statusOk: { background: "#d1fae5", color: "#065f46", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 12 },
  statusErr: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 12 },
  statusInfo: { background: "#dbeafe", color: "#1e40af", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 12 },
  yachtPill: { display: 'inline-block', background: NAVY, color: '#fff', borderRadius: 20, fontSize: 11, padding: '3px 10px', margin: '2px 4px' },
};

// ══════════════════════════════════════════════════
// Proposal List
// ══════════════════════════════════════════════════
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
        <button style={S.btn} onClick={() => navigate("/admin/new")}>+ New Proposal</button>
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

// ══════════════════════════════════════════════════
// New Proposal
// ══════════════════════════════════════════════════
function NewProposal() {
  const navigate = useNavigate();
  const xlsxRef = useRef(null);
  const pdfRef = useRef(null);

  const [step, setStep] = useState(1);
  const [parsedYachts, setParsedYachts] = useState([]);
  const [selectedYachtIds, setSelectedYachtIds] = useState(new Set());
  const [dbYachts, setDbYachts] = useState([]);
  const [form, setForm] = useState({
    client_name: "", title: "", destination: "", discount: 0,
    broker_friendly: false, message: "", itinerary_link: "",
  });

  // Upload states
  const [xlsxUploading, setXlsxUploading] = useState(false);
  const [xlsxStatus, setXlsxStatus] = useState(null);
  const [xlsxDone, setXlsxDone] = useState(false);

  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfStatus, setPdfStatus] = useState(null);
  const [parsedBookings, setParsedBookings] = useState(null);

  const [saving, setSaving] = useState(false);
  const [createdProposal, setCreatedProposal] = useState(null);

  // Handle XLSX upload
  const handleXlsx = useCallback(async (file) => {
    if (!file) return;
    setXlsxUploading(true);
    setXlsxStatus(null);
    try {
      const yachts = await parseYachtfolioXLSX(file);
      setParsedYachts(yachts);
      setSelectedYachtIds(new Set(yachts.map((_, i) => i)));
      const saved = await upsertYachts(yachts);
      setDbYachts(saved);
      setXlsxDone(true);
      setXlsxStatus({ type: "success", message: `${saved.length} yacht${saved.length !== 1 ? 's' : ''} loaded from ${file.name}` });
    } catch (err) {
      setXlsxStatus({ type: "error", message: "Failed to parse XLSX: " + err.message });
    } finally {
      setXlsxUploading(false);
    }
  }, []);

  // Handle Booking PDF upload — v3 with debug
  const handlePdf = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfStatus({ type: "error", message: "Please upload a PDF file." });
      return;
    }
    setPdfUploading(true);
    setPdfStatus(null);
    try {
      const text = await extractTextFromPDF(file);
      // DEBUG: log first 500 chars so we can see what pdfjs produces
      console.log("=== PDF RAW TEXT (first 500 chars) ===");
      console.log(text.substring(0, 500));
      console.log("=== PDF LINES (first 30) ===");
      const debugLines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 30);
      debugLines.forEach((l, i) => console.log(`[${i}] |${l}|`));

      const parsed = parseBookingPDFText(text);
      console.log("=== PARSED YACHTS ===", parsed.length, parsed.map(y => y.name));

      if (!parsed.length) throw new Error("No yachts found in PDF. Open browser console (F12) for debug output.");
      const totalBookings = parsed.reduce((sum, y) => sum + y.bookings.length, 0);
      setParsedBookings(parsed);
      setPdfStatus({
        type: "success",
        message: `${totalBookings} booking${totalBookings !== 1 ? 's' : ''} parsed for ${parsed.length} yacht${parsed.length !== 1 ? 's' : ''}`,
        yachts: parsed,
      });
    } catch (err) {
      setPdfStatus({ type: "error", message: "Failed to parse PDF: " + err.message });
    } finally {
      setPdfUploading(false);
    }
  }, []);

  // Create proposal + save bookings
  const handleCreate = async () => {
    if (!form.client_name || !form.title) { alert("Client name and title are required."); return; }
    setSaving(true);
    try {
      const selectedDbIds = dbYachts.filter((_, i) => selectedYachtIds.has(i)).map(y => y.id);
      const prop = await createProposal({ ...form, yacht_ids: selectedDbIds });

      // Save bookings if PDF was uploaded
      if (parsedBookings && parsedBookings.length > 0) {
        const bookingResult = await saveBookingsForProposal(parsedBookings, prop.id, dbYachts);
        console.log("Bookings saved:", bookingResult);
      }

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
        <button style={{ ...S.btnOutline, color: "#fff", borderColor: "rgba(255,255,255,0.3)" }} onClick={() => navigate("/admin")}>&larr; Back</button>
      </div>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Step 1: Upload XLSX + PDF ── */}
        {step === 1 && (
          <div>
            {/* XLSX Upload */}
            <div style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 28 }}>📊</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: NAVY }}>Yachtfolio XLSX</div>
                  <div style={{ fontSize: 13, color: SLATE }}>Quick Comparison export &mdash; yacht specs and pricing</div>
                </div>
                {xlsxDone && <div style={{ marginLeft: "auto", color: "#22c55e", fontWeight: 600, fontSize: 20 }}>&#10003;</div>}
              </div>

              <div
                style={{
                  border: `2px dashed ${xlsxDone ? "#22c55e" : BORDER}`,
                  borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer",
                  background: xlsxDone ? "#f0fdf4" : WHITE,
                  transition: "all 0.15s",
                }}
                onClick={() => xlsxRef.current?.click()}
              >
                <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                  onChange={e => { handleXlsx(e.target.files[0]); e.target.value = ''; }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: xlsxDone ? "#166534" : NAVY }}>
                  {xlsxUploading ? "Processing\u2026" : xlsxDone ? "\u2713 XLSX Loaded \u2014 click to replace" : "Click to upload XLSX"}
                </div>
                <div style={{ fontSize: 12, color: SLATE, marginTop: 4 }}>Yachtfolio Quick Comparison export</div>
              </div>

              {xlsxStatus && (
                <div style={xlsxStatus.type === "success" ? S.statusOk : S.statusErr}>
                  {xlsxStatus.type === "success" ? "\u2713 " : "\u2717 "}{xlsxStatus.message}
                </div>
              )}
            </div>

            {/* PDF Upload */}
            <div style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 28 }}>📋</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: NAVY }}>Booking PDF</div>
                  <div style={{ fontSize: 13, color: SLATE }}>Yachtfolio booking list &mdash; availability and routes (optional)</div>
                </div>
                {parsedBookings && <div style={{ marginLeft: "auto", color: "#22c55e", fontWeight: 600, fontSize: 20 }}>&#10003;</div>}
              </div>

              <div
                style={{
                  border: `2px dashed ${parsedBookings ? "#22c55e" : BORDER}`,
                  borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer",
                  background: parsedBookings ? "#f0fdf4" : WHITE,
                  transition: "all 0.15s",
                }}
                onClick={() => pdfRef.current?.click()}
              >
                <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={e => { handlePdf(e.target.files[0]); e.target.value = ''; }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: parsedBookings ? "#166534" : NAVY }}>
                  {pdfUploading ? "Parsing PDF\u2026" : parsedBookings ? "\u2713 Bookings loaded \u2014 click to replace" : "Click to upload PDF"}
                </div>
                <div style={{ fontSize: 12, color: SLATE, marginTop: 4 }}>Booking data shows as availability calendar in the proposal</div>
              </div>

              {pdfStatus && (
                <div style={pdfStatus.type === "success" ? S.statusOk : S.statusErr}>
                  {pdfStatus.type === "success" ? "\u2713 " : "\u2717 "}{pdfStatus.message}
                  {pdfStatus.yachts && (
                    <div style={{ marginTop: 6 }}>
                      {pdfStatus.yachts.map(y => (
                        <span key={y.name} style={S.yachtPill}>
                          {y.name} ({y.bookings.length})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Continue button */}
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button
                style={{
                  ...S.btn,
                  opacity: xlsxDone ? 1 : 0.4,
                  cursor: xlsxDone ? "pointer" : "not-allowed",
                  padding: "14px 48px",
                  fontSize: 14,
                }}
                disabled={!xlsxDone}
                onClick={() => setStep(2)}
              >
                Continue to Proposal Details &rarr;
              </button>
              {!xlsxDone && (
                <div style={{ fontSize: 12, color: SLATE, marginTop: 8 }}>Upload the XLSX first to continue</div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ── */}
        {step === 2 && (
          <>
            {/* Yacht selection */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ ...S.label, marginBottom: 16 }}>
                Yachts from upload ({dbYachts.length})
                {parsedBookings && (
                  <span style={{ color: "#22c55e", fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 12 }}>
                    + booking data for {parsedBookings.length} yacht{parsedBookings.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {dbYachts.map((y, i) => {
                const hasBookings = parsedBookings?.some(pb => pb.name.toUpperCase() === y.name.toUpperCase());
                return (
                  <label key={y.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedYachtIds.has(i)} onChange={() => {
                      setSelectedYachtIds(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: NAVY }}>
                        {y.name}
                        {hasBookings && <span style={{ marginLeft: 8, fontSize: 11, color: "#22c55e", fontWeight: 500 }}>📅 bookings</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#999" }}>
                        {y.length_m}m &middot; {y.builder} &middot; {y.guests} guests &middot; &euro;{(y.price_low || 0).toLocaleString()}&ndash;&euro;{(y.price_high || 0).toLocaleString()}/wk
                      </div>
                    </div>
                  </label>
                );
              })}
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
                    <option value="client">Client-facing (full branding)</option>
                    <option value="broker">Broker-friendly (clean/white-label)</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={S.label}>Personal Message</div>
                <textarea style={S.textarea} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Following our conversation, I've curated a selection of exceptional yachts..." />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={S.btnOutline} onClick={() => setStep(1)}>&larr; Back</button>
                <button style={{ ...S.btn, flex: 1 }} onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating\u2026" : `Create Proposal with ${selectedYachtIds.size} Yacht${selectedYachtIds.size !== 1 ? 's' : ''}${parsedBookings ? ' + Bookings' : ''}`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && createdProposal && (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Proposal Created</div>
            <div style={{ fontSize: 14, color: "#777", marginBottom: 8 }}>
              <strong>{createdProposal.client_name}</strong> &mdash; {createdProposal.title}
            </div>
            {parsedBookings && (
              <div style={{ fontSize: 13, color: "#22c55e", marginBottom: 16 }}>
                📅 Booking data saved for {parsedBookings.length} yacht{parsedBookings.length !== 1 ? 's' : ''}
              </div>
            )}
            <div style={{ background: "#f5f5f5", padding: "14px 20px", borderRadius: 8, fontFamily: "monospace", fontSize: 14, marginBottom: 24, wordBreak: "break-all" }}>
              {window.location.origin}/p/{createdProposal.slug}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={S.btn} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${createdProposal.slug}`); }}>Copy Link</button>
              <button style={S.btnOutline} onClick={() => window.open(`/p/${createdProposal.slug}`, "_blank")}>Preview</button>
              <button style={S.btnOutline} onClick={() => navigate("/admin")}>Back to Dashboard</button>
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 16 }}>Status: <strong>Draft</strong> &mdash; Click "Send" from the dashboard to mark as sent.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Router
// ══════════════════════════════════════════════════
export default function AdminDashboard() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  return (
    <Routes>
      <Route index element={<ProposalList />} />
      <Route path="new" element={<NewProposal />} />
    </Routes>
  );
}
