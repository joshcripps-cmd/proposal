// BookingPDFParser.js
// Parses a Yachtfolio booking PDF (text extracted via pdfjs) into structured data
// Handles two pdfjs extraction formats:
//   Format A: "Last update: DD Mon YYYY HH:MM:SS YACHT NAME" (name inline after timestamp)
//   Format B: "YACHT NAME" on line before "Last update: ..." (name precedes timestamp)

const DATE_RE = /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i;
const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const LAST_UPDATE_RE = /^Last update:\s*(?:\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s*)?(.*)/i;
const DATETIME_ONLY_RE = /^\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}$/i;
const TIME_ONLY_RE = /^\d{2}:\d{2}:\d{2}$/;
const STATUS_RE = /^(Booked|Option|Transit|Shipyard|Boat Show|Unavailable|Flexible use)/i;
const SKIP_LINES = new Set([
  'Start', 'End', 'Status', 'Booking list', 'No records to display',
  'YACHTFOLIO - Booking list'
]);
const JUNK_RE = /^\d{2}\/\d{2}\/\d{4}|^https?:\/\/|^\d+\/\d+$/;

function parseDate(s) {
  if (!s) return null;
  const p = s.trim().split(/\s+/);
  if (p.length < 3) return null;
  const d = parseInt(p[0]), m = MONTHS[p[1].toLowerCase()], y = parseInt(p[2]);
  if (isNaN(d) || m === undefined || isNaN(y)) return null;
  return new Date(y, m, d);
}

function toISO(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isJunk(line) {
  return JUNK_RE.test(line) || SKIP_LINES.has(line) || DATETIME_ONLY_RE.test(line) || TIME_ONLY_RE.test(line);
}

function isYachtName(line) {
  if (!line || line.length < 2) return false;
  if (isJunk(line)) return false;
  if (LAST_UPDATE_RE.test(line)) return false;
  if (DATE_RE.test(line)) return false;
  if (STATUS_RE.test(line)) return false;
  if (/^[-–]/.test(line)) return false;
  return true;
}

function splitLine(line) {
  const matches = [...line.matchAll(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi)];

  if (matches.length >= 2) {
    const secondStart = matches[1].index;
    const parts = [];
    const first = line.slice(0, secondStart).trim();
    const rest = line.slice(secondStart).trim();
    if (first) parts.push(first);
    if (rest) parts.push(...splitLine(rest));
    return parts;
  }

  if (matches.length === 1) {
    const dateEnd = matches[0].index + matches[0][0].length;
    const after = line.slice(dateEnd).trim();
    if (after && STATUS_RE.test(after)) {
      return [line.slice(0, dateEnd).trim(), after];
    }
    const beforeDate = line.slice(0, matches[0].index).trim();
    if (beforeDate && STATUS_RE.test(beforeDate)) {
      return [beforeDate, line.slice(matches[0].index).trim()];
    }
  }

  return [line];
}

function preProcess(rawText) {
  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const lines = [];

  for (const l of rawLines) {
    if (l.endsWith('Start End Status') && l !== 'Start End Status') {
      const base = l.slice(0, l.length - 'Start End Status'.length).trim();
      if (base) lines.push(base);
      lines.push('Start'); lines.push('End'); lines.push('Status');
      continue;
    }

    const parts = splitLine(l);
    for (const p of parts) {
      if (p) lines.push(p);
    }
  }

  return lines;
}

export function parseBookingPDF(rawText) {
  const lines = preProcess(rawText);

  const yachtNames = [];
  const yachtSet = new Set();

  // Phase 1: Find yacht names
  // Format A: name inline after "Last update: ..."
  // Format B: name on line BEFORE "Last update: ..."
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!LAST_UPDATE_RE.test(line)) continue;

    const m = LAST_UPDATE_RE.exec(line);
    const inline = (m[1] || '').replace(TIME_ONLY_RE, '').trim();

    if (inline && !DATETIME_ONLY_RE.test(inline) && isYachtName(inline)) {
      // Format A: name inline
      if (!yachtSet.has(inline)) {
        yachtSet.add(inline);
        yachtNames.push(inline);
      }
    } else {
      // Format B: look backwards for name
      let j = i - 1;
      while (j >= 0 && (isJunk(lines[j]) || TIME_ONLY_RE.test(lines[j]))) j--;
      const candidate = j >= 0 ? lines[j] : null;

      if (candidate && isYachtName(candidate) && !yachtSet.has(candidate)) {
        yachtSet.add(candidate);
        yachtNames.push(candidate);
      } else {
        // Fallback: look forward
        let k = i + 1;
        while (k < lines.length && (isJunk(lines[k]) || TIME_ONLY_RE.test(lines[k]))) k++;
        const fwd = k < lines.length ? lines[k] : null;
        if (fwd && isYachtName(fwd) && !yachtSet.has(fwd)) {
          yachtSet.add(fwd);
          yachtNames.push(fwd);
        }
      }
    }
  }

  if (!yachtNames.length) return [];

  const yachtMap = {};
  for (const n of yachtNames) yachtMap[n] = { name: n, bookings: [] };

  // Phase 2: Walk lines, assign bookings to yachts
  let yachtIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === 'No records to display') { yachtIndex++; continue; }
    if (isJunk(line)) continue;
    if (LAST_UPDATE_RE.test(line)) continue;
    if (yachtSet.has(line)) continue;

    // "Start End Status" header = advance to next yacht
    if (line === 'Start' && lines[i+1] === 'End' && lines[i+2] === 'Status') {
      yachtIndex++;
      i += 2;
      continue;
    }

    if (yachtIndex < 0 || yachtIndex >= yachtNames.length) continue;

    const currentYacht = yachtMap[yachtNames[yachtIndex]];

    if (DATE_RE.test(line)) {
      const nextLine = lines[i + 1];
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
          if (l === 'No records to display') break;
          if (yachtSet.has(l)) break;
          if (isJunk(l)) { k++; continue; }
          statusParts.push(l);
          k++;
        }

        const statusRaw = statusParts.join(' ').replace(/[^\x00-\x7F]/g, '').trim();
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
