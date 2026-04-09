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
    cons
