/**
 * Roccabella Proposals — Supabase Client
 * Shared database client with typed helpers for all operations.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Session ID (persists per browser session) ──
function getSessionId() {
  let sid = sessionStorage.getItem('rb_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('rb_session_id', sid);
  }
  return sid;
}

// ── PROPOSALS ──
export async function getProposalBySlug(slug) {
  const { data, error } = await supabase.from('proposals').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

export async function getAllProposals() {
  const { data, error } = await supabase.from('proposal_summaries').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createProposal(proposal) {
  const slug = proposal.client_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  const { data, error } = await supabase.from('proposals').insert({ ...proposal, slug }).select().single();
  if (error) throw error;
  return data;
}

export async function updateProposal(id, updates) {
  const { data, error } = await supabase.from('proposals').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function sendProposal(id) { return updateProposal(id, { status: 'sent' }); }

// ── YACHTS ──
export async function getYachtsByIds(ids) {
  const { data, error } = await supabase.from('yachts').select('*').in('id', ids).eq('active', true).order('length_m', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAllYachts() {
  const { data, error } = await supabase.from('yachts').select('*').eq('active', true).order('length_m', { ascending: false });
  if (error) throw error;
  return data;
}

export async function upsertYachts(yachts) {
  const results = [];
  for (const yacht of yachts) {
    // Try to find existing yacht by name + builder (more unique than name alone)
    const { data: existing } = await supabase
      .from('yachts')
      .select('id')
      .eq('name', yacht.name)
      .eq('builder', yacht.builder || '')
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing yacht
      const { data, error } = await supabase
        .from('yachts')
        .update({ ...yacht, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select();
      if (error) { console.warn('Update error for', yacht.name, error); continue; }
      if (data) results.push(...data);
    } else {
      // Insert new yacht
      const { data, error } = await supabase
        .from('yachts')
        .insert(yacht)
        .select();
      if (error) { console.warn('Insert error for', yacht.name, error); continue; }
      if (data) results.push(...data);
    }
  }
  return results;
}

// ── ANALYTICS ──
export async function trackEvent(proposalId, eventType, extra = {}) {
  const { error } = await supabase.from('analytics').insert({
    proposal_id: proposalId, event_type: eventType, session_id: getSessionId(),
    viewer_name: extra.viewerName || null, yacht_id: extra.yachtId || null,
    metadata: extra.metadata || {}, user_agent: navigator.userAgent,
  });
  if (error) console.warn('Analytics error:', error);
}

export async function getProposalAnalytics(proposalId) {
  const { data, error } = await supabase.from('analytics').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── SHORTLISTS ──
export async function addToShortlist(proposalId, yachtId, viewerName) {
  await supabase.from('shortlists').upsert({ proposal_id: proposalId, yacht_id: yachtId, viewer_name: viewerName, session_id: getSessionId() }, { onConflict: 'proposal_id,yacht_id,session_id' });
  await trackEvent(proposalId, 'shortlist_add', { yachtId, viewerName });
}

export async function removeFromShortlist(proposalId, yachtId) {
  await supabase.from('shortlists').delete().eq('proposal_id', proposalId).eq('yacht_id', yachtId).eq('session_id', getSessionId());
  await trackEvent(proposalId, 'shortlist_remove', { yachtId });
}

export async function getShortlist(proposalId) {
  const { data } = await supabase.from('shortlists').select('yacht_id').eq('proposal_id', proposalId).eq('session_id', getSessionId());
  return (data || []).map(s => s.yacht_id);
}

// ── YACHT BOOKINGS ──
export async function getBookingsByYachtIds(yachtIds) {
  const { data, error } = await supabase.from('yacht_bookings').select('*').in('yacht_id', yachtIds).order('start_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addBooking(booking) {
  const { data, error } = await supabase.from('yacht_bookings').insert(booking).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBooking(id) {
  const { error } = await supabase.from('yacht_bookings').delete().eq('id', id);
  if (error) throw error;
}

// ── ENQUIRIES ──
export async function submitEnquiry(proposalId, viewerName, shortlistedYachtIds, message) {
  const { data, error } = await supabase.from('enquiries').insert({ proposal_id: proposalId, viewer_name: viewerName, shortlisted_yacht_ids: shortlistedYachtIds, message, session_id: getSessionId() }).select().single();
  if (error) throw error;
  await trackEvent(proposalId, 'enquiry_sent', { viewerName, metadata: { shortlistedYachtIds } });
  try { await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'enquiry', proposalId, viewerName, shortlistedYachtIds, message }) }); } catch (e) { console.warn('Notification error:', e); }
  return data;
}

// ── CHARTER ENQUIRIES ──
export async function submitCharterEnquiry(enquiry) {
  const { data, error } = await supabase
    .from("charter_enquiries")
    .insert([{
      proposal_slug: enquiry.proposal_slug,
      yacht_id: enquiry.yacht_id,
      yacht_name: enquiry.yacht_name,
      client_name: enquiry.client_name,
      client_email: enquiry.client_email,
      client_phone: enquiry.client_phone || null,
      preferred_dates: enquiry.preferred_dates,
      embarkation_port: enquiry.embarkation_port || null,
      disembarkation_port: enquiry.disembarkation_port || null,
      notes: enquiry.notes || null,
      status: "new",
    }])
    .select();
  if (error) {
    console.error("Error submitting enquiry:", error);
    throw error;
  }
  return data?.[0] || null;
}

// ── AUTH ──
export async function signIn(email, password) { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; return data; }
export async function signOut() { await supabase.auth.signOut(); }
export async function getSession() { const { data } = await supabase.auth.getSession(); return data.session; }
export function onAuthChange(cb) { return supabase.auth.onAuthStateChange(cb); }export async function uploadPartnerLogo(file) {
  const ext = file.name.split('.').pop();
  const path = `partner-logos/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('partner-logos')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('partner-logos').getPublicUrl(path);
  return data.publicUrl;
}
// Upload a partner logo to Supabase Storage and return a signed URL (1 year)
export async function uploadPartnerLogo(file, proposalSlug) {
  if (!file) throw new Error("No file provided");

  // Validate file type
  const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload PNG, JPG, SVG, or WebP.");
  }

  // Validate size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("File too large. Max 2MB.");
  }

  // Build a unique path: slug + timestamp + extension
  const ext = file.name.split(".").pop();
  const fileName = `${proposalSlug || "logo"}-${Date.now()}.${ext}`;
  const filePath = fileName;

  // Upload
  const { error: uploadError } = await supabase.storage
    .from("partner-logos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    throw uploadError;
  }

  // Create signed URL valid for 1 year
  const { data: signedData, error: signedError } = await supabase.storage
    .from("partner-logos")
    .createSignedUrl(filePath, 31536000); // 1 year in seconds

  if (signedError) {
    console.error("Signed URL error:", signedError);
    throw signedError;
  }

  return signedData.signedUrl;
}
