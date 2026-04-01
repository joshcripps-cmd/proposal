// BookingPDFParser.js

// Parses a Yachtfolio booking PDF (text extracted via pdfjs) into structured data

// Format: one PDF, multiple yachts, each with Start / End / Status columns

const DATE_RE = /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/;

const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

const LAST_UPDATE_RE = /^Last update:\s*(?:\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s*)?(.*)/i;

const DATETIME_ONLY_RE = /^\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}$/;

const SKIP_SET = new Set(['Start','End','Status','Booking list','No records to display']);

const STATUS_RE = /^(Booked|Option|Transit|Shipyard|Boat Show|Unavailable|Flexible use)/i;

const FULL_DATE_G = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/g;

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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function preProcess(rawText) {
  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const lines = [];

  for (const l of rawLines) {
    if (l.endsWith('Start End Status')) {
      const base = l.slice(0, l.length - 'Start End Status'.length).trim();
      if (base) lines.push(base);
      lines.push('Start'); lines.push('End'); lines.push('Status');
      continue;
    }

    if (l.endsWith('Start End')) {
      const base = l.slice(0, l.length - 'Start End'.length).trim();
      if (base) lines.push(base);
      lines.push('Start'); lines.push('End');
      continue;
    }

    const dateMatches = [...l.matchAll(FULL_DATE_G)];
    if (dateMatches.length >= 2) {
      const secondStart = dateMatches[1].index;
      const first = l.slice(0, secondStart).trim();
      const rest = l.slice(secondStart).trim();
      if (first) lines.push(first);
      if (rest) lines.push(rest);
      continue;
    }

    lines.push(l);
  }

  return lines;
}

export function parseBookingPDF(rawText) {
  const lines = preProcess(rawText);

  const yachtNames = [];
  const yachtSet = new Set();

  // Phase 1: Extract yacht names from "Last update: ... YACHT NAME" lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!LAST_UPDATE_RE.test(line)) continue;

    const m = LAST_UPDATE_RE.exec(line);
    const inline = (m[1] || '').trim();

    if (inline && !DATETIME_ONLY_RE.test(inline) && !/^\d{2}:\d{2}:\d{2}$/.test(inline)) {
      // Name is inline on same line after timestamp
      const name = inline.replace(/\d{2}:\d{2}:\d{2}\s*/, '').trim();
      if (name && !yachtSet.has(name)) { yachtSet.add(name); yachtNames.push(name); }
    } else {
      // Name is on the next non-empty line
      let j = i + 1;
      while (j < lines.length && /^\d{2}:\d{2}:\d{2}$/.test(lines[j])) j++;
      if (j < lines.length) {
        const name = lines[j].trim();
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
  let yachtIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (LAST_UPDATE_RE.test(line)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
    if (/^https?:\/\//.test(line)) continue;
    if (/^\d+\/\d+$/.test(line)) continue;
    if (line === 'YACHTFOLIO - Booking list') continue;
    if (DATETIME_ONLY_RE.test(line)) continue;
    if (/^\d{2}:\d{2}:\d{2}$/.test(line)) continue;
    if (yachtSet.has(line)) continue;

    // FIX: "No records to display" means this yacht has no bookings — still advance the index
    if (line === 'No records to display') {
      yachtIndex++;
      continue;
    }

    // "Start End Status" header = advance to next yacht
    if (line === 'Start' && lines[i+1] === 'End' && lines[i+2] === 'Status') {
      yachtIndex++;
      i += 2;
      continue;
    }

    if (line === 'Start' || line === 'End' || line === 'Status') continue;

    if (yachtIndex < 0 || yachtIndex >= yachtNames.length) continue;

    const currentYacht = yachtMap[yachtNames[yachtIndex]];

    if (DATE_RE.test(line)) {
      const nextLine = lines[i+1];
      if (nextLine && DATE_RE.test(nextLine)) {
        const startDate = parseDate(line);
        const endDate = parseDate(nextLine);
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

// Write parsed bookings to Supabase for a given proposal
export async function saveBookingsToSupabase(parsedYachts, proposalId, supabaseUrl, supabaseKey) {
  const results = { saved: 0, errors: [] };

  const delRes = await fetch(
    `${supabaseUrl}/rest/v1/yacht_bookings?proposal_id=eq.${proposalId}`,
    {
      method: 'DELETE',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    }
  );

  if (!delRes.ok) {
    results.errors.push(`Delete failed: ${delRes.status}`);
    return results;
  }

  const names = parsedYachts.map(y => y.name);
  const lookupRes = await fetch(
    `${supabaseUrl}/rest/v1/yachts?select=id,name&name=in.(${names.map(n => `"${n}"`).join(',')})`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );

  const yachtRows = lookupRes.ok ? await lookupRes.json() : [];
  const yachtMap = Object.fromEntries(yachtRows.map(y => [y.name.toUpperCase(), y.id]));

  for (const yacht of parsedYachts) {
    const yachtId = yachtMap[yacht.name.toUpperCase()] || null;

    const rows = yacht.bookings.map(b => ({
      proposal_id: proposalId,
      yacht_id: yachtId,
      yacht_name: yacht.name,
      start_date: b.start_date,
      end_date: b.end_date,
      status: b.status,
      route: b.route,
    }));

    if (!rows.length) continue;

    const insRes = await fetch(`${supabaseUrl}/rest/v1/yacht_bookings`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });

    if (insRes.ok) results.saved += rows.length;
    else results.errors.push(`Insert failed for ${yacht.name}: ${insRes.status}`);
  }

  return results;
}
