diff --git a/src/components/AdminDashboard.jsx b/src/components/AdminDashboard.jsx
index 91f5b75..2c17a50 100644
--- a/src/components/AdminDashboard.jsx
+++ b/src/components/AdminDashboard.jsx
@@ -57,13 +57,42 @@ function toISO(d) {
 }
 
 function parseBookingPDFText(rawText) {
-  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
+  // Pre-process: fix merged lines from pdfjs Y-position grouping
+  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
+  const lines = [];
+
+  const FULL_DATE = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/g;
+
+  for (const l of rawLines) {
+    // 1. Split "Start End Status" jammed onto end of any line
+    if (l.endsWith('Start End Status')) {
+      const base = l.slice(0, l.length - 'Start End Status'.length).trim();
+      if (base) lines.push(base);
+      lines.push('Start'); lines.push('End'); lines.push('Status');
+      continue;
+    }
+    if (l.endsWith('Start End')) {
+      const base = l.slice(0, l.length - 'Start End'.length).trim();
+      if (base) lines.push(base);
+      lines.push('Start'); lines.push('End');
+      continue;
+    }
+
+    // 2. Split lines with TWO dates on them: "01 Nov 2025 09 May 2026 Booked - ..."
+    // → "01 Nov 2025", "09 May 2026 Booked - ..."
+    const dateMatches = [...l.matchAll(FULL_DATE)];
+    if (dateMatches.length >= 2) {
+      const secondStart = dateMatches[1].index;
+      lines.push(l.slice(0, secondStart).trim());  // first date
+      lines.push(l.slice(secondStart).trim());       // second date + rest
+      continue;
+    }
+
+    lines.push(l);
+  }
 
   // Phase 1: Extract yacht names
-  // After positional reassembly, a "Last update:" line is followed by:
-  //   - optionally a datetime-only line (if name wasn't on same row)
-  //   - then the YACHT NAME on its own line
-  // OR the name is already extracted inline: "Last update: DD Mon YYYY HH:MM:SS YACHT NAME"
+  // Format: "Last update: DD Mon YYYY HH:MM:SS YACHT NAME" (name inline after timestamp)
   const yachtNames = [];
   const yachtSet = new Set();
 
@@ -75,7 +104,7 @@ function parseBookingPDFText(rawText) {
     const inline = (m[1] || '').trim();
 
     if (inline && !DATETIME_ONLY_RE.test(inline) && !/^\d{2}:\d{2}:\d{2}$/.test(inline)) {
-      // Name is inline on the same line
+      // Name is inline on the same line — strip any trailing time fragment
       const name = inline.replace(/\d{2}:\d{2}:\d{2}\s*/, '').trim();
       if (name && !yachtSet.has(name)) { yachtSet.add(name); yachtNames.push(name); }
     } else {
@@ -84,7 +113,6 @@ function parseBookingPDFText(rawText) {
       while (j < lines.length && /^\d{2}:\d{2}:\d{2}$/.test(lines[j])) j++;
       if (j < lines.length) {
         const name = lines[j].trim();
-        // Validate: not a date, not "Last update", not a skip word, not a timestamp
         if (
           name &&
           !LAST_UPDATE_RE.test(name) &&
@@ -255,21 +283,23 @@ async function extractTextFromPDF(file) {
     const page = await pdf.getPage(i);
     const content = await page.getTextContent();
 
-    // This PDF shatters every word into individual character fragments.
-    // Empty string items (str === '') act as line-break markers between logical rows.
-    // Concatenate all non-empty fragments; flush as a line on each empty item.
-    let buf = '';
+    // Group text items by Y position (rounded to nearest 2px to handle sub-pixel variance).
+    // This is more reliable than relying on empty-string markers which vary by PDF.
+    const rowMap = new Map();
     for (const item of content.items) {
-      if (item.str === '' || item.str === undefined) {
-        const line = buf.trim();
-        if (line) allLines.push(line);
-        buf = '';
-      } else {
-        buf += item.str;
-      }
+      if (!item.str || item.str.trim() === '') continue;
+      const y = Math.round(item.transform[5] / 2) * 2;
+      if (!rowMap.has(y)) rowMap.set(y, []);
+      rowMap.get(y).push({ x: item.transform[4], str: item.str });
+    }
+
+    // Sort rows top-to-bottom (PDF Y coords are bottom-up, so descending = top-to-bottom)
+    const sortedYs = [...rowMap.keys()].sort((a, b) => b - a);
+    for (const y of sortedYs) {
+      const items = rowMap.get(y).sort((a, b) => a.x - b.x);
+      const line = items.map(it => it.str).join('').trim();
+      if (line) allLines.push(line);
     }
-    const last = buf.trim();
-    if (last) allLines.push(last);
   }
 
   return allLines.join('\n');
