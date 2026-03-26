/**
 * Roccabella Proposals — Yachtfolio API Proxy
 * Proxies requests to Yachtfolio API, keeping the passkey server-side.
 * 
 * Endpoints:
 *   GET /api/yachtfolio?action=list              → Yacht list
 *   GET /api/yachtfolio?action=brochure&id=X     → Yacht brochure
 *   GET /api/yachtfolio?action=image&url=X       → Proxy yacht image
 *   GET /api/yachtfolio?action=bookings&id=X     → Yacht bookings/calendar
 */

const YF_PASSKEY = process.env.YACHTFOLIO_PASSKEY;
const YF_BASE = 'https://www.yachtfolio.com/api';

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { action } = params;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600',
  };

  if (!YF_PASSKEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Yachtfolio API key not configured' }) };
  }

  try {
    if (action === 'list') {
      const res = await fetch(`${YF_BASE}/api_basic.cgi?passkey=${YF_PASSKEY}&type=list`);
      const data = await res.json();
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }

    if (action === 'brochure') {
      const yachtId = params.id;
      if (!yachtId) return { statusCode: 400, headers, body: 'Missing yacht id' };
      const res = await fetch(`${YF_BASE}/api_brochure.cgi?passkey=${YF_PASSKEY}&id_yacht=${yachtId}`);
      const data = await res.json();
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }

    if (action === 'bookings') {
      const yachtId = params.id;
      if (!yachtId) return { statusCode: 400, headers, body: 'Missing yacht id' };

      // Try multiple possible Yachtfolio API endpoints for booking/calendar data
      const endpoints = [
        `${YF_BASE}/api_calendar.cgi?passkey=${YF_PASSKEY}&id_yacht=${yachtId}`,
        `${YF_BASE}/api_booking.cgi?passkey=${YF_PASSKEY}&id_yacht=${yachtId}`,
        `${YF_BASE}/api_availability.cgi?passkey=${YF_PASSKEY}&id_yacht=${yachtId}`,
        `${YF_BASE}/api_schedule.cgi?passkey=${YF_PASSKEY}&id_yacht=${yachtId}`,
        `${YF_BASE}/api_basic.cgi?passkey=${YF_PASSKEY}&type=calendar&id_yacht=${yachtId}`,
        `${YF_BASE}/api_basic.cgi?passkey=${YF_PASSKEY}&type=bookings&id_yacht=${yachtId}`,
      ];

      let bookingData = null;
      let successEndpoint = null;

      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (text && text.trim().length > 2) {
              try {
                const parsed = JSON.parse(text);
                if (parsed && !parsed.error && Object.keys(parsed).length > 0) {
                  bookingData = parsed;
                  successEndpoint = url.split('?')[0].split('/').pop();
                  break;
                }
              } catch {
                // Not JSON, skip
              }
            }
          }
        } catch {
          // Endpoint doesn't exist, try next
        }
      }

      if (bookingData) {
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: bookingData, source: successEndpoint }),
        };
      }

      // No booking API found
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: null,
          source: null,
          message: 'No booking API endpoint found. Booking data unavailable via API.',
        }),
      };
    }

    if (action === 'image') {
      const imageUrl = params.url;
      if (!imageUrl) return { statusCode: 400, headers, body: 'Missing image URL' };

      const res = await fetch(imageUrl);
      if (!res.ok) return { statusCode: res.status, headers, body: 'Image fetch failed' };

      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'image/jpeg';

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
        body: Buffer.from(buffer).toString('base64'),
        isBase64Encoded: true,
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action. Use: list, brochure, image, bookings' }) };

  } catch (err) {
    console.error('Yachtfolio proxy error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
