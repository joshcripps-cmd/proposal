import { useState, useMemo } from "react";

// ── Constants ──
const MONTHS_CONFIG = [
  { label: "Apr", index: 3 }, { label: "May", index: 4 }, { label: "Jun", index: 5 },
  { label: "Jul", index: 6 }, { label: "Aug", index: 7 }, { label: "Sep", index: 8 },
  { label: "Oct", index: 9 },
];

const STATUS_COLORS = {
  Booked:     { bg: "#dc2626", text: "#fff" },
  Option:     { bg: "#f59e0b", text: "#1a1a1a" },
  "Option 1": { bg: "#f59e0b", text: "#1a1a1a" },
  "Option 2": { bg: "#fb923c", text: "#1a1a1a" },
  Hold:       { bg: "#8b5cf6", text: "#fff" },
  Expired:    { bg: "#6b7280", text: "#fff" },
};

// ── Helpers ──
function getWeeksForMonth(year, monthIndex) {
  const weeks = [];
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  let dayPtr = 1;
  while (dayPtr <= lastDay) {
    const start = new Date(year, monthIndex, dayPtr);
    const endDay = Math.min(dayPtr + 6, lastDay);
    const end = new Date(year, monthIndex, endDay);
    weeks.push({ start, end, label: String(dayPtr) });
    dayPtr = endDay + 1;
  }
  return weeks;
}

function getBookingForDate(date, bookings) {
  const t = date.getTime();
  for (const b of bookings) {
    const s = new Date(b.start_date || b.start).getTime();
    const e = new Date(b.end_date || b.end).getTime();
    if (t >= s && t <= e) return b;
  }
  return null;
}

// ── Week Cell ──
function WeekCell({ week, bookings, onSelect, selected }) {
  const mid = new Date(week.start);
  mid.setDate(mid.getDate() + 3);
  const booking = getBookingForDate(mid, bookings);
  const isPast = week.end < new Date();
  const isAvailable = !booking && !isPast;
  const colors = booking ? (STATUS_COLORS[booking.status] || STATUS_COLORS.Booked) : null;

  const baseStyle = {
    width: 34, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: isAvailable ? "pointer" : "default",
    transition: "all 0.15s ease",
    background: selected ? "#193660" : booking ? colors.bg : isPast ? "#f0f0f0" : "#ecfdf5",
    color: selected ? "#fff" : booking ? colors.text : isPast ? "#bbb" : "#166534",
    opacity: isPast ? 0.4 : 1,
    border: selected ? "2px solid #0f2440" : "1px solid transparent",
  };

  const title = booking
    ? `${booking.status}: ${booking.route || ""}`
    : isPast ? "Past" : "Available — click to enquire";

  return (
    <div
      onClick={() => isAvailable && onSelect(week)}
      title={title}
      style={baseStyle}
      onMouseEnter={(e) => { if (isAvailable && !selected) e.currentTarget.style.background = "#bbf7d0"; }}
      onMouseLeave={(e) => { if (isAvailable && !selected) e.currentTarget.style.background = "#ecfdf5"; }}
    >
      {week.label}
    </div>
  );
}

// ── Enquiry Form ──
function EnquiryForm({ yacht, week, slug, onClose, onSubmit }) {
  const startStr = week.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endDate = new Date(week.start); endDate.setDate(endDate.getDate() + 7);
  const endStr = endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const dateRange = `${startStr} – ${endStr}`;

  const [form, setForm] = useState({
    name: "", email: "", phone: "", dates: dateRange, embark: "", disembark: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name || !form.email) return;
    setSubmitting(true);
    try {
      await onSubmit({
        proposal_slug: slug,
        yacht_id: yacht.id,
        yacht_name: yacht.name,
        client_name: form.name,
        client_email: form.email,
        client_phone: form.phone,
        preferred_dates: form.dates,
        embarkation_port: form.embark,
        disembarkation_port: form.disembark,
        notes: form.notes,
      });
      setDone(true);
    } catch (e) {
      console.error("Enquiry failed:", e);
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: "#193660", color: "#fff", padding: "24px 28px", textAlign: "center",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>✓ Enquiry Sent</div>
        <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
          Your enquiry for <strong>{yacht.name}</strong> ({form.dates}) has been sent.<br />
          Expect to hear back within the hour.
        </div>
        <button onClick={onClose} style={{
          marginTop: 14, padding: "8px 20px", background: "rgba(255,255,255,0.15)", color: "#fff",
          border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, cursor: "pointer", fontSize: 13,
          fontFamily: "inherit",
        }}>Close</button>
      </div>
    );
  }

  const inputStyle = {
    padding: "9px 12px", border: "1px solid #ddd", borderRadius: 6,
    fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
    color: "#193660", marginBottom: 4, display: "block",
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
      background: "#fff", borderTop: "3px solid #193660",
      boxShadow: "0 -8px 32px rgba(0,0,0,0.18)", padding: "20px 24px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: "#193660" }}>
            Enquire — {yacht.name}
          </div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{dateRange}</div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999",
          padding: "4px 8px", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Form fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={labelStyle}>Name *</label>
          <input style={inputStyle} placeholder="Your name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label style={labelStyle}>Email *</label>
          <input style={inputStyle} type="email" placeholder="Email address" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label style={labelStyle}>Phone</label>
          <input style={inputStyle} placeholder="Phone (optional)" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={labelStyle}>Preferred Dates</label>
          <input style={inputStyle} value={form.dates} onChange={(e) => set("dates", e.target.value)} /></div>
        <div><label style={labelStyle}>Embarkation Port</label>
          <input style={inputStyle} placeholder="e.g. Athens" value={form.embark} onChange={(e) => set("embark", e.target.value)} /></div>
        <div><label style={labelStyle}>Disembarkation Port</label>
          <input style={inputStyle} placeholder="e.g. Naples" value={form.disembark} onChange={(e) => set("disembark", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Additional Requests</label>
          <input style={inputStyle} placeholder="Special occasions, dietary requirements..." value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button onClick={handleSubmit} disabled={submitting || !form.name || !form.email} style={{
            padding: "10px 28px", background: (!form.name || !form.email) ? "#ccc" : "#D44035",
            color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600,
            cursor: (!form.name || !form.email) ? "default" : "pointer", fontFamily: "inherit",
            whiteSpace: "nowrap", opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? "Sending..." : "Send Enquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar Component ──
export default function AvailabilityCalendar({ yacht, bookings = [], slug, onSubmitEnquiry }) {
  const [selectedWeek, setSelectedWeek] = useState(null);
  const year = new Date().getFullYear();

  const monthWeeks = useMemo(() =>
    MONTHS_CONFIG.map((m) => ({ ...m, weeks: getWeeksForMonth(year, m.index) })),
    [year]
  );

  const handleSelect = (week) => {
    setSelectedWeek((prev) =>
      prev && prev.start.getTime() === week.start.getTime() ? null : week
    );
  };

  return (
    <div style={{ marginTop: 16, marginBottom: 8 }}>
      {/* Section label */}
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
        color: "#193660", marginBottom: 10,
      }}>
        Availability {year}
      </div>

      {/* Calendar grid */}
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "flex", gap: 3, minWidth: 560 }}>
          {monthWeeks.map(({ label, weeks }) => (
            <div key={label} style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                color: "#999", marginBottom: 5, textAlign: "center",
              }}>{label}</div>
              <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
                {weeks.map((w, i) => (
                  <WeekCell
                    key={i}
                    week={w}
                    bookings={bookings}
                    selected={selectedWeek && selectedWeek.start.getTime() === w.start.getTime()}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: "#999" }}>
        {[
          { color: "#dc2626", label: "Booked" },
          { color: "#f59e0b", label: "Option" },
          { color: "#ecfdf5", label: "Available", border: "#bbf7d0" },
        ].map(({ color, label, border }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, background: color,
              border: border ? `1px solid ${border}` : "none", display: "inline-block",
            }} />
            {label}
          </span>
        ))}
      </div>

      {/* Enquiry form */}
      {selectedWeek && (
        <EnquiryForm
          yacht={yacht}
          week={selectedWeek}
          slug={slug}
          onClose={() => setSelectedWeek(null)}
          onSubmit={onSubmitEnquiry}
        />
      )}
    </div>
  );
}
