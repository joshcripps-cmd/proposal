# Roccabella Proposals — Deployment Guide

## Architecture Overview

```
proposals.roccabellayachts.com  →  Client proposal viewer
admin.roccabellayachts.com      →  Admin dashboard
                    ↓
          Netlify Functions (serverless)
            /api/notify      →  Email notifications
            /api/yachtfolio  →  Yachtfolio API proxy
                    ↓
              Supabase
            (Database + Auth)
```

---

## Step 1: Supabase Setup (10 mins)

1. Go to [supabase.com](https://supabase.com) and create a new project
   - Project name: `roccabella-proposals`
   - Region: `eu-west-1` (closest to your clients)
   - Save the database password

2. Run the database migration:
   - Go to **SQL Editor** in Supabase dashboard
   - Paste the contents of `supabase/migrations/001_initial_schema.sql`
   - Click **Run**

3. Create your admin user:
   - Go to **Authentication → Users → Add User**
   - Email: `josh.cripps@roccabellayachts.com`
   - Password: (your choice)
   - Check "Auto Confirm User"

4. Get your API keys:
   - Go to **Settings → API**
   - Copy the **Project URL** → `VITE_SUPABASE_URL`
   - Copy the **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - Copy the **service_role** key → `SUPABASE_SERVICE_KEY`

---

## Step 2: Resend Email Setup (5 mins)

1. Go to [resend.com](https://resend.com) and create an account
2. Add your domain: `proposals.roccabellayachts.com`
   - Add the DNS records Resend provides
3. Create an API key → `RESEND_API_KEY`

*Alternative: Skip this step and notifications will be logged but not emailed. You can set up email later.*

---

## Step 3: Netlify Deployment (10 mins)

1. Push this project to a GitHub/GitLab repo

2. Go to [netlify.com](https://netlify.com) and click **Add New Site → Import from Git**

3. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

4. Add environment variables in **Site Settings → Environment Variables**:
   ```
   VITE_SUPABASE_URL          = https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY     = your-anon-key
   SUPABASE_URL               = https://your-project.supabase.co
   SUPABASE_SERVICE_KEY        = your-service-role-key
   YACHTFOLIO_PASSKEY          = 6b5e824f326752c8f717a3e06128a8f796562136
   RESEND_API_KEY              = re_your_api_key
   VITE_PROPOSAL_BASE_URL     = https://proposals.roccabellayachts.com
   ```

5. Deploy!

---

## Step 4: Custom Domain (5 mins)

In Netlify **Domain Management**:

**Option A: Single domain with routing**
- `proposals.roccabellayachts.com` → main site
- Admin accessed via `/admin` route

**Option B: Two separate Netlify sites**
- `proposals.roccabellayachts.com` → client proposal viewer
- `admin.roccabellayachts.com` → admin dashboard
- Both share the same Supabase backend

Add CNAME records in your DNS:
```
proposals  CNAME  your-site.netlify.app
admin      CNAME  your-admin-site.netlify.app
```

---

## Step 5: Seed Your First Data (5 mins)

### Import yachts from Yachtfolio XLSX:
1. Log into the admin dashboard
2. Go to **Yacht Database**
3. Upload your Yachtfolio comparison XLSX
4. Yachts will be parsed and saved to Supabase

### Create your first proposal:
1. Go to **New Proposal**
2. Fill in client details, select yachts
3. Click **Save as Draft**
4. Review, then click **Mark as Sent**
5. Share the link: `proposals.roccabellayachts.com/p/richardson-med-2026-xxxxx`

---

## How It Works

### Client Experience
1. Client receives proposal link via email/WhatsApp
2. Opens link → entry gate (name input)
3. **First view triggers email notification to Josh** 📧
4. Browses yacht grid → clicks into details → adds to shortlist
5. Every interaction is tracked (views, time spent, shortlists)
6. Can submit enquiry with shortlisted yachts
7. **Enquiry triggers priority email notification** 🎯

### Admin Dashboard
- **Proposals list**: See all proposals with status, views, shortlists
- **Real-time analytics**: Who viewed, when, which yachts interested them
- **Create/edit proposals**: Select yachts, set discount, toggle broker mode
- **Yacht database**: Import/manage from Yachtfolio XLSX
- **PDF generation**: Download branded proposal PDF

### Email Notifications
- **First view**: "👀 Proposal viewed: Mr. & Mrs. Richardson"
- **Enquiry**: "🎯 Enquiry received: [shortlisted yachts + message]"
- Branded HTML emails matching Roccabella style

---

## File Structure

```
roccabella-proposals/
├── netlify.toml                 # Netlify config
├── package.json                 # Dependencies
├── vite.config.js               # Build config
├── .env.example                 # Environment template
├── netlify/functions/
│   ├── notify.js                # Email notifications
│   └── yachtfolio.js            # Yachtfolio API proxy
├── supabase/migrations/
│   └── 001_initial_schema.sql   # Database schema
├── src/
│   ├── lib/
│   │   └── supabase.js          # Database client + all queries
│   ├── components/              # React components (from artifacts)
│   ├── pages/                   # Route pages
│   └── styles/                  # CSS
└── public/
    └── logo.png                 # Roccabella logo
```

---

## Environment Variables Reference

| Variable | Where | What |
|----------|-------|------|
| `VITE_SUPABASE_URL` | Netlify + local | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Netlify + local | Supabase public anon key |
| `SUPABASE_URL` | Netlify only | Same URL (for functions) |
| `SUPABASE_SERVICE_KEY` | Netlify only | Service role key (admin) |
| `YACHTFOLIO_PASSKEY` | Netlify only | Yachtfolio API passkey |
| `RESEND_API_KEY` | Netlify only | Resend email API key |
| `VITE_PROPOSAL_BASE_URL` | Netlify + local | Public URL for proposals |

---

## Next Steps After Deployment

1. **Connect real Yachtfolio data**: Upload your latest comparison XLSX
2. **Create first live proposal**: Test with a colleague before clients
3. **Set up Google Analytics**: Add GA4 tag for additional traffic data
4. **Custom domain SSL**: Netlify auto-provisions Let's Encrypt certs
5. **Team access**: Add additional admin users in Supabase Auth
