import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  getAllProposals, createProposal, updateProposal, sendProposal,
  getAllYachts, upsertYachts, getProposalAnalytics,
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
                    <option value="client">Client-facing (full branding)</option>
                    <option value="broker">Broker-friendly (clean/white-label)</option>
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
export default function AdminDashboard() {
  // Load fonts
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
