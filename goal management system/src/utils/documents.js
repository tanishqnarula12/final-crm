// Generated-document helper — saves a rendered preview (Proposal / MOM / Policy
// Review etc.) into the client's Documents store so it shows up in the Documents
// module and the Client Profile "Documents" tab, exactly like an uploaded file.
//
// Documents live inside `client.clientDetails.attachments[]` as objects. An
// HTML-backed generated document carries { fileType:'text/html', html, dataUrl }
// so the existing preview components can render it in an iframe and download it.

import { updateClient } from '../services/db';
import { getCurrentUser } from './auth';

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
  ${extraCss}
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
</style></head>
<body>${innerHtml}</body></html>`;

// Print-safety CSS forced into a document at print time, regardless of what
// CSS its stored `html` already carries. Documents saved before this fix
// existed have NO print CSS baked in at all, so without this injection their
// backgrounds (letterhead gradient, colored badge fills) print as blank
// white — since browsers strip background colors by default when printing —
// leaving white-on-white/near-invisible text. Injecting it here fixes every
// saved document retroactively, old and new, without touching stored data.
const PRINT_SAFETY_CSS = `
  @media print {
    @page { margin: 6mm; size: A4; }
    html, body { background: #ffffff !important; }
    /* @page margin support is inconsistent across print engines — body
       padding is the reliable fallback so pages never end up flush edge-
       to-edge even where @page is ignored. Overrides any padding:0 the
       stored HTML's own print block may have set (this rule is injected
       after it, so it wins at equal specificity). */
    body { padding: 10mm 8mm !important; }
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
    }
  }
`;

// Injects PRINT_SAFETY_CSS into a saved document's raw HTML, regardless of
// whether that HTML already carries print CSS of its own.
export const patchHtmlForPrint = (html) => {
  if (!html) return html;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `<style>${PRINT_SAFETY_CSS}</style></head>`)
    : `<style>${PRINT_SAFETY_CSS}</style>${html}`;
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
export const saveGeneratedDocument = async (client, { kind, label, html }) => {
  if (!client?.id) throw new Error('This document is not linked to a saved client, so it cannot be saved.');
  const name = buildDocName(kind, client.name);
  const attachment = {
    id: 'doc-' + Date.now(),
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
