// Dedicated, hand-crafted Goal Report template — deliberately NOT a clone of
// the on-screen dashboard UI (see exportClientPdf in pdf.js for that older
// approach). Cloning-and-CSS-squeezing a Tailwind dashboard onto a portrait
// page turned into an unwinnable fight (Chrome's print engine doesn't
// reliably fragment CSS Grid, external stylesheets race the print trigger,
// desktop-width spacing reads as dead space on a narrower page, and so on —
// see git history on pdf.js for the full account). This file builds fully
// self-contained, inline-styled HTML sized for an A4 portrait page from the
// start, with EXPLICIT page breaks computed here in JS rather than left to
// the browser to figure out — the same architecture already proven out for
// the MOM document (see momHtml.js). No Tailwind, no DOM cloning, no guessing.
import { calcGoal, currentRecordedCorpus, fmtINR, fmtFull, fmtSip, goalEmoji, monthLabel, goalCreatedLabel, needsKidName, generateAssumptionsText } from './calc';
import { LOGO_BASE64 } from './branding';

// A4 portrait, 14mm/16mm margins -> usable width ≈ 178mm ≈ 673px, usable
// height ≈ 269mm ≈ 1016px at 96 CSS px/inch. PAGE_W is what every page's
// content is designed to. Pages deliberately do NOT force a fixed/min
// height with the footer pinned to the bottom — a short page (the
// overview, a single-goal detail page) would then show a large dead gap
// before the footer, which is exactly the "too much empty space" complaint
// this template exists to avoid. Each page is only as tall as its own
// content; break-after:page below is what actually enforces pagination.
const PAGE_W = 660;

const achievementHex = (pct) => pct >= 99.95 ? '#16a34a' : pct >= 60 ? '#ca8a04' : pct >= 30 ? '#ea580c' : '#dc2626';
const achievementBg = (pct) => pct >= 99.95 ? '#f0fdf4' : pct >= 60 ? '#fefce8' : pct >= 30 ? '#fff7ed' : '#fef2f2';

// Same category -> palette mapping as ClientDetail.jsx's getGoalTheme, as
// hex values instead of Tailwind classes (this template has no Tailwind).
const goalTheme = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('freedom') || n.includes('wealth') || n.includes('creation') || n.includes('saving') || n.includes('fund')) {
    return { bg: '#eef2ff', border: '#c7d2fe', text: '#312e81', accent: '#4f46e5' };
  }
  if (n.includes('education') || n.includes('kids') || n.includes('marriage') || n.includes('gift') || n.includes('wedding')) {
    return { bg: '#ecfdf5', border: '#a7f3d0', text: '#064e3b', accent: '#059669' };
  }
  if (n.includes('home') || n.includes('car') || n.includes('dream') || n.includes('house') || n.includes('vacation') || n.includes('plane') || n.includes('travel')) {
    return { bg: '#fffbeb', border: '#fde68a', text: '#78350f', accent: '#d97706' };
  }
  if (n.includes('emergency') || n.includes('shield') || n.includes('crisis') || n.includes('medical') || n.includes('health')) {
    return { bg: '#fff1f2', border: '#fecdd3', text: '#881337', accent: '#e11d48' };
  }
  return { bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a', accent: '#475569' };
};

// Mirrors ClientDetail.jsx's getQualitativeNotes — extracts just the
// advisor's own free-typed observations, stripping the auto-generated
// quantitative block that's always prefixed onto client.assumptions.
const getQualitativeNotes = (text, client) => {
  if (!text) return '';
  const fresh = generateAssumptionsText(client);
  if (text.trim() === fresh.trim()) return '';
  let cleaned = text.replace(fresh, '').trim();
  if (cleaned.includes('Inflation rate:') || cleaned.includes('Expected return:') || cleaned.includes('SIP step-up rate:')) {
    cleaned = cleaned.split('\n')
      .filter(line => {
        const l = line.trim();
        return !l.startsWith('•') && !l.startsWith('*') && !l.startsWith('-') &&
          !l.startsWith('Inflation rate') && !l.startsWith('Expected return') && !l.startsWith('SIP step-up rate');
      })
      .join('\n')
      .trim();
  }
  return cleaned;
};

function letterheadHtml(dateStr) {
  return `
  <div style="background:linear-gradient(135deg,#0f1f3d 0%,#1044a3 100%);color:white;padding:18px 24px;border-radius:12px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="${LOGO_BASE64}" style="width:36px;height:36px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,0.15);padding:3px;" />
      <div>
        <div style="font-size:13px;font-weight:700;">Team Fintness</div>
        <div style="font-size:9px;opacity:0.6;letter-spacing:0.5px;margin-top:1px;">Building fitter financial futures</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;opacity:0.7;">GOAL REPORT</div>
      <div style="font-size:9px;opacity:0.55;margin-top:1px;">${dateStr}</div>
    </div>
  </div>`;
}

function footerHtml(pageNum, totalPages) {
  return `
  <div style="margin-top:26px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8;">
    <span>Generated by Team Fintness Customer Relationship Management System</span>
    <span>Confidential &nbsp;·&nbsp; Page ${pageNum} of ${totalPages}</span>
  </div>`;
}

function pageOpen() {
  return `<div style="width:${PAGE_W}px;margin:0 auto;break-after:page;page-break-after:always;font-family:'DM Sans',system-ui,sans-serif;color:#1e293b;">`;
}
const pageClose = () => `</div>`;

function kpiTile({ label, value, caption, accent, bg }) {
  return `
  <div style="flex:1;background:${bg};border:1px solid ${accent}22;border-radius:12px;padding:14px 16px;">
    <div style="font-size:8.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${accent};opacity:0.85;">${label}</div>
    <div style="font-size:17px;font-weight:800;color:#0f172a;margin-top:6px;letter-spacing:-0.3px;">${value}</div>
    ${caption ? `<div style="font-size:8.5px;color:#94a3b8;margin-top:3px;">${caption}</div>` : ''}
  </div>`;
}

function buildOverviewPage(client, goalsCalc, totals, dateStr, pageNum, totalPages) {
  const topByAdditional = [...goalsCalc].filter(x => x.c.additionalSip > 0).sort((a, b) => b.c.additionalSip - a.c.additionalSip);
  let focusText;
  if (topByAdditional.length === 0) {
    focusText = 'All goals are fully funded under the current assumptions — no additional monthly SIP is required.';
  } else if (topByAdditional.length === 1) {
    focusText = `The largest additional monthly requirement is currently linked to the <strong>${topByAdditional[0].goal.name}</strong> goal.`;
  } else {
    focusText = `The largest additional monthly requirement is currently linked to the <strong>${topByAdditional[0].goal.name}</strong> goal, followed by <strong>${topByAdditional[1].goal.name}</strong>.`;
  }

  const rows = goalsCalc.map(({ goal: g, c }) => `
    <tr>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;font-size:11px;">${goalEmoji(g.name)} ${g.name}${needsKidName(g.name) && g.kidName ? ` <span style="font-weight:500;color:#64748b;font-size:9.5px;">— ${g.kidName}</span>` : ''}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:10.5px;color:#475569;">${monthLabel(g.targetMonth || 1, g.targetYear)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:44px;height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden;flex-shrink:0;">
            <div style="width:${Math.min(100, c.achievementPct)}%;height:100%;background:${achievementHex(c.achievementPct)};border-radius:99px;"></div>
          </div>
          <span style="font-size:10.5px;font-weight:700;color:${achievementHex(c.achievementPct)};">${c.achievementPct.toFixed(1)}%</span>
        </div>
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:10.5px;font-weight:700;color:${c.additionalSip > 0 ? '#dc2626' : '#16a34a'};">${fmtSip(c.additionalSip)}/mo</td>
    </tr>`).join('');

  return `${pageOpen()}
    ${letterheadHtml(dateStr)}
    <div style="font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">Goal Planning Report</div>
    <div style="font-size:11px;color:#64748b;margin-top:5px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;">${client.name} &nbsp;·&nbsp; ${client.pan || '—'} &nbsp;·&nbsp; ${client.age ? client.age + ' years old' : ''}</div>

    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:22px;margin-bottom:12px;">Your financial planning at a glance</div>
    <div style="display:flex;gap:10px;">
      ${kpiTile({ label: 'Current SIP', value: fmtSip(totals.totalCurrentSip) + '/mo', caption: 'Existing monthly contribution', accent: '#1d4ed8', bg: '#eff6ff' })}
      ${kpiTile({ label: 'Additional SIP', value: fmtSip(totals.totalAdditional) + '/mo', caption: 'Additional funding required', accent: '#c2410c', bg: '#fff7ed' })}
      ${kpiTile({ label: 'Total SIP Needed', value: fmtSip(totals.totalSip) + '/mo', caption: 'Current + additional', accent: '#047857', bg: '#ecfdf5' })}
      ${kpiTile({ label: 'Lump-Sum Equivalent', value: fmtFull(totals.totalLump), caption: 'Approx. value required today', accent: '#4338ca', bg: '#eef2ff' })}
    </div>

    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:26px;margin-bottom:12px;">Goal funding status</div>
    <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#0f1f3d;">
            <th style="text-align:left;padding:10px 14px;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:white;">Goal</th>
            <th style="text-align:left;padding:10px 14px;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:white;">Target</th>
            <th style="text-align:left;padding:10px 14px;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:white;">Progress</th>
            <th style="text-align:right;padding:10px 14px;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:white;">Additional SIP</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="margin-top:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#64748b;">Planning Focus</div>
        <div style="font-size:11px;color:#334155;margin-top:5px;line-height:1.5;">${focusText}</div>
      </div>
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:22px;font-weight:800;color:#1044a3;">${goalsCalc.length}</div>
        <div style="font-size:8.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Active Goals</div>
      </div>
    </div>

    ${footerHtml(pageNum, totalPages)}
  ${pageClose()}`;
}

function goalDetailCard(g, c) {
  const theme = goalTheme(g.name);
  const stat = (label, value, color) => `
    <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;">
      <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;">${label}</div>
      <div style="font-size:12px;font-weight:700;color:${color || '#0f172a'};margin-top:3px;">${value}</div>
    </div>`;

  return `
  <div style="background:${theme.bg};border:1px solid ${theme.border};border-radius:14px;padding:18px 20px;margin-bottom:26px;break-inside:avoid;page-break-inside:avoid;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-size:15px;font-weight:800;color:${theme.text};">${goalEmoji(g.name)} ${g.name}</div>
        ${needsKidName(g.name) && g.kidName ? `<div style="font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${theme.accent};margin-top:2px;">Kid: ${g.kidName}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:9.5px;font-weight:700;color:#475569;">Target ${monthLabel(g.targetMonth || 1, g.targetYear)}${c.years > 0 ? ` · ${c.years >= 1 ? c.years.toFixed(1) + ' yrs' : c.months + ' mo'}` : ''}</div>
        <div style="font-size:8.5px;color:#94a3b8;margin-top:2px;">Created ${goalCreatedLabel(g)}</div>
      </div>
    </div>

    <div style="margin-top:14px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#64748b;">Achievement Progress</span>
        <span style="font-size:11px;font-weight:800;color:${achievementHex(c.achievementPct)};">${c.achievementPct.toFixed(1)}%</span>
      </div>
      <div style="height:8px;border-radius:99px;background:#e2e8f0;overflow:hidden;">
        <div style="width:${Math.min(100, c.achievementPct)}%;height:100%;background:${achievementHex(c.achievementPct)};border-radius:99px;"></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;">
      ${stat('Goal Cost (Today)', fmtINR(g.amount))}
      ${stat('Future Value', fmtINR(c.futureValue))}
      ${stat('Current Corpus', fmtINR(currentRecordedCorpus(g)))}
      ${stat('Current SIP', fmtSip(c.todayEffectiveSip) + '/mo')}
      ${stat('Total SIP Needed', fmtSip(c.sipRequired) + '/mo', '#1d4ed8')}
      ${stat('Additional SIP', fmtSip(c.additionalSip) + '/mo', c.additionalSip > 0 ? '#dc2626' : '#16a34a')}
    </div>

    <div style="margin-top:12px;background:${achievementBg(c.achievementPct)};border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#475569;">Lump-Sum Equivalent Required Today</span>
      <span style="font-size:13px;font-weight:800;color:${achievementHex(c.achievementPct)};">${fmtINR(c.lumpSumRequired)}</span>
    </div>
  </div>`;
}

function buildGoalDetailPage(chunk, dateStr, pageNum, totalPages, isFirstDetailPage) {
  const cards = chunk.map(({ goal: g, c }) => goalDetailCard(g, c)).join('');
  return `${pageOpen()}
    ${letterheadHtml(dateStr)}
    ${isFirstDetailPage ? `
    <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.4px;">Goal Details</div>
    <div style="font-size:10.5px;color:#64748b;margin-top:4px;margin-bottom:18px;">Each goal's funding position under the current plan assumptions</div>
    ` : `<div style="margin-bottom:10px;"></div>`}
    ${cards}
    <div style="font-size:9px;color:#94a3b8;font-style:italic;margin-top:2px;">A 100% achievement level indicates the current mapped corpus and SIP are sufficient under the report assumptions.</div>
    ${footerHtml(pageNum, totalPages)}
  ${pageClose()}`;
}

function buildFrameworkPage(client, goalsCalc, notesOnly, dateStr, pageNum, totalPages) {
  const rateRows = goalsCalc.map(({ goal: g }) => {
    const mapped = Array.isArray(g.mappedAssets) && g.mappedAssets.length > 0
      ? g.mappedAssets.map(a => `${a.label} &nbsp;•&nbsp; ${fmtINR(a.amount)}`).join(' &nbsp;|&nbsp; ')
      : '<span style="color:#94a3b8;font-style:italic;">None</span>';
    return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;font-size:10.5px;">${goalEmoji(g.name)} ${g.name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:10px;font-weight:700;color:#dc2626;">${g.inflation}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:10px;font-weight:700;color:#16a34a;">${g.expectedReturn}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:10px;font-weight:700;color:#1d4ed8;">${g.sipIncRate}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:9.5px;font-weight:600;color:#4338ca;line-height:1.6;">${mapped}</td>
    </tr>`;
  }).join('');

  const noteLines = notesOnly ? notesOnly.split('\n').map(l => l.trim()).filter(Boolean) : [];
  const observations = noteLines.map((line, i) => {
    const cleaned = line.replace(/^\d+[.)]\s*/, '');
    return `
    <div style="display:flex;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #1044a3;border-radius:8px;padding:11px 14px;margin-bottom:8px;break-inside:avoid;page-break-inside:avoid;">
      <div style="font-size:10px;font-weight:800;color:#1044a3;flex-shrink:0;">${String(i + 1).padStart(2, '0')}</div>
      <div style="font-size:10.5px;color:#334155;line-height:1.55;">${cleaned}</div>
    </div>`;
  }).join('');

  return `${pageOpen()}
    ${letterheadHtml(dateStr)}
    <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.4px;">Planning Framework</div>
    <div style="font-size:10.5px;color:#64748b;margin-top:4px;margin-bottom:18px;">Assumptions and advisor observations used in the goal mapping</div>

    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;">Quantitative assumptions</div>
    <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:22px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#0f1f3d;">
            <th style="text-align:left;padding:9px 14px;font-size:8.5px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:white;white-space:nowrap;">Goal</th>
            <th style="text-align:center;padding:9px 14px;font-size:8.5px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:white;white-space:nowrap;">Inflation</th>
            <th style="text-align:center;padding:9px 14px;font-size:8.5px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:white;white-space:nowrap;">Return</th>
            <th style="text-align:center;padding:9px 14px;font-size:8.5px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:white;white-space:nowrap;">SIP Step-up</th>
            <th style="text-align:left;padding:9px 14px;font-size:8.5px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:white;">Mapped Assets</th>
          </tr>
        </thead>
        <tbody>${rateRows}</tbody>
      </table>
    </div>

    ${observations ? `
    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;">Advisor observations</div>
    ${observations}
    ` : ''}

    <div style="font-size:8.5px;color:#94a3b8;font-style:italic;margin-top:10px;">Important: Goal projections are based on the assumptions and information available at the time of report generation. Actual outcomes may vary with market returns, inflation, and contribution changes.</div>

    ${footerHtml(pageNum, totalPages)}
  ${pageClose()}`;
}

export function buildGoalReportHtml(client) {
  const sortedGoals = [...(client.goals || [])].sort((a, b) =>
    (a.targetYear * 12 + (a.targetMonth || 1)) - (b.targetYear * 12 + (b.targetMonth || 1))
  );
  const goalsCalc = sortedGoals.map(g => ({ goal: g, c: calcGoal(g) }));

  const totals = goalsCalc.reduce((acc, { c }) => {
    acc.totalCurrentSip += c.todayEffectiveSip;
    acc.totalAdditional += c.additionalSip;
    acc.totalLump += c.lumpSumRequired;
    return acc;
  }, { totalCurrentSip: 0, totalAdditional: 0, totalLump: 0 });
  totals.totalSip = totals.totalCurrentSip + totals.totalAdditional;

  const savedText = client.assumptions;
  const displayText = (typeof savedText === 'string' && savedText.length > 0) ? savedText : generateAssumptionsText(client);
  const notesOnly = getQualitativeNotes(displayText, client);

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const detailPageCount = Math.max(1, Math.ceil(goalsCalc.length / 2));
  const totalPages = 1 + (goalsCalc.length > 0 ? detailPageCount : 0) + 1;

  let pageNum = 1;
  let html = buildOverviewPage(client, goalsCalc, totals, dateStr, pageNum++, totalPages);

  for (let i = 0; i < goalsCalc.length; i += 2) {
    html += buildGoalDetailPage(goalsCalc.slice(i, i + 2), dateStr, pageNum++, totalPages, i === 0);
  }

  html += buildFrameworkPage(client, goalsCalc, notesOnly, dateStr, pageNum++, totalPages);

  return html;
}
