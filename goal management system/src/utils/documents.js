// Generated-document helper — saves a rendered preview (Proposal / MOM / Policy
// Review etc.) into the client's Documents store so it shows up in the Documents
// module and the Client Profile "Documents" tab, exactly like an uploaded file.
//
// Documents live inside `client.clientDetails.attachments[]` as objects. An
// HTML-backed generated document carries { fileType:'text/html', html, dataUrl }
// so the existing preview components can render it in an iframe and download it.

import { useEffect, useMemo } from 'react';
import { updateClient } from '../services/db';
import { getCurrentUser } from './auth';

// Converts a base64 `data:` URL into an in-memory `blob:` URL. Chromium caps
// the length of every URL (any scheme, `data:` included) at roughly 2M
// characters — a base64-encoded file is ~33% larger than its raw bytes, so a
// PDF as small as ~1.5MB can already cross that cap. Past it, the browser
// silently refuses to load the URL: no console error, the <iframe>/<embed>
// just renders blank. This is exactly what a multi-page/landscape PDF
// (bigger per page, so it crosses the cap well under typical upload-size
// limits) looks like when previewed directly from its stored data URL. A
// `blob:` URL has no such ceiling — it's just a short in-memory reference —
// so converting to one before handing it to an <iframe>/<embed> fixes it.
export const dataUrlToBlobUrl = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  try {
    const commaIdx = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, commaIdx);
    if (!/;base64$/i.test(header)) return dataUrl; // not base64 — nothing to decode
    const mime = (/^data:([^;]+)/.exec(header) || [])[1] || 'application/octet-stream';
    const binary = atob(dataUrl.slice(commaIdx + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return dataUrl; // fall back to the original rather than break the caller
  }
};

// React hook wrapper — memoizes the blob URL per source `dataUrl` and revokes
// the previous one whenever it changes or the component unmounts, so preview
// modals don't leak object URLs as different files are opened.
export function useBlobUrl(dataUrl) {
  const blobUrl = useMemo(() => dataUrlToBlobUrl(dataUrl), [dataUrl]);
  useEffect(() => () => {
    if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);
  return blobUrl;
}

const pad = (n) => String(n).padStart(2, '0');

// Build a document name slug, e.g.  mom_Aarav Sharma_2026-06-30_15-41
export const buildDocName = (kind, clientName) => {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const safe = (clientName || 'Client').trim();
  return `${kind}_${safe}_${date}_${time}`;
};

// Wrap raw inner HTML into a self-contained, printable HTML document so it
// renders correctly inside an isolated iframe (no app styles leak in/out).
export const wrapStandaloneHtml = (innerHtml, title = 'Document', extraCss = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; background: #ffffff; color: #1e293b; padding: 20px; }
  table { border-collapse: collapse; }
  img { max-width: 100%; }
  /* This is what actually renders when someone prints/saves-as-PDF a saved
     document later (Documents tab, Client Profile) — the live in-app print
     styles never apply there, this saved HTML is all a print dialog ever
     sees. Without this, a plain browser print has no margin/page-break/color
     control at all, which is what "messy PDF" meant in practice. */
  @media print {
    @page { margin: 6mm; size: A4; }
    body { padding: 10mm 8mm !important; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    div[style*="border-radius:10px"] {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    div[style*="grid-template-columns"] {
      display: flex !important;
      flex-wrap: wrap !important;
    }
    div[style*="grid-template-columns"] > div {
      flex: 1 1 200px !important;
    }
  }
  /* extraCss goes LAST, after the generic @media print block above, so a
     caller with its own carefully-sized page rules (Investment/Other-Code
     Proposal's zero-margin, precisely-297mm-tall .inv-page boxes) wins the
     cascade instead of silently losing to the generic 6mm @page here. Before
     this reordering, a proposal's own "@page{margin:0}" was declared FIRST
     and the generic "@page{margin:6mm}" below it won by source order (same
     specificity, no !important on either side) — so every saved proposal
     PDF was actually rendered against a page 12mm shorter/narrower than what
     its .inv-page boxes were sized for, pushing content past the real page
     edge and forcing extra, wrongly-split pages. */
  ${extraCss}
</style></head>
<body>${innerHtml}</body></html>`;

// Print-safety CSS forced into a document at print time, regardless of what
// CSS its stored `html` already carries. Documents saved before this fix
// existed have NO print CSS baked in at all, so without this injection their
// backgrounds (letterhead gradient, colored badge fills) print as blank
// white — since browsers strip background colors by default when printing —
// leaving white-on-white/near-invisible text. Injecting it here fixes every
// saved document retroactively, old and new, without touching stored data.
//
// Split into two pieces so patchHtmlForPrint can skip just the geometry
// rules for a document that already defines its own @page — see there.
const PRINT_SAFETY_GEOMETRY = `
    @page { margin: 6mm; size: A4; }
    /* @page margin support is inconsistent across print engines — body
       padding is the reliable fallback so pages never end up flush edge-
       to-edge even where @page is ignored. Overrides any padding:0 the
       stored HTML's own print block may have set (this rule is injected
       after it, so it wins at equal specificity). */
    body { padding: 10mm 8mm !important; }`;

const PRINT_SAFETY_REST = `
    html, body { background: #ffffff !important; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    /* Keep each card/section whole across a page break instead of slicing
       it — every card in the generated documents (MOM, proposals, reviews)
       shares this same rounded-corner container style. */
    div[style*="border-radius:10px"] {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* CSS Grid does not fragment reliably across a print page break in
       Chrome — even with break-inside:avoid on its container, a grid's
       own children can still split apart from their header onto the next
       page. Force multi-column layouts to flex instead, which paginates
       correctly, for every "N equal columns" grid in the generated docs
       (the two-column To Do List, the client profile field grid, etc). */
    div[style*="grid-template-columns"] {
      display: flex !important;
      flex-wrap: wrap !important;
    }
    div[style*="grid-template-columns"] > div {
      flex: 1 1 200px !important;
    }`;

const PRINT_SAFETY_CSS = `@media print {${PRINT_SAFETY_GEOMETRY}${PRINT_SAFETY_REST}
  }`;

// Injects PRINT_SAFETY_CSS into a saved document's raw HTML, regardless of
// whether that HTML already carries print CSS of its own.
export const patchHtmlForPrint = (html) => {
  if (!html) return html;
  // A document that already declares its own @page rule (Investment/
  // Other-Code Proposal's zero-margin .inv-page boxes, sized exactly for a
  // full untouched 297mm page) manages its own page geometry end to end.
  // Forcing this generic 6mm @page + body padding on top of that broke its
  // math — the box still assumed a full page was available, so content ran
  // past the real (now 12mm-shrunk) printable area and spilled onto extra,
  // wrongly-split pages. Skip ONLY the geometry rules in that case; the
  // background/color-adjust/break-inside safety nets below are harmless
  // everywhere and still applied, exactly as before, for every other
  // document (which never declares @page itself and still needs them).
  const css = /@page\b/.test(html)
    ? `@media print {${PRINT_SAFETY_REST}\n  }`
    : PRINT_SAFETY_CSS;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `<style>${css}</style></head>`)
    : `<style>${css}</style>${html}`;
};

// Build a fresh, print-safe data: URL for a saved document's HTML — used so
// a *downloaded* .html file also renders/prints correctly outside the app
// (its own file.dataUrl was captured at save time and carries the same
// stale CSS gap as file.html would).
export const printSafeDataUrl = (html) =>
  'data:text/html;charset=utf-8,' + encodeURIComponent(patchHtmlForPrint(html));

// Open a saved document's raw HTML in a fresh window and print it there —
// bypasses the fixed-height scrolling iframe used for on-screen preview,
// and force-injects PRINT_SAFETY_CSS so colors/backgrounds always survive
// printing even for documents saved long before that CSS existed.
export const printHtmlDocument = (html) => {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow pop-ups to print this document.');
    return false;
  }
  w.document.write(patchHtmlForPrint(html));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
};

// Serialize a live DOM element to HTML, converting any <canvas> (e.g. Chart.js
// charts) into static <img> snapshots so they survive in the saved document.
export const snapshotElementHtml = (el) => {
  if (!el) return '';
  const clone = el.cloneNode(true);
  const srcCanvases = el.querySelectorAll('canvas');
  const dstCanvases = clone.querySelectorAll('canvas');
  srcCanvases.forEach((canvas, i) => {
    const dst = dstCanvases[i];
    if (!dst) return;
    try {
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.style.cssText = canvas.getAttribute('style') || '';
      img.style.maxWidth = '100%';
      dst.replaceWith(img);
    } catch { /* tainted canvas — leave as-is */ }
  });
  // Drop any elements explicitly hidden from print/export
  clone.querySelectorAll('.no-print').forEach(n => n.remove());
  return clone.outerHTML;
};

// Persist a generated HTML document onto the client's Documents/Attachments.
// Returns the generated document name. Throws if there is no client.
export const saveGeneratedDocument = async (client, { kind, label, html, name: explicitName }) => {
  if (!client?.id) throw new Error('This document is not linked to a saved client, so it cannot be saved.');
  // Callers that know what the document actually IS (a proposal knows the
  // applicant it was drawn for and which proposal types it covers) pass their
  // own name; buildDocName is the fallback for everything else.
  const name = (explicitName || '').trim() || buildDocName(kind, client.name);
  const attachment = {
    // Date.now() alone collides when two documents are saved in the same
    // millisecond, and a duplicate id makes two distinct documents
    // indistinguishable to every by-id lookup that touches attachments.
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    fileName: name + '.html',
    fileType: 'text/html',
    html,
    dataUrl: 'data:text/html;charset=utf-8,' + encodeURIComponent(html),
    date: new Date().toISOString(),
    uploadedBy: getCurrentUser()?.name || 'System',
    category: label,
    source: kind,
  };
  const details = client.clientDetails || {};
  const existing = details.attachments || [];
  await updateClient(client.id, {
    clientDetails: { ...details, attachments: [attachment, ...existing] },
  });
  if (window.refreshAppData) await window.refreshAppData();
  return name;
};
