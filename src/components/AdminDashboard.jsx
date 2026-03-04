import { useState, useEffect } from "react";
import * as XLSX from "xlsx";

const LOGO_WHITE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABLAAAAJ4CAYAAACj8HKaAAAAAXNSR0IArs4c6QAAAARnQU5ErkJggg==";
const LOGO_NAVY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABLAAAAJ4CAYAAACj8HKaAAAAAXNSR0IArs4c6QAAAARnQU5ErkJggg==";

// ── Base URL for proposal links ──
const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://luxury-mermaid-cdae15.netlify.app";

// ── Brand ──
const NAVY = "#0f1d2f";
const NAVY_LIGHT = "#1a2d45";
const RED = "#c43a2b";
const GOLD = "#c9a96e";
const CREAM = "#f8f6f1";
const SLATE = "#64748b";
const WHITE = "#fff";
const BORDER = "#e2e0db";
const BG = "#f1efe9";

// ── Mock Data (will be replaced by Supabase) ──
const MOCK_PROPOSALS = [
  {
    id: "prop_001",
    client_name: "Mr. & Mrs. Richardson",
    title: "Eastern Mediterranean — Summer 2026",
    destination: "Turkey & Greek Islands",
    status: "sent",
    broker_friendly: false,
    discount: 7,
    yacht_count: 5,
    created_at: "2026-02-27",
    last_viewed: "2026-02-27 14:32",
    views: 12,
    unique_viewers: 3,
    shortlisted: ["SOUNDWAVE", "QUINTA ESSENTIA"],
  },
  {
    id: "prop_002",
    client_name: "Whitman Family Office",
    title: "French Riviera — July 2026",
    destination: "South of France",
    status: "draft",
    broker_friendly: false,
    discount: 0,
    yacht_count: 3,
    created_at: "2026-02-26",
    last_viewed: null,
    views: 0,
    unique_viewers: 0,
    shortlisted: [],
  },
  {
    id: "prop_003",
    client_name: "Broker: Edmiston & Co",
    title: "Croatia Selection — August 2026",
    destination: "Adriatic Coast",
    status: "sent",
    broker_friendly: true,
    discount: 0,
    yacht_count: 8,
    created_at: "2026-02-25",
    last_viewed: "2026-02-26 09:15",
    views: 5,
    unique_viewers: 2,
    shortlisted: ["AMALYA"],
  },
];

const MOCK_YACHTS_FROM_XLSX = [
  { name: "AMALYA", length_m: "77.7", builder: "Admiral", cabins: 6, cabin_config: "6 Double Cabins", guests: 12, crew: 21, year_built: 2025, year_refit: null, price_high: 1100000, price_low: 1100000, summer_port: "Mediterranean", winter_port: "Middle East" },
  { name: "SOUNDWAVE", length_m: "63", builder: "Benetti", cabins: 6, cabin_config: "4 Double, 2 Convertible", guests: 12, crew: 15, year_built: 2015, year_refit: 2025, price_high: 650000, price_low: 550000, summer_port: "Athens", winter_port: "St. Maarten" },
  { name: "YAZZ", length_m: "56", builder: "Aegean Yachts", cabins: 5, cabin_config: "4 Double, 1 Triple", guests: 11, crew: 13, year_built: 2007, year_refit: 2022, price_high: 150000, price_low: 150000, summer_port: "Greece", winter_port: "Didim" },
  { name: "Quinta Essentia", length_m: "55", builder: "Admiral", cabins: 6, cabin_config: "6 Double Cabins", guests: 12, crew: 13, year_built: 2016, year_refit: 2025, price_high: 360000, price_low: 360000, summer_port: "TBC", winter_port: "Genova" },
  { name: "SAIRU", length_m: "54", builder: "Riva", cabins: 5, cabin_config: "5 Double Cabins", guests: 10, crew: 12, year_built: 2025, year_refit: null, price_high: "TBC", price_low: "TBC", summer_port: "TBD", winter_port: "TBD" },
  { name: "HALAS 71", length_m: "52.3", builder: "", cabins: 12, cabin_config: "10 Double, 2 Twin", guests: 24, crew: 16, year_built: 1914, year_refit: 2016, price_high: 112000, price_low: 112000, summer_port: "Bodrum", winter_port: "Istanbul" },
  { name: "BEYOND", length_m: "46", builder: "Sanlorenzo", cabins: 5, cabin_config: "5 Double Cabins", guests: 10, crew: 10, year_built: 2021, year_refit: null, price_high: 200000, price_low: 180000, summer_port: "Italy", winter_port: "TBC" },
  { name: "AIR", length_m: "81", builder: "Feadship", cabins: 6, cabin_config: "6 Double Cabins", guests: 12, crew: 28, year_built: 2011, year_refit: 2017, price_high: 950000, price_low: 850000, summer_port: "Mediterranean", winter_port: "Caribbean" },
];

const formatPrice = (p) => {
  if (!p || p === "TBC" || p === "POA") return "POA";
  const v = typeof p === "string" ? parseInt(p.replace(/[^0-9]/g, "")) : p;
  return isNaN(v) ? "POA" : `€${v.toLocaleString()}`;
};

// ── Copy to clipboard helper ──
const copyToClipboard = async (text, onSuccess) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    if (onSuccess) onSuccess();
  } catch (err) {
    console.error("Copy failed:", err);
  }
};

// ── Components ──

function Sidebar({ active, onNavigate }) {
  const items = [
    { key: "proposals", label: "Proposals", icon: "📋" },
    { key: "create", label: "New Proposal", icon: "✦" },
    { key: "yachts", label: "Yacht Database", icon: "⚓" },
    { key: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div style={{
      width: 240, background: NAVY, minHeight: "100vh", padding: "24px 0",
      display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, bottom: 0,
      zIndex: 100,
    }}>
      <div style={{ padding: "0 24px 32px", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <div style={{
          fontSize: 18, fontFamily: "'DM Serif Display', serif",
          color: WHITE, letterSpacing: 2, marginBottom: 4,
        }}>ROCCABELLA</div>
        <div style={{
          fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.3)",
          fontFamily: "'DM Sans', sans-serif", marginTop: 2,
        }}>PROPOSAL ADMIN</div>
      </div>

      <nav style={{ padding: "16px 0", flex: 1 }}>
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              width: "100%", padding: "12px 24px", border: "none",
              background: active === item.key ? "rgba(255,255,255,0.06)" : "transparent",
              color: active === item.key ? WHITE : "rgba(255,255,255,0.45)",
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
              cursor: "pointer", textAlign: "left",
              borderLeft: active === item.key ? `2px solid ${RED}` : "2px solid transparent",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "16px 24px", borderTop: `1px solid rgba(255,255,255,0.06)` }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif" }}>Josh Cripps</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif" }}>josh.cripps@roccabellayachts.com</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: WHITE, padding: "20px 24px", borderRadius: 2,
      border: `1px solid ${BORDER}`,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.5, color: SLATE, textTransform: "uppercase",
        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontSize: 28, color: accent || NAVY, fontFamily: "'DM Serif Display', serif",
        fontWeight: 400,
      }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    draft: { bg: "#f0ebe3", color: "#8a7350", label: "Draft" },
    sent: { bg: "#e8f4ea", color: "#2d6a3e", label: "Sent" },
    viewed: { bg: "#e3ecf5", color: "#2a5592", label: "Viewed" },
    expired: { bg: "#f5e3e3", color: "#922a2a", label: "Expired" },
  };
  const s = styles[status] || styles.draft;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 2,
      background: s.bg, color: s.color, fontSize: 10, fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5, textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

// ── Proposals List ──
function ProposalsList({ proposals, onSelect, onCreate }) {
  const totalViews = proposals.reduce((a, p) => a + p.views, 0);
  const totalShortlisted = proposals.reduce((a, p) => a + p.shortlisted.length, 0);
  const sentCount = proposals.filter(p => p.status === "sent").length;

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 28,
      }}>
        <div>
          <h1 style={{
            fontSize: 24, color: NAVY, fontFamily: "'DM Serif Display', serif",
            fontWeight: 400, margin: 0,
          }}>Proposals</h1>
          <p style={{
            fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif",
            margin: "4px 0 0",
          }}>Manage your client and broker proposals</p>
        </div>
        <button onClick={onCreate} style={{
          padding: "10px 24px", background: RED, border: "none", color: WHITE,
          fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
          letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
        }}>+ New Proposal</button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28,
      }}>
        <StatCard label="Total Proposals" value={proposals.length} />
        <StatCard label="Active (Sent)" value={sentCount} accent={RED} />
        <StatCard label="Total Views" value={totalViews} />
        <StatCard label="Yachts Shortlisted" value={totalShortlisted} accent={GOLD} />
      </div>

      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 2,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: CREAM }}>
              {["Client / Title", "Status", "Type", "Yachts", "Views", "Shortlisted", "Created"].map((h) => (
                <th key={h} style={{
                  padding: "12px 16px", textAlign: "left", fontSize: 10,
                  letterSpacing: 1.2, color: SLATE, fontWeight: 600,
                  textTransform: "uppercase", borderBottom: `1px solid ${BORDER}`,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                style={{ cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = CREAM}
                onMouseLeave={(e) => e.currentTarget.style.background = WHITE}
              >
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>{p.client_name}</div>
                  <div style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>{p.title}</div>
                </td>
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
                  <StatusBadge status={p.status} />
                </td>
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: SLATE }}>
                  {p.broker_friendly ? "Broker" : "Client"}
                </td>
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 14, color: NAVY, fontWeight: 600 }}>
                  {p.yacht_count}
                </td>
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 14, color: NAVY, fontWeight: 600 }}>
                  {p.views}
                </td>
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
                  {p.shortlisted.length > 0 ? (
                    <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>
                      {p.shortlisted.join(", ")}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: "#ccc" }}>—</span>
                  )}
                </td>
                <td style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: SLATE }}>
                  {p.created_at}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Create / Edit Proposal ──
function CreateProposal({ yachts, onSave, onCancel, editingProposal }) {
  const [form, setForm] = useState(editingProposal || {
    client_name: "",
    title: "",
    destination: "",
    discount: 0,
    broker_friendly: false,
    message: "",
    itinerary_link: "",
    selected_yachts: [],
  });

  const [searchTerm, setSearchTerm] = useState("");

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleYacht = (yachtName) => {
    setForm((prev) => {
      const selected = prev.selected_yachts.includes(yachtName)
        ? prev.selected_yachts.filter((n) => n !== yachtName)
        : [...prev.selected_yachts, yachtName];
      return { ...prev, selected_yachts: selected };
    });
  };

  const filteredYachts = yachts.filter((y) =>
    y.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (y.builder || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inputStyle = {
    width: "100%", padding: "10px 14px", border: `1px solid ${BORDER}`,
    borderRadius: 2, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    color: NAVY, background: WHITE, outline: "none", boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 10, letterSpacing: 1.2, color: SLATE, textTransform: "uppercase",
    fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 6,
    display: "block",
  };

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 28,
      }}>
        <div>
          <h1 style={{
            fontSize: 24, color: NAVY, fontFamily: "'DM Serif Display', serif",
            fontWeight: 400, margin: 0,
          }}>{editingProposal ? "Edit Proposal" : "New Proposal"}</h1>
          <p style={{
            fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif",
            margin: "4px 0 0",
          }}>Configure your charter proposal details</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{
            padding: "10px 20px", background: "transparent", border: `1px solid ${BORDER}`,
            color: SLATE, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{
            padding: "10px 24px", background: RED, border: "none", color: WHITE,
            fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
            opacity: form.client_name && form.title && form.selected_yachts.length > 0 ? 1 : 0.4,
          }}>
            {editingProposal ? "Update Proposal" : "Create Proposal"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: WHITE, padding: 28, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{
            fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif",
            marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${BORDER}`,
          }}>Proposal Details</div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Client Name *</label>
            <input value={form.client_name} onChange={(e) => update("client_name", e.target.value)} placeholder="e.g. Mr. & Mrs. Richardson" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Proposal Title *</label>
            <input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Eastern Mediterranean — Summer 2026" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Destination</label>
            <input value={form.destination} onChange={(e) => update("destination", e.target.value)} placeholder="e.g. Turkey & Greek Islands" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Discount %</label>
              <input type="number" min="0" max="50" value={form.discount} onChange={(e) => update("discount", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Proposal Type</label>
              <div style={{ display: "flex", gap: 0, border: `1px solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
                <button onClick={() => update("broker_friendly", false)} style={{
                  flex: 1, padding: "10px 0", border: "none", fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer",
                  background: !form.broker_friendly ? NAVY : WHITE,
                  color: !form.broker_friendly ? WHITE : SLATE,
                }}>Client</button>
                <button onClick={() => update("broker_friendly", true)} style={{
                  flex: 1, padding: "10px 0", border: "none", fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer",
                  background: form.broker_friendly ? NAVY : WHITE,
                  color: form.broker_friendly ? WHITE : SLATE,
                  borderLeft: `1px solid ${BORDER}`,
                }}>Broker Friendly</button>
              </div>
            </div>
          </div>

          {!form.broker_friendly && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Personal Message</label>
              <textarea value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="A personal note to your client..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Charter Itinerary Link</label>
            <input value={form.itinerary_link} onChange={(e) => update("itinerary_link", e.target.value)} placeholder="https://charteritinerary.com/..." style={inputStyle} />
          </div>

          {form.broker_friendly && (
            <div style={{ padding: 14, background: "#fef9f0", border: `1px solid ${GOLD}33`, borderRadius: 2, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>Broker Friendly Mode</div>
              <div style={{ fontSize: 12, color: SLATE, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                Roccabella branding, broker bio, personal message, and itinerary link will be hidden.
              </div>
            </div>
          )}
        </div>

        <div style={{ background: WHITE, padding: 28, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif" }}>Select Yachts *</div>
            <div style={{ fontSize: 12, color: form.selected_yachts.length > 0 ? RED : SLATE, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
              {form.selected_yachts.length} selected
            </div>
          </div>

          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search yachts by name or builder..." style={{ ...inputStyle, marginBottom: 16 }} />

          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {filteredYachts.map((yacht) => {
              const isSelected = form.selected_yachts.includes(yacht.name);
              return (
                <div key={yacht.name} onClick={() => toggleYacht(yacht.name)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", cursor: "pointer",
                  background: isSelected ? "#f0f8f1" : "transparent",
                  borderBottom: `1px solid ${BORDER}`,
                  transition: "background 0.15s",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 2, flexShrink: 0,
                    border: isSelected ? `2px solid ${RED}` : `2px solid ${BORDER}`,
                    background: isSelected ? RED : WHITE,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: WHITE, fontSize: 11, fontWeight: 700,
                    transition: "all 0.15s",
                  }}>{isSelected ? "✓" : ""}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: NAVY, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{yacht.name}</div>
                    <div style={{ fontSize: 11, color: SLATE, fontFamily: "'DM Sans', sans-serif" }}>
                      {yacht.length_m}m · {yacht.builder || "Unknown"} · {yacht.year_built}
                      {yacht.year_refit ? ` / ${yacht.year_refit}` : ""}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: NAVY, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{formatPrice(yacht.price_high)}</div>
                    <div style={{ fontSize: 10, color: SLATE, fontFamily: "'DM Sans', sans-serif" }}>{yacht.guests} guests · {yacht.cabins} cabins</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Yacht Database (XLSX Upload with real parsing) ──
function YachtDatabase({ yachts, onYachtsUpdate }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const parseXlsx = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rows.length === 0) {
          setUploadStatus({ type: "error", message: "No data found in file." });
          return;
        }

        // Map Yachtfolio columns — flexible matching
        const mapped = rows.map((row) => {
          const keys = Object.keys(row);
          const get = (...candidates) => {
            for (const c of candidates) {
              const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
              if (found) return row[found];
            }
            return "";
          };

          return {
            name: get("name", "yacht") || "Unknown",
            length_m: get("length", "loa", "size") || "",
            builder: get("builder", "shipyard", "yard") || "",
            cabins: parseInt(get("cabin", "stateroom")) || 0,
            cabin_config: get("cabin config", "configuration", "layout") || "",
            guests: parseInt(get("guest", "pax", "passenger")) || 0,
            crew: parseInt(get("crew")) || 0,
            year_built: parseInt(get("built", "year built", "build year")) || 0,
            year_refit: parseInt(get("refit", "year refit")) || null,
            price_high: get("high rate", "max rate", "high season", "summer rate") || "POA",
            price_low: get("low rate", "min rate", "low season", "winter rate") || "POA",
            summer_port: get("summer", "summer base", "summer port") || "",
            winter_port: get("winter", "winter base", "winter port") || "",
          };
        });

        onYachtsUpdate(mapped);
        setUploadStatus({ type: "success", message: `✓ ${mapped.length} yachts loaded from ${file.name}` });
      } catch (err) {
        setUploadStatus({ type: "error", message: `Failed to parse file: ${err.message}` });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) parseXlsx(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) parseXlsx(file);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, color: NAVY, fontFamily: "'DM Serif Display', serif", fontWeight: 400, margin: 0 }}>Yacht Database</h1>
          <p style={{ fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0" }}>
            {yachts.length} yachts loaded from Yachtfolio export
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? RED : BORDER}`,
          borderRadius: 2, padding: "32px 24px", textAlign: "center",
          marginBottom: 16, background: dragOver ? "#fef5f3" : WHITE,
          transition: "all 0.2s ease", cursor: "pointer",
        }}
        onClick={() => document.getElementById("xlsx-upload").click()}
      >
        <input id="xlsx-upload" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} style={{ display: "none" }} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 14, color: NAVY, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 4 }}>
          Drop Yachtfolio XLSX here or click to upload
        </div>
        <div style={{ fontSize: 12, color: SLATE, fontFamily: "'DM Sans', sans-serif" }}>
          Accepts .xlsx exports from Yachtfolio Quick Comparison
        </div>
      </div>

      {/* Upload status */}
      {uploadStatus && (
        <div style={{
          padding: "10px 16px", marginBottom: 20, borderRadius: 2,
          background: uploadStatus.type === "success" ? "#e8f4ea" : "#fef0f0",
          border: `1px solid ${uploadStatus.type === "success" ? "#2d6a3e44" : "#c43a2b44"}`,
          color: uploadStatus.type === "success" ? "#2d6a3e" : RED,
          fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
        }}>
          {uploadStatus.message}
        </div>
      )}

      {/* Yacht table */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: CREAM }}>
              {["Yacht", "Length", "Builder", "Year", "Cabins", "Guests", "Crew", "High Rate", "Low Rate", "Summer", "Winter"].map((h) => (
                <th key={h} style={{
                  padding: "10px 12px", textAlign: "left", fontSize: 9,
                  letterSpacing: 1, color: SLATE, fontWeight: 600,
                  textTransform: "uppercase", borderBottom: `1px solid ${BORDER}`,
                  whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yachts.map((y, i) => (
              <tr key={y.name + i} style={{ background: i % 2 === 0 ? WHITE : "#fcfbf8" }}>
                <td style={{ padding: "10px 12px", fontSize: 13, color: NAVY, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{y.name}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{y.length_m}m</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{y.builder || "—"}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>
                  {y.year_built}{y.year_refit ? ` / ${y.year_refit}` : ""}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: NAVY, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{y.cabins}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: NAVY, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{y.guests}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{y.crew}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: NAVY, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{formatPrice(y.price_high)}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{formatPrice(y.price_low)}</td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{y.summer_port || "—"}</td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{y.winter_port || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Proposal Detail ──
function ProposalDetail({ proposal, onBack, onEdit }) {
  const [copied, setCopied] = useState(false);

  // ✅ FIX: Use live site URL
  const proposalUrl = `${BASE_URL}/p/${proposal.id}`;

  const handleCopyLink = () => {
    copyToClipboard(proposalUrl, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <button onClick={onBack} style={{
        padding: "6px 0", background: "transparent", border: "none",
        color: SLATE, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", gap: 6,
      }}>← Back to Proposals</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 24, color: NAVY, fontFamily: "'DM Serif Display', serif", fontWeight: 400, margin: 0 }}>
              {proposal.client_name}
            </h1>
            <StatusBadge status={proposal.status} />
            {proposal.broker_friendly && (
              <span style={{
                padding: "3px 10px", borderRadius: 2, background: "#f0ebe3",
                color: "#8a7350", fontSize: 10, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
              }}>BROKER FRIENDLY</span>
            )}
          </div>
          <p style={{ fontSize: 14, color: SLATE, fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0" }}>
            {proposal.title}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onEdit} style={{
            padding: "10px 20px", background: "transparent", border: `1px solid ${BORDER}`,
            color: NAVY, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600, cursor: "pointer",
          }}>Edit</button>

          {/* ✅ FIX: Copy Link actually copies */}
          <button onClick={handleCopyLink} style={{
            padding: "10px 20px", background: copied ? "#e8f4ea" : "transparent",
            border: `1px solid ${copied ? "#2d6a3e44" : BORDER}`,
            color: copied ? "#2d6a3e" : NAVY, fontSize: 12,
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer",
            transition: "all 0.2s",
          }}>
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>

          <button style={{
            padding: "10px 20px", background: NAVY, border: "none",
            color: WHITE, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600, cursor: "pointer", letterSpacing: 0.5,
          }}>Download PDF</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard label="Total Views" value={proposal.views} />
        <StatCard label="Unique Viewers" value={proposal.unique_viewers} />
        <StatCard label="Yachts Included" value={proposal.yacht_count} />
        <StatCard label="Shortlisted" value={proposal.shortlisted.length} accent={GOLD} />
        <StatCard label="Discount" value={proposal.discount > 0 ? `${proposal.discount}%` : "None"} accent={proposal.discount > 0 ? RED : SLATE} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: WHITE, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{
            fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif",
            marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}`,
          }}>Proposal Links</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, letterSpacing: 1.2, color: SLATE, textTransform: "uppercase",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 6,
            }}>Web Link</div>
            {/* ✅ FIX: Show real live URL, make it clickable */}
            <a
              href={proposalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", padding: "10px 14px", background: CREAM, borderRadius: 2,
                fontSize: 12, color: NAVY, fontFamily: "monospace", wordBreak: "break-all",
                textDecoration: "none", border: `1px solid ${BORDER}`,
              }}
            >
              {proposalUrl}
            </a>
          </div>

          <div>
            <div style={{
              fontSize: 10, letterSpacing: 1.2, color: SLATE, textTransform: "uppercase",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 6,
            }}>Last Viewed</div>
            <div style={{ fontSize: 13, color: NAVY, fontFamily: "'DM Sans', sans-serif" }}>
              {proposal.last_viewed || "Not yet viewed"}
            </div>
          </div>
        </div>

        <div style={{ background: WHITE, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{
            fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif",
            marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}`,
          }}>Client Engagement</div>

          {proposal.shortlisted.length > 0 ? (
            <div>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: GOLD, textTransform: "uppercase",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 10,
              }}>Shortlisted Yachts</div>
              {proposal.shortlisted.map((name) => (
                <div key={name} style={{
                  padding: "8px 12px", background: "#fef9f0",
                  border: `1px solid ${GOLD}22`, marginBottom: 6,
                  borderRadius: 2, fontSize: 13, color: NAVY,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ color: GOLD }}>♥</span> {name}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif", fontStyle: "italic" }}>
              No yachts shortlisted yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Settings ──
function Settings() {
  return (
    <div>
      <h1 style={{ fontSize: 24, color: NAVY, fontFamily: "'DM Serif Display', serif", fontWeight: 400, margin: "0 0 8px" }}>Settings</h1>
      <p style={{ fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif", margin: "0 0 28px" }}>Configure your proposal system</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: WHITE, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{ fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>Yachtfolio API</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: SLATE, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 6 }}>API Passkey</div>
            <div style={{ padding: "10px 14px", background: CREAM, borderRadius: 2, fontSize: 12, color: NAVY, fontFamily: "monospace" }}>6b5e••••••••••••••2136</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#2d6a3e", fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2d6a3e" }} />
            Connected
          </div>
        </div>

        <div style={{ background: WHITE, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{ fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>Notifications</div>
          <div style={{ fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
            Email notifications will be sent to<br />
            <strong style={{ color: NAVY }}>josh.cripps@roccabellayachts.com</strong><br />
            when a proposal is first opened and when a client submits a shortlist enquiry.
          </div>
        </div>

        <div style={{ background: WHITE, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{ fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>Deployment</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: SLATE, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 6 }}>Client Proposals</div>
            <div style={{ padding: "10px 14px", background: CREAM, borderRadius: 2, fontSize: 12, color: NAVY, fontFamily: "monospace" }}>{BASE_URL}/p/[proposal-id]</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: SLATE, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 6 }}>Admin Dashboard</div>
            <div style={{ padding: "10px 14px", background: CREAM, borderRadius: 2, fontSize: 12, color: NAVY, fontFamily: "monospace" }}>{BASE_URL}/admin</div>
          </div>
        </div>

        <div style={{ background: WHITE, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div style={{ fontSize: 14, color: NAVY, fontFamily: "'DM Serif Display', serif", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>Broker Profile</div>
          <div style={{ fontSize: 13, color: SLATE, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
            <strong style={{ color: NAVY }}>Josh Cripps</strong><br />
            +34 603 74 77 41<br />
            roccabellayachts.com<br />
            @roccabella_yachts
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function AdminDashboard() {
  const [page, setPage] = useState("proposals");
  const [proposals, setProposals] = useState(MOCK_PROPOSALS);
  const [yachts, setYachts] = useState(MOCK_YACHTS_FROM_XLSX);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [editingProposal, setEditingProposal] = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  const handleSaveProposal = (form) => {
    const newProposal = {
      id: `prop_${Date.now()}`,
      ...form,
      status: "draft",
      yacht_count: form.selected_yachts.length,
      created_at: new Date().toISOString().split("T")[0],
      last_viewed: null,
      views: 0,
      unique_viewers: 0,
      shortlisted: [],
    };
    setProposals((prev) => [newProposal, ...prev]);
    setPage("proposals");
    setEditingProposal(null);
  };

  const renderContent = () => {
    if (selectedProposal) {
      return (
        <ProposalDetail
          proposal={selectedProposal}
          onBack={() => setSelectedProposal(null)}
          onEdit={() => {
            setEditingProposal(selectedProposal);
            setSelectedProposal(null);
            setPage("create");
          }}
        />
      );
    }

    switch (page) {
      case "proposals":
        return (
          <ProposalsList
            proposals={proposals}
            onSelect={setSelectedProposal}
            onCreate={() => { setEditingProposal(null); setPage("create"); }}
          />
        );
      case "create":
        return (
          <CreateProposal
            yachts={yachts}
            onSave={handleSaveProposal}
            onCancel={() => { setPage("proposals"); setEditingProposal(null); }}
            editingProposal={editingProposal}
          />
        );
      case "yachts":
        return <YachtDatabase yachts={yachts} onYachtsUpdate={setYachts} />;
      case "settings":
        return <Settings />;
      default:
        return null;
    }
  };

  return (
    <div style={{
      display: "flex", minHeight: "100vh", background: BG,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <Sidebar
        active={selectedProposal ? "proposals" : page}
        onNavigate={(p) => { setPage(p); setSelectedProposal(null); setEditingProposal(null); }}
      />
      <main style={{ flex: 1, marginLeft: 240, padding: "32px 40px" }}>
        {renderContent()}
      </main>
    </div>
  );
}
