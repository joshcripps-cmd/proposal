import { useState } from "react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(25,54,96,0.45)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  zIndex: 1000,
  fontFamily: "'DM Sans', sans-serif",
};
const panel = {
  background: '#fff',
  borderRadius: '16px 16px 0 0',
  border: '1px solid #e5e7eb',
  padding: '1.5rem',
  width: '100%',
  maxWidth: 560,
};
const label = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 };
const input = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid #d1d5db', borderRadius: 8,
  background: '#f9fafb', color: '#111', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '10px', background: '#193660', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
  cursor: 'pointer',
};
const btnCancel = {
  padding: '10px 16px', background: 'transparent', color: '#6b7280',
  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer',
};

function toInputDate(d) {
  if (!d) return '';
  return d instanceof Date ? d.toISOString().split('T')[0] : d;
}

export default function EnquiryModal({ yacht, week, proposalId, viewerName, onClose }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    charter_from: toInputDate(week?.start),
    charter_to: toInputDate(week?.end),
    port_from: '', port_to: '', notes: '',
  });
  const [state, setState] = useState('idle'); // idle | submitting | success | error

  if (!yacht || !week) return null;

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtD = (d) => d ? `${new Date(d).getDate()} ${months[new Date(d).getMonth()]}` : '';

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.first_name || !form.email) { alert('Please enter your name and email.'); return; }
    setState('submitting');
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/enquiries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          proposal_id: proposalId,
          viewer_name: `${form.first_name} ${form.last_name}`.trim(),
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          yacht_id: yacht.id || null,
          yacht_name: yacht.name,
          charter_from: form.charter_from,
          charter_to: form.charter_to,
          port_from: form.port_from,
          port_to: form.port_to,
          message: form.notes,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setState('success');
      setTimeout(onClose, 2800);
    } catch {
      setState('error');
    }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        {state === 'success' ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#193660', marginBottom: 6 }}>Enquiry sent</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Josh will be in touch within the hour.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#193660', marginBottom: 3 }}>
              Enquire about {yacht.name}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: '1.25rem' }}>
              Selected window: {fmtD(week.start)} – {fmtD(week.end)} 2026
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>First name</label>
                <input style={input} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Sarah" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Last name</label>
                <input style={input} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Williams" />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Email</label>
              <input style={input} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="sarah@example.com" />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Charter start</label>
                <input style={input} type="date" value={form.charter_from} onChange={e => set('charter_from', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Charter end</label>
                <input style={input} type="date" value={form.charter_to} onChange={e => set('charter_to', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Embarkation port</label>
                <input style={input} value={form.port_from} onChange={e => set('port_from', e.target.value)} placeholder="Palma" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Disembarkation port</label>
                <input style={input} value={form.port_to} onChange={e => set('port_to', e.target.value)} placeholder="Barcelona" />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={label}>Additional requests</label>
              <input style={input} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Special occasions, dietary requirements..." />
            </div>

            {state === 'error' && (
              <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 8 }}>Something went wrong. Please try again.</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btnCancel} onClick={onClose}>Cancel</button>
              <button style={btnPrimary} onClick={submit} disabled={state === 'submitting'}>
                {state === 'submitting' ? 'Sending...' : 'Send enquiry →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
