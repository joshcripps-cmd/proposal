-- ══════════════════════════════════════════════════
-- Roccabella Proposals — Database Schema
-- ══════════════════════════════════════════════════

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Yachts ──
-- Master yacht database, populated from Yachtfolio XLSX uploads
create table yachts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  length_m numeric,
  builder text,
  year_built integer,
  year_refit integer,
  cabins integer,
  cabin_config text,
  guests integer,
  crew integer,
  summer_port text,
  winter_port text,
  price_high numeric,
  price_low numeric,
  yachtfolio_id integer,          -- Yachtfolio internal ID for API calls
  brochure_url text,              -- Yachtfolio e-brochure link
  hero_image_url text,            -- Cached exterior image URL
  features text[],                -- Array of key features
  notes text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Proposals ──
create table proposals (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,       -- URL-friendly identifier (e.g. 'richardson-med-2026')
  client_name text not null,
  title text not null,
  destination text,
  discount numeric default 0,      -- Percentage discount
  broker_friendly boolean default false,
  message text,                    -- Personal message to client
  itinerary_link text,             -- Charter Itinerary URL
  status text default 'draft' check (status in ('draft', 'sent', 'viewed', 'expired')),
  yacht_ids uuid[],                -- Array of yacht IDs included in this proposal
  created_by text default 'josh',  -- Broker who created it
  expires_at timestamptz,          -- Optional expiry date
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Analytics Events ──
-- Tracks every interaction with a proposal
create table analytics (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references proposals(id) on delete cascade,
  event_type text not null check (event_type in (
    'page_view',        -- Proposal was opened
    'yacht_view',       -- Yacht detail was opened
    'shortlist_add',    -- Yacht added to shortlist
    'shortlist_remove', -- Yacht removed from shortlist
    'comparison_view',  -- Comparison table opened
    'enquiry_sent',     -- Enquiry submitted
    'pdf_download',     -- PDF was downloaded
    'entry_gate'        -- Viewer entered their name
  )),
  viewer_name text,                -- Name entered at gate
  yacht_id uuid references yachts(id),  -- Which yacht (for yacht-specific events)
  metadata jsonb default '{}',     -- Any additional data
  ip_address inet,
  user_agent text,
  session_id text,                 -- Browser session identifier
  created_at timestamptz default now()
);

-- ── Shortlists ──
-- Persistent shortlist state per proposal per viewer
create table shortlists (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references proposals(id) on delete cascade,
  yacht_id uuid references yachts(id) on delete cascade,
  viewer_name text,
  session_id text,
  created_at timestamptz default now(),
  unique(proposal_id, yacht_id, session_id)
);

-- ── Enquiries ──
-- When a client submits interest from the proposal
create table enquiries (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references proposals(id) on delete cascade,
  viewer_name text not null,
  shortlisted_yacht_ids uuid[],
  message text,
  contact_preference text,
  session_id text,
  created_at timestamptz default now()
);

-- ── Email Notifications Log ──
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references proposals(id) on delete cascade,
  type text not null check (type in ('first_view', 'enquiry', 'shortlist_update')),
  recipient text not null,
  sent_at timestamptz default now(),
  payload jsonb default '{}'
);

-- ══════════════════════════════════════════════════
-- Indexes for performance
-- ══════════════════════════════════════════════════
create index idx_analytics_proposal on analytics(proposal_id);
create index idx_analytics_event on analytics(event_type);
create index idx_analytics_created on analytics(created_at);
create index idx_shortlists_proposal on shortlists(proposal_id);
create index idx_proposals_slug on proposals(slug);
create index idx_proposals_status on proposals(status);
create index idx_yachts_name on yachts(name);
create index idx_notifications_proposal on notifications(proposal_id);

-- ══════════════════════════════════════════════════
-- Views for the admin dashboard
-- ══════════════════════════════════════════════════

-- Proposal summary with analytics counts
create or replace view proposal_summaries as
select
  p.id,
  p.slug,
  p.client_name,
  p.title,
  p.destination,
  p.discount,
  p.broker_friendly,
  p.status,
  p.created_at,
  coalesce(array_length(p.yacht_ids, 1), 0) as yacht_count,
  count(distinct a.id) filter (where a.event_type = 'page_view') as total_views,
  count(distinct a.session_id) filter (where a.event_type = 'page_view') as unique_viewers,
  max(a.created_at) filter (where a.event_type = 'page_view') as last_viewed_at,
  (select array_agg(distinct y.name)
   from shortlists s
   join yachts y on y.id = s.yacht_id
   where s.proposal_id = p.id) as shortlisted_yacht_names,
  count(distinct s2.yacht_id) as shortlisted_count
from proposals p
left join analytics a on a.proposal_id = p.id
left join shortlists s2 on s2.proposal_id = p.id
group by p.id;

-- Yacht engagement stats across all proposals
create or replace view yacht_engagement as
select
  y.id,
  y.name,
  count(distinct a.proposal_id) as proposals_featured_in,
  count(*) filter (where a.event_type = 'yacht_view') as detail_views,
  count(*) filter (where a.event_type = 'shortlist_add') as times_shortlisted,
  count(*) filter (where a.event_type = 'enquiry_sent') as enquiry_mentions
from yachts y
left join analytics a on a.yacht_id = y.id
group by y.id;

-- ══════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ══════════════════════════════════════════════════
alter table proposals enable row level security;
alter table yachts enable row level security;
alter table analytics enable row level security;
alter table shortlists enable row level security;
alter table enquiries enable row level security;

-- Public read for proposals (needed for client viewer)
create policy "Public can read sent proposals" on proposals
  for select using (status in ('sent', 'viewed'));

-- Public can read yachts
create policy "Public can read active yachts" on yachts
  for select using (active = true);

-- Public can insert analytics
create policy "Public can insert analytics" on analytics
  for insert with check (true);

-- Public can manage shortlists
create policy "Public can manage shortlists" on shortlists
  for all using (true);

-- Public can insert enquiries
create policy "Public can insert enquiries" on enquiries
  for insert with check (true);

-- Authenticated users (admin) can do everything
create policy "Admin full access proposals" on proposals
  for all using (auth.role() = 'authenticated');

create policy "Admin full access yachts" on yachts
  for all using (auth.role() = 'authenticated');

create policy "Admin read analytics" on analytics
  for select using (auth.role() = 'authenticated');

create policy "Admin read enquiries" on enquiries
  for select using (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════
-- Auto-update proposal status on first view
-- ══════════════════════════════════════════════════
create or replace function update_proposal_on_view()
returns trigger as $$
begin
  if NEW.event_type = 'page_view' then
    update proposals
    set status = 'viewed', updated_at = now()
    where id = NEW.proposal_id and status = 'sent';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_proposal_viewed
  after insert on analytics
  for each row execute function update_proposal_on_view();

-- ══════════════════════════════════════════════════
-- Auto-update timestamps
-- ══════════════════════════════════════════════════
create or replace function update_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger trg_proposals_updated
  before update on proposals
  for each row execute function update_updated_at();

create trigger trg_yachts_updated
  before update on yachts
  for each row execute function update_updated_at();
