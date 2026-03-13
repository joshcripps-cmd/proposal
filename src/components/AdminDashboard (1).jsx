import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { getAllProposals, getAllYachts, createProposal, updateProposal, upsertYachts } from "../lib/supabase";

// ── Brand ──
const NAVY = "#0f1d2f";
const RED = "#c43a2b";
const GOLD = "#c9a96e";
const SLATE = "#64748b";
const WHITE = "#fff";
const BORDER = "#e2e0db";
const BG = "#f1efe9";

const LOGO_WHITE = "/logo-white.png";

// ── VAT Jurisdictions ──
const VAT_JURISDICTIONS = [
  { id: "croatia",    label: "Croatia",    rate: 13,  note: null },
  { id: "greece",     label: "Greece",     rate: 5.2, note: null },
  { id: "spain",      label: "Spain",      rate: 21,  note: null },
  { id: "france",     label: "France",     rate: 20,  note: null },
  { id: "italy",      label: "Italy",      rate: 22,  note: null },
  { id: "turkey",     label: "Turkey",     rate: 0,   note: "Charter license fees apply" },
  { id: "montenegro", label: "Montenegro", rate: 0,   note: null },
  { id: "bvi",        label: "BVI",        rate: 0,   note: null },
];

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://luxury-mermaid-cdae15.netlify.app";

// ── Yachtfolio image helper ──
// Brochure URL format: https://www.yachtfolio.com/e-brochure/SLUG/token
// Image URL format:    https://www.yachtfolio.com/uploads/yachts/SLUG/photos/photo_1.jpg
const getYachtImage = (yacht) => {
  if (yacht.image_url) return yacht.image_url;
  if (yacht.brochure_url) {
    const match = yacht.brochure_url.match(/\/e-brochure\/([^\/]+)\//);
    if (match) return `https://www.yachtfolio.com/uploads/yachts/${match[1]}/photos/photo_1.jpg`;
  }
  return null;
};

// ── Helpers ──
const formatPrice = (p) => {
  if (!p || p === "TBC" || p === "POA") return "POA";
  const v = typeof p === "string" ? parseInt(p.replace(/[^0-9]/g, "")) : p;
  return isNaN(v) ? "POA" : `€${v.toLocaleString()}`;
};

const formatPriceWithDiscount = (price, discountPct) => {
  if (!price || price === "TBC" || price === "POA") return { original: "POA", discounted: null, rawVal: null };
  const v = typeof price === "string" ? parseInt(price.replace(/[^0-9]/g, "")) : price;
  if (isNaN(v)) return { original: "POA", discounted: null, rawVal: null };
  const original = `€${v.toLocaleString()}`;
  if (!discountPct || discountPct <= 0) return { original, discounted: null, rawVal: v };
  const discountedVal = Math.round(v * (1 - discountPct / 100));
  return { original, discounted: `€${discountedVal.toLocaleString()}`, rawVal: discountedVal };
};

const getVatInfo = (id) => VAT_JURISDICTIONS.find(j => j.id === id);

const copyToClipboard = async (text, onSuccess) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement("textarea");
      el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
      document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
    if (onSuccess) onSuccess();
  } catch (err) { console.error("Copy failed:", err); }
};

// ── XLSX Parser ──
// Extracts hyperlinks from column B (Brochure link) for Yachtfolio image URLs
const parseXlsxFile = (file, onSuccess, onError) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Extract hyperlink URLs from the sheet (column B = brochure links)
      // SheetJS stores hyperlinks in cell.l.Target
      const brochureByRow = {};
      Object.entries(ws).forEach(([addr, cell]) => {
        if (addr.startsWith("B") && cell.l && cell.l.Target) {
          const rowNum = parseInt(addr.slice(1));
          if (rowNum > 1) brochureByRow[rowNum] = cell.l.Target;
        }
      });

      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const mapped = rows
        .filter(r => Object.values(r).some(v => v !== ""))
        .map((row, i) => {
          const rowNum = i + 2; // +2 because row 1 is header
          const brochure_url = brochureByRow[rowNum] || null;
          return {
            id: `yacht_${Date.now()}_${i}`,
            brochure_url,
            image_url: null,
            name: row["Yacht name"] || row["name"] || row["Vessel"] || "Unknown",
            length_m: row["Length [m]"] || row["Length"] || row["LOA"] || "",
            builder: row["Builder"] || row["Shipyard"] || "",
            cabins: parseInt(row["Cabins"] || row["Staterooms"] || 0) || 0,
            cabin_config: row["Cabin configuration"] || row["Layout"] || "",
            guests: parseInt(row["Guests sleeping"] || row["Guests"] || row["PAX"] || 0) || 0,
            crew: parseInt(row["Crew"] || 0) || 0,
            year_built: parseInt(row["Year built"] || row["Built"] || 0) || null,
            year_refit: parseInt(row["Year refit"] || row["Refit"] || 0) || null,
            price_high: row["Price high"] || row["High season"] || "",
            price_low: row["Price low"] || row["Low season"] || "",
            summer_port: row["Current Summer Base Port"] || row["Summer base"] || row["Summer"] || "",
            winter_port: row["Current Winter Base Port"] || row["Winter base"] || row["Winter"] || "",
            discount: 0,
          };
        });
      onSuccess(mapped);
    } catch (err) { onError(err.message); }
  };
  reader.readAsArrayBuffer(file);
};

// ── PDF Generator (iframe-based, no popup blocker issues) ──
const generatePDF = (proposal, yachts, vatInfo) => {
  const yachtsHtml = yachts.map(y => {
    const pi = formatPriceWithDiscount(y.price_high, y.discount || 0);
    const displayPrice = pi.discounted || pi.original;
    const rawVal = pi.rawVal;
    const vatAmt = vatInfo && vatInfo.rate > 0 && rawVal ? Math.round(rawVal * vatInfo.rate / 100) : null;
    const imgUrl = getYachtImage(y);
    return `
      <div style="margin-bottom:28px;padding:20px;border:1px solid #e2e0db;border-radius:6px;page-break-inside:avoid;">
        ${imgUrl ? `<img src="${imgUrl}" style="width:100%;height:180px;object-fit:cover;border-radius:4px;margin-bottom:14px;" onerror="this.style.display='none'" />` : ""}
        <h3 style="margin:0 0 4px;color:#0f1d2f;font-size:18px;font-family:Georgia,serif;">${y.name}</h3>
        <p style="margin:0 0 10px;color:#64748b;font-size:13px;">${y.length_m}m · ${y.builder || ""} · ${y.cabins} cabins · ${y.guests} guests${y.year_built ? ` · Built ${y.year_built}` : ""}${y.year_refit ? ` / Refit ${y.year_refit}` : ""}</p>
        <div style="font-size:16px;font-weight:700;color:#0f1d2f;">
          ${pi.discounted
            ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:14px;font-weight:400;margin-right:8px;">${pi.original}</span><span style="color:#c43a2b;">${pi.discounted}</span><span style="background:#fee2e2;color:#c43a2b;padding:2px 8px;border-radius:8px;font-size:12px;margin-left:8px;">-${y.discount}%</span>`
            : displayPrice}
        </div>
        ${vatAmt ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">+${vatInfo.rate}% VAT = €${vatAmt.toLocaleString()} · Total incl. VAT: €${(rawVal + vatAmt).toLocaleString()}</div>` : ""}
        ${vatInfo?.note ? `<div style="font-size:11px;color:#854d0e;margin-top:2px;">⚠ ${vatInfo.note}</div>` : ""}
        <p style="font-size:11px;color:#94a3b8;margin:8px 0 0;">Based: ${y.summer_port || "TBC"}</p>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>${proposal.client_name} — Proposal</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f1d2f; background: #fff; padding: 40px; max-width: 750px; margin: 0 auto; }
      @media print { body { padding: 20px; } .no-print { display: none; } }
    </style>
  </head><body>
    <div style="border-bottom:3px solid #0f1d2f;padding-bottom:20px;margin-bottom:28px;">
      <h1 style="font-size:28px;font-family:Georgia,serif;margin-bottom:4px;">${proposal.title || proposal.client_name}</h1>
      <p style="color:#64748b;font-size:14px;">${proposal.client_name}${vatInfo ? ` · ${vatInfo.label} (${vatInfo.rate}% VAT${vatInfo.note ? ` — ⚠ ${vatInfo.note}` : ""})` : ""}</p>
    </div>
    ${proposal.message ? `<div style="background:#f1efe9;padding:16px;border-radius:6px;font-size:14px;margin-bottom:28px;font-style:italic;line-height:1.6;">"${proposal.message}"</div>` : ""}
    <h2 style="font-size:18px;font-family:Georgia,serif;margin-bottom:18px;">Yacht Selection</h2>
    ${yachtsHtml || "<p style='color:#64748b;'>No yachts in this proposal.</p>"}
    <div style="border-top:1px solid #e2e0db;padding-top:14px;margin-top:32px;font-size:11px;color:#94a3b8;">
      Generated by Roccabella Yachts · ${new Date().toLocaleDateString("en-GB")} · All prices in EUR, excl. APA unless stated
    </div>
    <script>window.onload = function() { window.print(); }<\/script>
  </body></html>`;

  // Use hidden iframe — bypasses popup blockers
  const existing = document.getElementById("pdf-iframe");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "pdf-iframe";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
};

// ───────────────────────────────────────────── SIDEBAR
function Sidebar({ active, onNavigate }) {
  const items = [
    { key: "proposals", label: "Proposals",     icon: "📋" },
    { key: "create",    label: "New Proposal",  icon: "✦"  },
    { key: "yachts",    label: "Yacht Database", icon: "⚓" },
    { key: "settings",  label: "Settings",      icon: "⚙"  },
  ];
  return (
    <div style={{ width: 240, background: NAVY, minHeight: "100vh", padding: "24px 0", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100 }}>
      <div style={{ padding: "0 24px 28px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <img src={LOGO_WHITE} alt="Roccabella" style={{ height: 34, width: "auto", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
        <div style={{ color: GOLD, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 8, opacity: 0.8 }}>Proposal Manager</div>
      </div>
      <nav style={{ padding: "16px 12px", flex: 1 }}>
        {items.map(item => (
          <button key={item.key} onClick={() => onNavigate(item.key)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans',sans-serif", marginBottom: 4, background: active === item.key ? "rgba(201,169,110,0.12)" : "transparent", color: active === item.key ? GOLD : "rgba(255,255,255,0.65)", fontWeight: active === item.key ? 600 : 400, textAlign: "left", transition: "all 0.15s" }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
        josh@roccabellayachts.com
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── STAT CARD
function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 22px" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || NAVY, fontFamily: "'DM Serif Display',serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: SLATE, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

// ───────────────────────────────────────────── STATUS BADGE
function StatusBadge({ status }) {
  const cfg = { sent: ["#dcfce7","#166534","Sent"], draft: ["#fef9c3","#854d0e","Draft"], viewed: ["#dbeafe","#1e40af","Viewed"], expired: ["#fee2e2","#991b1b","Expired"] };
  const [bg, color, label] = cfg[status] || cfg.draft;
  return <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", background: bg, color }}>{label}</span>;
}

// ───────────────────────────────────────────── YACHT IMAGE
function YachtImage({ yacht, height = 140 }) {
  const [errored, setErrored] = useState(false);
  const src = getYachtImage(yacht);
  if (!src || errored) {
    return (
      <div style={{ height, background: `linear-gradient(135deg, #1a2d45 0%, #0f1d2f 100%)`, borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 32, opacity: 0.3 }}>⚓</span>
      </div>
    );
  }
  return <img src={src} alt={yacht.name} onError={() => setErrored(true)} style={{ width: "100%", height, objectFit: "cover", borderRadius: "8px 8px 0 0", display: "block" }} />;
}

// ───────────────────────────────────────────── PROPOSALS LIST
function ProposalsList({ proposals, onSelect, onCreate }) {
  const totalViews = proposals.reduce((a, p) => a + (p.views || 0), 0);
  const sentCount = proposals.filter(p => p.status === "sent").length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: "'DM Serif Display',serif", margin: 0 }}>Proposals</h1>
          <p style={{ fontSize: 13, color: SLATE, margin: "4px 0 0" }}>{proposals.length} proposals · {sentCount} sent</p>
        </div>
        <button onClick={onCreate} style={{ background: NAVY, color: WHITE, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>✦ New Proposal</button>
      </div>

      {proposals.length === 0 ? (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 64, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontSize: 20, color: NAVY, fontFamily: "'DM Serif Display',serif", margin: "0 0 8px" }}>No proposals yet</h2>
          <p style={{ fontSize: 14, color: SLATE, margin: "0 0 24px" }}>Create your first proposal or upload a Yachtfolio XLSX to get started.</p>
          <button onClick={onCreate} style={{ background: NAVY, color: WHITE, border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>✦ Create First Proposal</button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
            <StatCard label="Total Proposals" value={proposals.length} />
            <StatCard label="Sent" value={sentCount} accent={RED} />
            <StatCard label="Total Views" value={totalViews} accent={GOLD} />
          </div>
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            {proposals.map((p, i) => {
              const vat = getVatInfo(p.vat_jurisdiction);
              return (
                <div key={p.id} onClick={() => onSelect(p)}
                  style={{ padding: "20px 24px", borderBottom: i < proposals.length - 1 ? `1px solid ${BORDER}` : "none", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = BG}
                  onMouseLeave={e => e.currentTarget.style.background = WHITE}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>{p.client_name}</span>
                        <StatusBadge status={p.status} />
                        {p.broker_friendly && <span style={{ fontSize: 10, background: "rgba(201,169,110,0.15)", color: GOLD, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>BROKER</span>}
                      </div>
                      <div style={{ fontSize: 13, color: SLATE }}>{p.title}</div>
                      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: SLATE }}>
                        <span>🚢 {(p.selected_yachts || []).length || p.yacht_count || 0} yachts</span>
                        {vat && <span>📍 {vat.label} · {vat.rate}% VAT{vat.note ? " ⚠" : ""}</span>}
                        <span>👁 {p.views || 0} views</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: SLATE, textAlign: "right" }}>
                      <div>{p.created_at}</div>
                      {(p.shortlisted || []).length > 0 && <div style={{ marginTop: 4, color: GOLD, fontWeight: 600 }}>⭐ {p.shortlisted.length} shortlisted</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── YACHT CARD (selector)
function YachtCard({ yacht, isSelected, onToggle, onDiscountChange }) {
  const pi = formatPriceWithDiscount(yacht.price_high, yacht.discount || 0);
  return (
    <div style={{ border: `2px solid ${isSelected ? GOLD : BORDER}`, borderRadius: 10, overflow: "hidden", background: isSelected ? "rgba(201,169,110,0.04)" : WHITE, transition: "all 0.15s" }}>
      <YachtImage yacht={yacht} height={100} />
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>{yacht.name}</div>
            <div style={{ fontSize: 11, color: SLATE }}>{yacht.length_m}m · {yacht.builder} · {yacht.cabins} cab</div>
          </div>
          <button onClick={() => onToggle(yacht.name)}
            style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${isSelected ? GOLD : BORDER}`, background: isSelected ? GOLD : "transparent", color: isSelected ? WHITE : SLATE, fontSize: 11, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
            {isSelected ? "✓" : "Add"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          {pi.discounted
            ? <><span style={{ textDecoration: "line-through", color: SLATE }}>{pi.original}</span><span style={{ fontWeight: 700, color: RED }}>{pi.discounted}</span><span style={{ background: "#fee2e2", color: RED, padding: "1px 5px", borderRadius: 8, fontSize: 10 }}>-{yacht.discount}%</span></>
            : <span style={{ fontWeight: 600, color: NAVY }}>{pi.original}</span>}
        </div>
        {isSelected && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: SLATE }}>Discount:</span>
            <input type="number" min="0" max="50" value={yacht.discount || 0}
              onChange={e => onDiscountChange(yacht.name, parseFloat(e.target.value) || 0)}
              style={{ width: 52, padding: "3px 6px", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12, color: NAVY }} />
            <span style={{ fontSize: 11, color: SLATE }}>%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── CREATE PROPOSAL
function CreateProposal({ yachts, onSave, onCancel, editingProposal, onXlsxUpload }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(editingProposal || {
    client_name: "", title: "", destination: "", message: "",
    broker_friendly: false, vat_jurisdiction: "greece",
    selected_yachts: [], status: "draft",
  });
  // Per-proposal discount overrides stored separately — keyed by yacht name
  const [discountMap, setDiscountMap] = useState({});
  const [localYachts, setLocalYachts] = useState(yachts);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileRef = useRef();

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleYacht = (name) => {
    setForm(p => ({
      ...p,
      selected_yachts: p.selected_yachts.includes(name)
        ? p.selected_yachts.filter(n => n !== name)
        : [...p.selected_yachts, name],
    }));
  };

  const handleDiscountChange = (name, pct) => {
    setDiscountMap(p => ({ ...p, [name]: pct }));
    setLocalYachts(p => p.map(y => y.name === name ? { ...y, discount: pct } : y));
  };

  const handleFile = (file) => {
    if (!file) return;
    setUploadStatus({ type: "loading", message: "Parsing XLSX..." });
    parseXlsxFile(file,
      (parsed) => {
        setLocalYachts(prev => {
          const names = new Set(prev.map(y => y.name.toLowerCase()));
          const newOnes = parsed.filter(y => !names.has(y.name.toLowerCase()));
          return [...prev, ...newOnes];
        });
        setForm(p => ({ ...p, selected_yachts: parsed.map(y => y.name) }));
        setUploadStatus({ type: "success", message: `✓ ${parsed.length} yachts loaded — all selected` });
        onXlsxUpload(parsed);
        setTimeout(() => setStep(2), 900);
      },
      (err) => setUploadStatus({ type: "error", message: `Error: ${err}` })
    );
  };

  const filtered = localYachts.filter(y =>
    y.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (y.builder || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const selectedObjects = localYachts.filter(y => form.selected_yachts.includes(y.name));
  const vatInfo = getVatInfo(form.vat_jurisdiction);

  const doSave = (status) => {
    if (!form.client_name) return;
    onSave({ ...form, status, yacht_count: form.selected_yachts.length, yachts_detail: selectedObjects });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: SLATE, fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: NAVY, fontFamily: "'DM Serif Display',serif", margin: 0 }}>{editingProposal ? "Edit Proposal" : "New Proposal"}</h1>
          <p style={{ fontSize: 13, color: SLATE, margin: "2px 0 0" }}>{step === 1 ? "Upload Yachtfolio XLSX or select from database" : "Configure details, VAT and per-yacht discounts"}</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["1","Yachts"],["2","Details"]].map(([n, lbl]) => (
            <span key={n} style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, background: step === parseInt(n) ? NAVY : BORDER, color: step === parseInt(n) ? WHITE : SLATE, fontWeight: 600 }}>{n} {lbl}</span>
          ))}
        </div>
      </div>

      {step === 1 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Upload */}
            <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: "0 0 8px" }}>Import from Yachtfolio</h3>
              <p style={{ fontSize: 12, color: SLATE, margin: "0 0 16px" }}>Upload your Quick Comparison export. Yachts are auto-selected, images pulled from Yachtfolio, and the database is updated.</p>
              <div onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${BORDER}`, borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = GOLD}
                onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Click to upload XLSX</div>
                <div style={{ fontSize: 11, color: SLATE, marginTop: 3 }}>Yachtfolio Quick Comparison export</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              </div>
              {uploadStatus && (
                <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: uploadStatus.type === "success" ? "#dcfce7" : uploadStatus.type === "error" ? "#fee2e2" : "#f0f9ff", color: uploadStatus.type === "success" ? "#166534" : uploadStatus.type === "error" ? "#991b1b" : "#1e40af", fontSize: 12 }}>
                  {uploadStatus.message}
                </div>
              )}
            </div>

            {/* DB Select */}
            <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: "0 0 6px" }}>Select from Database</h3>
              <p style={{ fontSize: 12, color: SLATE, margin: "0 0 10px" }}>{form.selected_yachts.length} selected · {localYachts.length} in database</p>
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
              {localYachts.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: SLATE, fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⚓</div>
                  No yachts yet — upload a Yachtfolio XLSX to populate the database
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                  {filtered.map(y => (
                    <YachtCard key={y.id || y.name} yacht={y} isSelected={form.selected_yachts.includes(y.name)} onToggle={toggleYacht} onDiscountChange={handleDiscountChange} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {form.selected_yachts.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setStep(2)}
                style={{ background: NAVY, color: WHITE, border: "none", borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Continue with {form.selected_yachts.length} yachts →
              </button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Left: form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: "0 0 16px" }}>Proposal Details</h3>
                {[
                  { label: "Client Name *", key: "client_name", ph: "e.g. Mr. & Mrs. Smith" },
                  { label: "Title",         key: "title",       ph: "e.g. Eastern Mediterranean — Summer 2026" },
                  { label: "Destination",   key: "destination", ph: "e.g. Greek Islands & Turkey" },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.07em" }}>{f.label}</label>
                    <input value={form[f.key]} onChange={e => update(f.key, e.target.value)} placeholder={f.ph}
                      style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: NAVY, boxSizing: "border-box" }} />
                  </div>
                ))}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.07em" }}>Message to Client</label>
                  <textarea value={form.message} onChange={e => update("message", e.target.value)} rows={3} placeholder="Please find our curated selection..."
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: NAVY, resize: "vertical", boxSizing: "border-box" }} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: NAVY }}>
                  <input type="checkbox" checked={form.broker_friendly} onChange={e => update("broker_friendly", e.target.checked)} />
                  Broker-Friendly (hide charter rates)
                </label>
              </div>

              {/* VAT */}
              <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: "0 0 4px" }}>VAT Jurisdiction</h3>
                <p style={{ fontSize: 12, color: SLATE, margin: "0 0 14px" }}>Applied to all charter fees in this proposal</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {VAT_JURISDICTIONS.map(j => (
                    <button key={j.id} onClick={() => update("vat_jurisdiction", j.id)}
                      style={{ padding: "9px 10px", borderRadius: 8, border: `2px solid ${form.vat_jurisdiction === j.id ? GOLD : BORDER}`, background: form.vat_jurisdiction === j.id ? "rgba(201,169,110,0.08)" : WHITE, cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{j.label}</div>
                      <div style={{ fontSize: 11, color: j.rate === 0 ? "#166534" : RED }}>
                        {j.rate === 0 ? "0% VAT" : `${j.rate}% VAT`}
                      </div>
                      {j.note && <div style={{ fontSize: 10, color: "#854d0e" }}>⚠ {j.note}</div>}
                    </button>
                  ))}
                </div>
                {vatInfo && (
                  <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: BG, fontSize: 12, color: SLATE }}>
                    <strong style={{ color: NAVY }}>{vatInfo.label}:</strong> {vatInfo.rate}% VAT{vatInfo.note ? ` · ⚠ ${vatInfo.note}` : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Right: selected yachts with per-yacht discounts */}
            <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: 0 }}>
                  Selected Yachts ({form.selected_yachts.length})
                </h3>
                <button onClick={() => setStep(1)} style={{ fontSize: 12, color: GOLD, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>← Edit Selection</button>
              </div>
              <p style={{ fontSize: 12, color: SLATE, margin: "0 0 12px" }}>Set individual discounts per yacht below</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 520, overflowY: "auto" }}>
                {selectedObjects.map(y => (
                  <YachtCard key={y.id || y.name} yacht={y} isSelected={true} onToggle={toggleYacht} onDiscountChange={handleDiscountChange} />
                ))}
                {selectedObjects.length === 0 && <div style={{ padding: 24, textAlign: "center", color: SLATE, fontSize: 13 }}>No yachts selected</div>}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={onCancel} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, color: SLATE, fontSize: 14, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => doSave("draft")} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${NAVY}`, background: WHITE, color: NAVY, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Save Draft</button>
            <button onClick={() => doSave("sent")} disabled={!form.client_name} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: NAVY, color: WHITE, fontSize: 14, cursor: "pointer", fontWeight: 600, opacity: form.client_name ? 1 : 0.4 }}>Save & Send →</button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── YACHT DATABASE
function YachtDatabase({ yachts, onYachtsUpdate }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    setUploadStatus({ type: "loading", message: "Parsing..." });
    parseXlsxFile(file, (parsed) => {
      const merged = [...yachts];
      let added = 0, updated = 0;
      parsed.forEach(y => {
        const idx = merged.findIndex(m => m.name.toLowerCase() === y.name.toLowerCase());
        if (idx >= 0) { merged[idx] = { ...merged[idx], ...y }; updated++; }
        else { merged.push(y); added++; }
      });
      onYachtsUpdate(merged);
      setUploadStatus({ type: "success", message: `✓ ${added} added · ${updated} updated` });
    }, (err) => setUploadStatus({ type: "error", message: `Error: ${err}` }));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: "'DM Serif Display',serif", margin: 0 }}>Yacht Database</h1>
          <p style={{ fontSize: 13, color: SLATE, margin: "4px 0 0" }}>{yachts.length} yachts</p>
        </div>
        <button onClick={() => fileRef.current?.click()} style={{ background: NAVY, color: WHITE, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>↑ Import XLSX</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      {uploadStatus && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: uploadStatus.type === "success" ? "#dcfce7" : uploadStatus.type === "error" ? "#fee2e2" : "#f0f9ff", color: uploadStatus.type === "success" ? "#166534" : uploadStatus.type === "error" ? "#991b1b" : "#1e40af", fontSize: 13 }}>
          {uploadStatus.message}
        </div>
      )}

      <div onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? GOLD : BORDER}`, borderRadius: 10, padding: 22, textAlign: "center", cursor: "pointer", marginBottom: 22, background: dragOver ? "rgba(201,169,110,0.04)" : WHITE, transition: "all 0.15s" }}>
        <div style={{ fontSize: 26, marginBottom: 6 }}>📊</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>Drop Yachtfolio XLSX here</div>
        <div style={{ fontSize: 11, color: SLATE, marginTop: 3 }}>Duplicates updated · New yachts added · Images pulled from Yachtfolio</div>
      </div>

      {yachts.length === 0 ? (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: "center", color: SLATE }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚓</div>
          <p>No yachts yet. Upload a Yachtfolio XLSX to populate the database.</p>
        </div>
      ) : (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1fr 1fr 1fr", padding: "10px 16px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
            {["Yacht","Length","Cabins / Guests","Year","High Season","Low Season"].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
            ))}
          </div>
          {yachts.map((y, i) => (
            <div key={y.id || y.name} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.2fr 1fr 1fr 1fr", padding: "13px 16px", borderBottom: i < yachts.length - 1 ? `1px solid ${BORDER}` : "none", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {getYachtImage(y) ? (
                  <img src={getYachtImage(y)} alt={y.name} style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 4 }} onError={e => e.target.style.display = "none"} />
                ) : (
                  <div style={{ width: 48, height: 32, background: `linear-gradient(135deg,#1a2d45,#0f1d2f)`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 12, opacity: 0.4 }}>⚓</span></div>
                )}
                <div><div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{y.name}</div><div style={{ fontSize: 11, color: SLATE }}>{y.builder}</div></div>
              </div>
              <div style={{ fontSize: 13, color: NAVY }}>{y.length_m}m</div>
              <div style={{ fontSize: 12, color: NAVY }}>{y.cabins} cab · {y.guests} guests</div>
              <div style={{ fontSize: 12, color: SLATE }}>{y.year_built}{y.year_refit ? `/${y.year_refit}` : ""}</div>
              <div style={{ fontSize: 13, color: NAVY, fontWeight: 500 }}>{formatPrice(y.price_high)}</div>
              <div style={{ fontSize: 12, color: SLATE }}>{formatPrice(y.price_low)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── PROPOSAL DETAIL
function ProposalDetail({ proposal, allYachts, onBack, onEdit }) {
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const proposalUrl = `${BASE_URL}/p/${proposal.id}`;
  const vatInfo = getVatInfo(proposal.vat_jurisdiction);
  const yachts = allYachts.filter(y => (proposal.selected_yachts || []).includes(y.name));

  const handleCopy = () => copyToClipboard(proposalUrl, () => { setCopied(true); setTimeout(() => setCopied(false), 2500); });

  const handlePDF = () => {
    setPdfLoading(true);
    generatePDF(proposal, yachts, vatInfo);
    setTimeout(() => setPdfLoading(false), 1500);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: SLATE, fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "'DM Serif Display',serif", margin: 0 }}>{proposal.client_name}</h1>
          <p style={{ fontSize: 13, color: SLATE, margin: "2px 0 0" }}>{proposal.title}</p>
        </div>
        <button onClick={onEdit} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, color: NAVY, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>✎ Edit</button>
        <button onClick={handleCopy} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: copied ? "#dcfce7" : WHITE, color: copied ? "#166534" : NAVY, fontSize: 13, cursor: "pointer", fontWeight: 600, transition: "all 0.2s" }}>
          {copied ? "✓ Copied!" : "🔗 Copy Link"}
        </button>
        <button onClick={handlePDF} disabled={pdfLoading}
          style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: NAVY, color: WHITE, fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: pdfLoading ? 0.7 : 1 }}>
          {pdfLoading ? "Generating..." : "⬇ PDF"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Yachts" value={(proposal.selected_yachts || []).length || proposal.yacht_count || "—"} />
        <StatCard label="Views" value={proposal.views || 0} accent={GOLD} />
        <StatCard label="Unique Viewers" value={proposal.unique_viewers || 0} />
        <StatCard label="Shortlisted" value={(proposal.shortlisted || []).length} accent={RED} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 20 }}>
        {vatInfo && (
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 20px", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: SLATE, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>VAT Jurisdiction</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{vatInfo.label}</div>
            <div style={{ fontSize: 13, color: vatInfo.rate > 0 ? RED : "#166534" }}>{vatInfo.rate}% VAT</div>
            {vatInfo.note && <div style={{ fontSize: 11, color: "#854d0e", marginTop: 2 }}>⚠ {vatInfo.note}</div>}
          </div>
        )}
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: SLATE, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Proposal Link</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <code style={{ flex: 1, background: BG, padding: "8px 12px", borderRadius: 8, fontSize: 12, color: NAVY, border: `1px solid ${BORDER}` }}>{proposalUrl}</code>
            <button onClick={handleCopy} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: copied ? "#dcfce7" : WHITE, color: copied ? "#166534" : NAVY, fontSize: 12, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s" }}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* Yachts */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: NAVY }}>Yachts in Proposal</h3>
          {vatInfo && vatInfo.rate > 0 && <span style={{ fontSize: 12, color: SLATE }}>Prices excl. {vatInfo.rate}% VAT</span>}
        </div>
        {yachts.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: SLATE, fontSize: 13 }}>No yachts in this proposal.</div>
        ) : yachts.map((y, i) => {
          const pi = formatPriceWithDiscount(y.price_high, y.discount || 0);
          const isShortlisted = (proposal.shortlisted || []).includes(y.name);
          const vatAmt = vatInfo && vatInfo.rate > 0 && pi.rawVal ? Math.round(pi.rawVal * vatInfo.rate / 100) : null;
          const imgSrc = getYachtImage(y);
          return (
            <div key={y.name} style={{ padding: "16px 20px", borderBottom: i < yachts.length - 1 ? `1px solid ${BORDER}` : "none", display: "flex", gap: 16, alignItems: "flex-start" }}>
              {imgSrc && (
                <img src={imgSrc} alt={y.name} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                  onError={e => e.target.style.display = "none"} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{y.name}</span>
                  {isShortlisted && <span style={{ background: "rgba(201,169,110,0.15)", color: GOLD, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600 }}>⭐ SHORTLISTED</span>}
                </div>
                <div style={{ fontSize: 12, color: SLATE }}>{y.length_m}m · {y.builder} · {y.cabins} cabins · {y.guests} guests · Built {y.year_built}{y.year_refit ? ` / Refit ${y.year_refit}` : ""}</div>
                <div style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>Based: {y.summer_port || "TBC"}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  {pi.discounted
                    ? <><span style={{ fontSize: 12, color: SLATE, textDecoration: "line-through" }}>{pi.original}</span><span style={{ fontSize: 15, fontWeight: 700, color: RED }}>{pi.discounted}</span><span style={{ fontSize: 10, background: "#fee2e2", color: RED, padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>-{y.discount}%</span></>
                    : <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{pi.original}</span>}
                </div>
                {vatAmt && <div style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>+{vatInfo.rate}% VAT = €{vatAmt.toLocaleString()}</div>}
                {vatInfo?.note && <div style={{ fontSize: 10, color: "#854d0e" }}>⚠ {vatInfo.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── SETTINGS
function Settings() {
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: "'DM Serif Display',serif", margin: "0 0 24px" }}>Settings</h1>
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 24 }}>
          {[["Broker Name","Josh Cripps"],["Company","Roccabella Yachts"],["Email","josh@roccabellayachts.com"],["Phone","+44 7700 900000"]].map(([l,v]) => (
            <div key={l}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{l}</label>
              <input defaultValue={v} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: NAVY, boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: NAVY, margin: "0 0 12px" }}>VAT Jurisdiction Reference</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {VAT_JURISDICTIONS.map(j => (
              <div key={j.id} style={{ padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: BG }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{j.label}</div>
                <div style={{ fontSize: 12, color: j.rate > 0 ? RED : "#166534" }}>{j.rate}%</div>
                {j.note && <div style={{ fontSize: 10, color: "#854d0e", marginTop: 2 }}>⚠ {j.note}</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button style={{ background: NAVY, color: WHITE, border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── MAIN
export default function AdminDashboard() {
  const [page, setPage] = useState("proposals");
  const [proposals, setProposals] = useState([]);
  const [yachts, setYachts] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [editingProposal, setEditingProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  // ── Load data from Supabase on mount ──
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [fetchedProposals, fetchedYachts] = await Promise.all([
          getAllProposals(),
          getAllYachts(),
        ]);
        setProposals(fetchedProposals || []);
        setYachts(fetchedYachts || []);
      } catch (err) {
        console.error("Failed to load data:", err);
        setError("Failed to connect to database. Check Supabase configuration.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSaveProposal = async (form) => {
    try {
      let saved;
      if (editingProposal) {
        saved = await updateProposal(form.id, form);
      } else {
        saved = await createProposal(form);
      }
      // Refresh proposals list from Supabase
      const refreshed = await getAllProposals();
      setProposals(refreshed || []);
      setEditingProposal(null);
      setPage("proposals");
    } catch (err) {
      console.error("Failed to save proposal:", err);
      alert("Failed to save proposal: " + err.message);
    }
  };

  const handleXlsxUpload = async (parsed) => {
    try {
      await upsertYachts(parsed);
      const refreshed = await getAllYachts();
      setYachts(refreshed || []);
    } catch (err) {
      console.error("Failed to save yachts:", err);
      // Fall back to local state so UI still works
      setYachts(prev => {
        const merged = [...prev];
        parsed.forEach(y => {
          const idx = merged.findIndex(m => m.name.toLowerCase() === y.name.toLowerCase());
          if (idx >= 0) merged[idx] = { ...merged[idx], ...y };
          else merged.push(y);
        });
        return merged;
      });
    }
  };

  const renderContent = () => {
    if (selectedProposal) {
      return <ProposalDetail proposal={selectedProposal} allYachts={yachts} onBack={() => setSelectedProposal(null)}
        onEdit={() => { setEditingProposal(selectedProposal); setSelectedProposal(null); setPage("create"); }} />;
    }
    switch (page) {
      case "proposals": return <ProposalsList proposals={proposals} onSelect={setSelectedProposal} onCreate={() => { setEditingProposal(null); setPage("create"); }} />;
      case "create":    return <CreateProposal yachts={yachts} onSave={handleSaveProposal} onCancel={() => { setEditingProposal(null); setPage("proposals"); }} editingProposal={editingProposal} onXlsxUpload={handleXlsxUpload} />;
      case "yachts":    return <YachtDatabase yachts={yachts} onYachtsUpdate={setYachts} />;
      case "settings":  return <Settings />;
      default: return null;
    }
  };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: BG, minHeight: "100vh" }}>
      <Sidebar active={selectedProposal ? "proposals" : page} onNavigate={p => { setSelectedProposal(null); setPage(p); }} />
      <main style={{ marginLeft: 240, padding: "36px 40px", minHeight: "100vh" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTopColor: NAVY, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 14, color: SLATE }}>Loading...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12, padding: 24, color: "#991b1b", fontSize: 14 }}>
            ⚠ {error}
          </div>
        ) : renderContent()}
      </main>
    </div>
  );
}
