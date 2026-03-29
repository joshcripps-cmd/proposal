// netlify/functions/image-proxy.js
// Proxies external images and returns them as base64 for PDF generation
// This avoids CORS issues when converting images to canvas for jsPDF
// Uses native fetch (Node 18+)

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const url = event.queryStringParameters?.url;
  if (!url) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing url parameter" }),
    };
  }

  // Only allow proxying from trusted domains
  const allowed = [
    "yachtfolio.com",
    "images.yachtfolio.com",
    "www.yachtfolio.com",
    "supabase.co",
  ];
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname;
    if (!allowed.some((d) => domain === d || domain.endsWith("." + d))) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: "Domain not allowed" }),
      };
    }
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid URL" }),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: { "User-Agent": "RoccabellaYachts/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Fetch failed: ${response.status}` }),
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const base64 = buffer.toString("base64");
    const dataUri = `data:${contentType};base64,${base64}`;

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
      body: JSON.stringify({ dataUri }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
