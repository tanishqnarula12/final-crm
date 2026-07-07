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
</style></head>
<body>${innerHtml}</body></html>`;

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
