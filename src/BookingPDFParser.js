// BookingPDFParser.js
// Parses a Yachtfolio booking PDF (text extracted via pdfjs) into structured data
// Format: one PDF, multiple yachts, each with Start / End / Status columns

const DATE_RE = /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/;
const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

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

export function parseBookingPDF(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const yachts = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip table headers and page artifacts
    if (['Start','End','Status','Booking list'].includes(line)) continue;
    if (line.match(/^\d{2}\/\d{2}\/\d{4}/)) continue; // date/time header
    if (line.match(/^https?:\/\//)) continue;
    if (line.match(/^\d+\/\d+$/)) continue; // page numbers

    // Yacht name line follows "Last update: ..."
    if (line.startsWith('Last update:')) {
      const candidate = lines[i + 1];
      if (candidate && !candidate.startsWith('Last update') && !DATE_RE.test(candidate) && candidate !== 'Start') {
        current = {
          name: candidate,
          lastUpdate: line.replace('Last update:', '').trim(),
          bookings: [],
        };
        yachts.push(current);
        i++; // skip the name line
      }
      continue;
    }

    if (!current) continue;

    // Start date line
    if (DATE_RE.test(line)) {
      const startDate = parseDate(line);
      const nextLine = lines[i + 1];
      if (nextLine && DATE_RE.test(nextLine)) {
        const endDate = parseDate(nextLine);
        // Gather status text after the end date
        let statusParts = [];
        let k = i + 2;
        while (
          k < lines.length &&
          !DATE_RE.test(lines[k]) &&
          !lines[k].startsWith('Last update') &&
          !['Start','End','Status'].includes(lines[k]) &&
          !lines[k].match(/^\d{2}\/\d{2}\/\d{4}/)
        ) {
          statusParts.push(lines[k]);
          k++;
        }
        const statusRaw = statusParts.join(' ').trim();
        const typeMatch = statusRaw.match(/^(Booked|Option)/i);
        const status = typeMatch ? typeMatch[1].toLowerCase() : 'booked';
        const route = statusRaw.replace(/^(Booked|Option)\s*[-–]?\s*/i, '').trim();

        if (startDate && endDate) {
          current.bookings.push({
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

  return yachts;
}

// Write parsed bookings to Supabase for a given proposal
export async function saveBookingsToSupabase(parsedYachts, proposalId, supabaseUrl, supabaseKey) {
  const results = { saved: 0, errors: [] };

  // First delete existing bookings for this proposal (refresh)
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

  // Look up yacht IDs by name
  const names = parsedYachts.map(y => y.name);
  const lookupRes = await fetch(
    `${supabaseUrl}/rest/v1/yachts?select=id,name&name=in.(${names.map(n => `"${n}"`).join(',')})`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const yachtRows = lookupRes.ok ? await lookupRes.json() : [];
  const yachtMap = Object.fromEntries(yachtRows.map(y => [y.name.toUpperCase(), y.id]));

  // Insert all bookings
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
