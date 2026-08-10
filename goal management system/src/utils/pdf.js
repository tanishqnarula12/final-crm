import { buildProjection } from './calc';
import logoUrl from '../assets/logo.png';

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const pdfINR = (n) => {
  if (!isFinite(n) || n === null || n === undefined) return 'Rs. 0';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
};
const pdfSip = (n) => isFinite(n) ? `Rs. ${Math.round(Number(n)).toLocaleString('en-IN')}` : 'Rs. 0';

// Production serves the app's CSS as an external <link>, not inlined <style>
// tags — so pointing the print window at that same <link href> makes it
// depend on a fresh network fetch completing before anything renders
// correctly. That fetch racing win.onload/the print timeout is exactly what
// produced a flash of totally unstyled content (plain black text, no cards,
// no colors) before the CSS caught up. Fetching each stylesheet's text here
// (in the already-loaded main tab, so it's an instant cache hit) and
// embedding it as an inline <style> block instead means the popup has every
// rule available the instant its HTML is written — no network round trip,
// no race, no flash.
async function inlineStylesheets() {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const parts = await Promise.all(links.map(async (l) => {
    try {
      const res = await fetch(l.href);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      return `<style>${text}</style>`;
    } catch {
      // Cross-origin (e.g. Google Fonts) or network failure — fall back to
      // the link itself rather than dropping the stylesheet entirely.
      return `<link rel="stylesheet" href="${l.href}">`;
    }
  }));
  return parts.join('\n');
}

function buildGoalProjectionHTML(g) {
  const projection = buildProjection(g);
  if (!projection.length) return '';

  const rows = projection.map((r, ri) => `
    <tr style="background:${ri % 2 === 0 ? '#ffffff' : '#f8fafc'}">
      <td style="padding:4px 8px;text-align:center;font-weight:bold;font-size:8pt;border-bottom:1px solid #f1f5f9">${
        r.label
      }${r.isPartial ? ' <span style="font-weight:normal;color:#64748b">(part)</span>' : ''}</td>
      <td style="padding:4px 8px;text-align:right;font-size:8pt;border-bottom:1px solid #f1f5f9">${pdfINR(r.openingBal)}</td>
      <td style="padding:4px 8px;text-align:right;font-size:8pt;border-bottom:1px solid #f1f5f9">${pdfSip(r.monthlySip)}</td>
      <td style="padding:4px 8px;text-align:right;font-size:8pt;border-bottom:1px solid #f1f5f9">${pdfINR(r.yearContribution)}</td>
      <td style="padding:4px 8px;text-align:right;font-size:8pt;color:#059669;border-bottom:1px solid #f1f5f9">${pdfINR(r.growth)}</td>
      <td style="padding:4px 8px;text-align:center;font-size:8pt;font-weight:bold;border-bottom:1px solid #f1f5f9">${pdfINR(r.closingBal)}</td>
    </tr>`).join('');

  return `<div style="margin-top:10px;padding:12px 14px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;break-inside:avoid;page-break-inside:avoid">
    <div style="font-size:9pt;font-weight:bold;margin-bottom:8px;font-family:Arial,sans-serif;color:#0f172a">Year-by-year Projection</div>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
      <thead>
        <tr style="background:#1e3a8a;color:white">
          <th style="padding:5px 8px;text-align:center;font-size:7.5pt;font-weight:bold">Period</th>
          <th style="padding:5px 8px;text-align:right;font-size:7.5pt;font-weight:bold">Opening</th>
          <th style="padding:5px 8px;text-align:right;font-size:7.5pt;font-weight:bold">Monthly SIP</th>
          <th style="padding:5px 8px;text-align:right;font-size:7.5pt;font-weight:bold">Contribution</th>
          <th style="padding:5px 8px;text-align:right;font-size:7.5pt;font-weight:bold">Growth</th>
          <th style="padding:5px 8px;text-align:center;font-size:7.5pt;font-weight:bold">Closing</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export async function exportClientPdf(containerEl, client, includeProjection = true) {
  if (!containerEl) {
    alert('Could not find print content. Please try again.');
    return;
  }

  const styleTags = Array.from(document.querySelectorAll('style'))
    .map(s => `<style>${s.textContent}</style>`)
    .join('\n');
  const linkTags = await inlineStylesheets();

  const clone = containerEl.cloneNode(true);

  // Remove all buttons (back, edit, export, delete icons)
  clone.querySelectorAll('button').forEach(el => el.remove());

  // Keep "Goals Summary" heading glued to the cards below it
  clone.querySelectorAll('h3').forEach(el => {
    if (el.textContent.includes('Goals Summary')) {
      el.style.breakAfter = 'avoid';
      el.style.pageBreakAfter = 'avoid';
      if (el.parentElement) {
        el.parentElement.style.breakAfter = 'avoid';
        el.parentElement.style.pageBreakAfter = 'avoid';
      }
    }

    // Planning Assumptions always starts on a fresh page
    if (el.textContent.trim().includes('Planning Assumptions')) {
      let node = el.parentElement;
      while (node) {
        if (typeof node.className === 'string' && node.className.includes('mt-6')) {
          node.style.breakBefore = 'page';
          node.style.pageBreakBefore = 'always';
          break;
        }
        node = node.parentElement;
      }
    }
  });

  // Strip animation classes so nothing is invisible on load
  // SVG elements (Lucide icons) have SVGAnimatedString className — skip those
  clone.querySelectorAll('[class]').forEach(el => {
    if (typeof el.className !== 'string') return;
    const cls = el.className;

    el.className = cls
      .split(' ')
      .filter(c =>
        !c.startsWith('animate-') &&
        !c.startsWith('hover:scale') &&
        !c.startsWith('hover:-translate') &&
        !c.startsWith('active:scale') &&
        !c.startsWith('group-hover:opacity')
      )
      .join(' ');

    // Force responsive grids to their multi-column layout via inline style —
    // CSS class selectors can't reliably override Tailwind v4 @layer rules in print.
    if (cls.includes('grid')) {
      if (cls.includes('md:grid-cols-3') || cls.includes('lg:grid-cols-3')) {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      } else if (cls.includes('md:grid-cols-2') || cls.includes('lg:grid-cols-2')) {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      } else if (cls.includes('md:grid-cols-4') || cls.includes('lg:grid-cols-4')) {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
      }
    }

    // Apply break-inside: avoid ONLY to small tile elements (p-5 SIP tiles, p-3 KV boxes),
    // NOT to large wrapper cards (p-6 rounded-2xl) which cause blank pages when avoided.
    if (cls.includes('rounded-2xl') && (cls.includes(' p-5') || cls.includes(' p-3'))) {
      el.style.breakInside = 'avoid';
      el.style.pageBreakInside = 'avoid';
    }
    // Goal cards have rounded-[ (e.g. rounded-[28px]) — always avoid breaks on these
    if (cls.includes('rounded-[')) {
      el.style.breakInside = 'avoid';
      el.style.pageBreakInside = 'avoid';
    }
  });

  // Sort goals by target date ascending (nearest first) — same order as the screen
  const sortedGoals = [...(client.goals || [])].sort((a, b) =>
    (a.targetYear * 12 + (a.targetMonth || 1)) - (b.targetYear * 12 + (b.targetMonth || 1))
  );

  // When projections are on: inject table directly after each goal card,
  // then force the goals grid to single column so they flow naturally.
  if (includeProjection && sortedGoals.length > 0) {
    const goalsGrid = clone.querySelector('[class*="lg:grid-cols-2"]');
    if (goalsGrid) {
      const goalCards = Array.from(goalsGrid.children);
      goalCards.forEach((cardEl, i) => {
        if (i >= sortedGoals.length) return;
        const projHtml = buildGoalProjectionHTML(sortedGoals[i]);
        if (projHtml) cardEl.insertAdjacentHTML('afterend', projHtml);
      });
      goalsGrid.style.gridTemplateColumns = '1fr';
    }
  }

  // Convert logo to base64 so it embeds correctly in the about:blank print window
  const logoDataUrl = await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = logoUrl;
  });

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html class="${document.documentElement.className}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280">
  <title>${escHtml(client.name)} – Goal Report</title>
  ${linkTags}
  ${styleTags}
  <style>
    @page { size: A4 landscape; margin: 10mm 12mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    button { display: none !important; }
    .animate-fade-in,
    .animate-scale-up,
    .animate-slide-up { animation: none !important; opacity: 1 !important; transform: none !important; }

    /* Grid columns and break-inside are set via inline styles on the cloned DOM
       elements above — inline styles beat all CSS cascade / @layer ordering. */

    .print-header {
      background: #1e3a8a;
      color: white;
      padding: 14px 20px;
      border-bottom: 4px solid #3b82f6;
      border-radius: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .print-footer {
      margin-top: 28px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
      font-family: Arial, sans-serif;
    }
  </style>
</head>
<body class="${document.body.className}" style="padding:16px;background:white;max-width:100%;margin:0;">
  <div class="print-header">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:44px;width:44px;object-fit:contain;border-radius:10px;background:white;padding:3px;" />` : ''}
      <div>
        <div style="font-size:16pt;font-weight:bold;">Team Fintness</div>
        <div style="font-size:8pt;color:#bae0ff;margin-top:2px;">Building fitter financial futures</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10pt;font-weight:bold;">GOAL REPORT</div>
      <div style="font-size:8pt;color:#bae0ff;margin-top:2px;">Generated ${dateStr}</div>
    </div>
  </div>
  ${clone.outerHTML}
  <div class="print-footer">
    <span>Generated by Team Fintness Customer Relationship Management System</span>
    <span>Confidential — For client use only</span>
  </div>
</body>
</html>`;

  // Open at 1280px so lg: breakpoints (≥1024px) fire correctly
  const win = window.open('', '_blank', 'width=1280,height=900');
  if (!win) {
    alert('Please allow pop-ups to export the report.');
    return;
  }

  win.document.write(html);
  win.document.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
  };
  win.onload = doPrint;
  setTimeout(doPrint, 1500);
}

// Same DOM-clone-and-print approach as exportClientPdf above (button
// stripping, animation-class stripping, forcing responsive grids to their
// desktop column count via inline style so Tailwind's @layer breakpoints
// aren't lost in the print window) — kept as its own function rather than
// sharing code with exportClientPdf so the goal-report-specific logic there
// (projection table injection, Goals Summary/Planning Assumptions page-break
// handling) can't accidentally affect this, and vice versa.
export async function exportAssetAllocationPdf(containerEl, client) {
  if (!containerEl) {
    alert('Could not find print content. Please try again.');
    return;
  }

  const styleTags = Array.from(document.querySelectorAll('style'))
    .map(s => `<style>${s.textContent}</style>`)
    .join('\n');
  const linkTags = await inlineStylesheets();

  const clone = containerEl.cloneNode(true);

  // Remove all buttons (edit, back, export icons)
  clone.querySelectorAll('button').forEach(el => el.remove());

  // Edit History is operational/internal — not something a client needs to
  // see in their report. Remark stays (it's client-facing commentary).
  clone.querySelectorAll('h3').forEach(el => {
    if (el.textContent.includes('Edit History')) {
      const wrapper = el.closest('.space-y-3') || el.parentElement;
      if (wrapper) wrapper.remove();
    }
  });

  // Keep the Net Worth Composition heading glued to its donut chart — without
  // this, a page break could fall between the two (heading stranded alone at
  // the bottom of one page, chart pushed to the top of the next).
  clone.querySelectorAll('h3').forEach(el => {
    if (el.textContent.includes('Net Worth Composition')) {
      const section = el.closest('section');
      if (section) {
        section.style.breakInside = 'avoid';
        section.style.pageBreakInside = 'avoid';
      }
    }
  });

  // Strip animation classes so nothing is invisible on load
  // SVG elements (Lucide icons) have SVGAnimatedString className — skip those
  clone.querySelectorAll('[class]').forEach(el => {
    if (typeof el.className !== 'string') return;
    const cls = el.className;

    el.className = cls
      .split(' ')
      .filter(c =>
        !c.startsWith('animate-') &&
        !c.startsWith('hover:scale') &&
        !c.startsWith('hover:-translate') &&
        !c.startsWith('active:scale') &&
        !c.startsWith('group-hover:opacity')
      )
      .join(' ');

    // Force responsive grids to their multi-column layout via inline style —
    // CSS class selectors can't reliably override Tailwind v4 @layer rules in print.
    if (cls.includes('grid')) {
      if (cls.includes('md:grid-cols-3') || cls.includes('lg:grid-cols-3')) {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      } else if (cls.includes('md:grid-cols-2') || cls.includes('lg:grid-cols-2')) {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      } else if (cls.includes('md:grid-cols-4') || cls.includes('lg:grid-cols-4')) {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
      }
    }

    // Avoid breaking small tiles/cards across a page — same rule as the goal
    // report, so composition cards and net-worth tiles don't get sliced.
    if (cls.includes('rounded-2xl') && (cls.includes(' p-5') || cls.includes(' p-3') || cls.includes(' p-6'))) {
      el.style.breakInside = 'avoid';
      el.style.pageBreakInside = 'avoid';
    }
  });

  // Convert logo to base64 so it embeds correctly in the about:blank print window
  const logoDataUrl = await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = logoUrl;
  });

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html class="${document.documentElement.className}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280">
  <title>${escHtml(client.name)} – Asset Allocation Report</title>
  ${linkTags}
  ${styleTags}
  <style>
    @page { size: A4 landscape; margin: 10mm 12mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    button { display: none !important; }
    .animate-fade-in,
    .animate-scale-up,
    .animate-slide-up { animation: none !important; opacity: 1 !important; transform: none !important; }

    .print-header {
      background: #1e3a8a;
      color: white;
      padding: 14px 20px;
      border-bottom: 4px solid #3b82f6;
      border-radius: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .print-footer {
      margin-top: 28px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
      font-family: Arial, sans-serif;
    }
  </style>
</head>
<body class="${document.body.className}" style="padding:16px;background:white;max-width:100%;margin:0;">
  <div class="print-header">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:44px;width:44px;object-fit:contain;border-radius:10px;background:white;padding:3px;" />` : ''}
      <div>
        <div style="font-size:16pt;font-weight:bold;">Team Fintness</div>
        <div style="font-size:8pt;color:#bae0ff;margin-top:2px;">Building fitter financial futures</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10pt;font-weight:bold;">ASSET ALLOCATION REPORT</div>
      <div style="font-size:8pt;color:#bae0ff;margin-top:2px;">Generated ${dateStr}</div>
    </div>
  </div>
  ${clone.outerHTML}
  <div class="print-footer">
    <span>Generated by Team Fintness Customer Relationship Management System</span>
    <span>Confidential — For client use only</span>
  </div>
</body>
</html>`;

  // Open at 1280px so lg: breakpoints (≥1024px) fire correctly
  const win = window.open('', '_blank', 'width=1280,height=900');
  if (!win) {
    alert('Please allow pop-ups to export the report.');
    return;
  }

  win.document.write(html);
  win.document.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
  };
  win.onload = doPrint;
  setTimeout(doPrint, 1500);
}
