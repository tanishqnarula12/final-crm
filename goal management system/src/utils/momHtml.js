// Builds the same polished, letterhead-branded MOM document HTML that
// MomWorkspace's live editor produces (getMomHtml()), but from a SAVED
// Mom database record instead of live component state — so a MOM viewed
// from Client Profile's document list looks and prints identically to one
// viewed from the Documents module, instead of falling back to the plain,
// unstyled MomDoc table-of-facts rendering.
import { LOGO_BASE64 } from './branding';

const investmentIcons = {
  mf: '📈', term: '🛡️', medical: '🏥', accidental: '🚑', estate: '📜', fd: '🏦', stocks: '📊', realestate: '🏢'
};

const goalIcons = {
  'Retirement':          '🪑',
  "Kid's Education":     '🎓',
  "Kid's Marriage":      '💍',
  'Dream Home':          '🏠',
  'Dream Car':           '🚗',
  'Emergency Fund':      '🆘',
  'Vacation / Travel':   '✈️',
  'Tax Saving':          '🧾',
  'Higher Education':    '📚',
  'Wedding Planning':    '💒',
};

export const buildMomHtml = (mom, client) => {
  const d = mom?.data || {};
  const meetingNumberRaw = mom?.meetingNumber || d.meetingNumber || '';
  const meetingNumberFormatted = meetingNumberRaw ? 'MOM - ' + meetingNumberRaw : '';
  const profileClientName = client?.name || '—';

  const clientOccupation = d.occupation || '';
  const clientIncome = d.income || '';
  const clientExpenses = d.expenses || '';
  const clientMaritalStatus = d.maritalStatus || '';
  const clientSpouseName = d.spouseName || '';
  const kidsData = d.kids || [];
  const advisor = d.advisorName || '—';
  const date = mom?.meetingDate || d.meetingDate || '';
  const mode = d.meetingMode || '—';
  const investments = d.investments || {};
  const mf = investments.mf;
  const term = investments.term;
  const medical = investments.medical;
  const accidental = investments.accidental;
  const estate = investments.estate;
  const fd = investments.fd;
  const stocks = investments.stocks;
  const realestate = investments.realestate;

  const goalDetails = (d.goals || []).map(g => {
    const target = parseFloat(g.target) || 0;
    const accumulated = parseFloat(g.accumulated) || 0;
    const pct = target > 0 ? Math.min(100, Math.round((accumulated / target) * 100)) : null;
    return { name: g.name, target, accumulated, pct };
  });

  const lastDate = d.lastMeetingDate || '';
  const agenda = d.agenda || [];
  const followupReq = d.followupRequired || '';
  const showFollowupInDraftValue = d.showFollowupInDraft || 'Yes';
  const followupDateValue = d.followupDate || '';
  const followupPurposeValue = d.followupPurpose || '';
  const followupNotesValue = d.followupNotes || '';

  const prevOurRecsFiltered = (d.prevOurRecs || []).filter(r => r.text);
  const prevClientRecsFiltered = (d.prevClientRecs || []).filter(r => r.text);
  const discussionFiltered = (d.discussion || []).filter(Boolean);
  const ourRecsFiltered = (d.ourRecs || []).filter(r => r.text);
  const clientRecsFiltered = (d.clientRecs || []).filter(r => r.text);

  const formatDate = v => {
    if (!v) return '—';
    const parts = v.split('-');
    if (parts.length < 3) return '—';
    const [y, m, day] = parts;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
  };

  const badgeColor = s => s === 'Executed' ? '#1044a3' : s === 'Pending' ? '#b8860b' : '#991b1b';
  const badgeBg = s => s === 'Executed' ? '#e6f4ea' : s === 'Pending' ? '#fdf8ec' : '#f4e6e6';
  const decIcon = v => v === 'Agreed' || v === 'Executed' ? '✅' : v === 'Not Agreed' || v === 'Dropped' ? '❌' : v === 'Thinking' ? '🤔' : v === 'Pending' ? '⏳' : '—';

  return `
  <div style="font-family:'DM Sans',sans-serif;max-width:800px;margin:0 auto;text-align:left;color:#0f1f3d;">
    <!-- Letterhead -->
    <div style="background:linear-gradient(135deg,#0f1f3d 0%,#1044a3 100%);color:white;padding:30px 32px;border-radius:10px;margin-bottom:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${LOGO_BASE64}" style="width:44px;height:44px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,0.15);padding:3px;" />
          <div>
            <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.6;margin-bottom:3px;">Team Fintness</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Minutes of Meeting</div>
            <div style="font-size:11px;opacity:0.5;letter-spacing:1px;margin-top:2px;">Let's Build a Fitter Financial Future Together</div>
          </div>
        </div>
        <div style="text-align:right;">
          ${meetingNumberFormatted ? `<div style="font-size:11px;opacity:0.55;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px;">${meetingNumberFormatted}</div>` : ''}
          <div style="font-size:20px;font-weight:700;color:#bfd4ff;">${formatDate(date)}</div>
          <div style="font-size:12px;opacity:0.6;margin-top:2px;">${mode !== '—' ? 'Mode of Meeting: ' + mode : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:30px;margin-top:22px;flex-wrap:wrap;">
        <div><div style="font-size:10px;opacity:0.5;letter-spacing:1px;text-transform:uppercase;">Financial Consultant</div><div style="font-size:15px;font-weight:600;margin-top:2px;">${advisor}</div></div>
        ${agenda.length ? `<div><div style="font-size:10px;opacity:0.5;letter-spacing:1px;text-transform:uppercase;">Purpose</div><div style="font-size:13px;font-weight:600;margin-top:2px;">${agenda.join(' · ')}</div></div>` : ''}
      </div>
    </div>

    <!-- Client Profile -->
    ${(profileClientName || clientOccupation || clientIncome || clientExpenses || clientMaritalStatus) ? `
    <div style="background:white;border:1px solid #d0daea;border-radius:10px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#6b84a8;margin-bottom:14px;">🧑 Client Profile</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:${(clientMaritalStatus === 'Married' && (clientSpouseName || kidsData.length)) ? '16px' : '0'};">
        ${profileClientName ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Client</div><div style="font-size:13px;font-weight:600;color:#0f1f3d;margin-top:3px;">${profileClientName}</div></div>` : ''}
        ${clientMaritalStatus ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Marital Status</div><div style="font-size:13px;font-weight:600;color:#0f1f3d;margin-top:3px;">${clientMaritalStatus === 'Married' ? '💍 Married' : '🙋 Single'}</div></div>` : ''}
        ${clientOccupation ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Occupation</div><div style="font-size:13px;font-weight:600;color:#0f1f3d;margin-top:3px;">${clientOccupation}</div></div>` : ''}
        ${clientIncome ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Annual Income</div><div style="font-size:13px;font-weight:600;color:#0f1f3d;margin-top:3px;">₹${Number(clientIncome).toLocaleString('en-IN')}</div></div>` : ''}
        ${clientExpenses ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Annual Expenses</div><div style="font-size:13px;font-weight:600;color:#0f1f3d;margin-top:3px;">₹${Number(clientExpenses).toLocaleString('en-IN')}</div></div>` : ''}
      </div>
      ${clientMaritalStatus === 'Married' && (clientSpouseName || kidsData.length) ? `
      <div style="border-top:1px solid #e8f0fd;padding-top:14px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;">
        ${clientSpouseName ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Spouse</div><div style="font-size:13px;font-weight:600;color:#0f1f3d;margin-top:3px;">👫 ${clientSpouseName}</div></div>` : ''}
        ${kidsData.length ? `<div><div style="font-size:10px;color:#6b84a8;text-transform:uppercase;letter-spacing:1px;">Children</div><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">${kidsData.map(k => `<span style="background:#e8f0fd;color:#1044a3;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;">👶 ${k.name}${k.age ? ' ('+k.age+'y)' : ''}</span>`).join('')}</div></div>` : ''}
      </div>` : ''}
    </div>` : ''}

    <!-- Investment, Insurance & Estate Planning Checklist -->
    <div style="background:white;border:1px solid #e2e0d8;border-radius:10px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#7a7a9a;margin-bottom:14px;">Investment, Insurance & Estate Planning Checklist</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${[['Mutual Funds', mf],['Term Insurance', term],['Medical Insurance', medical],['Accidental Insurance', accidental],['Will & Estate Planning', estate],['Fixed Deposit', fd],['Stocks', stocks],['Real Estate', realestate]].map(([label, val]) => {
          const icon = investmentIcons[label] || '📋';
          const hasYes = val === 'Yes';
          const hasNo  = val === 'No';
          const dotColor = hasYes ? '#1044a3' : hasNo ? '#c0392b' : '#aaa';
          const bdColor  = hasYes ? '#b0c4de' : hasNo ? '#f5c6c2' : '#ddd';
          const bgColor  = hasYes ? '#f4f7fd' : hasNo ? '#fdf0ef' : '#f9f9f9';
          return `
          <div style="display:inline-flex;align-items:center;gap:8px;border:1.5px solid ${bdColor};border-radius:99px;padding:7px 16px;background:${bgColor};">
            <span style="font-size:16px;line-height:1;">${icon}</span>
            <span style="font-size:13px;font-weight:500;color:#1e3a5f;">${label}</span>
            <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};margin-left:2px;"></div>
            <span style="font-size:11px;font-weight:700;color:${dotColor};">${val || 'N/A'}</span>
          </div>`;
        }).join('')}
      </div>
      ${goalDetails.length ? `<div style="margin-top:16px;">
        <div style="font-size:11px;font-weight:600;color:#7a7a9a;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Active Goals & Progress</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">
          ${goalDetails.map(g => {
            const pct = g.pct !== null ? g.pct : null;
            const barColor = pct >= 75 ? '#2d9e4f' : pct >= 40 ? '#1044a3' : '#e05c1a';
            const fmt = v => v > 0 ? '₹' + Number(v).toLocaleString('en-IN') : '—';
            const gIcon = goalIcons[g.name] || '🎯';
            return `<div style="border:1px solid #d0daea;border-radius:10px;padding:14px;background:white;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="font-size:24px;line-height:1;">${gIcon}</span>
                <div style="font-weight:600;font-size:13px;color:#0f1f3d;">${g.name}</div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b84a8;margin-bottom:4px;">
                <span style="white-space:nowrap;">Target: <strong style="color:#0f1f3d">${fmt(g.target)}</strong></span>
                <span style="white-space:nowrap;">Accumulated: <strong style="color:#0f1f3d">${fmt(g.accumulated)}</strong></span>
              </div>
              ${pct !== null ? `
              <div style="background:#d0daea;height:6px;border-radius:99px;overflow:hidden;margin-bottom:4px;">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:99px;"></div>
              </div>
              <div style="font-size:11px;font-weight:700;color:${barColor};text-align:right;">${pct}% complete</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    </div>

    <!-- Previous Meeting Review -->
    ${(prevOurRecsFiltered.length || prevClientRecsFiltered.length || lastDate) ? `
    <div style="background:white;border:1px solid #d0daea;border-radius:10px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#6b84a8;margin-bottom:14px;">To Do List from Previous Meeting</div>
      ${lastDate ? `<div style="background:#f8f7f4;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap;">
        <div><span style="font-size:10px;color:#7a7a9a;text-transform:uppercase;letter-spacing:1px;">Last Meeting</span><div style="font-size:13px;font-weight:600;margin-top:2px;">${formatDate(lastDate)}</div></div>
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="background:#e8f0fd;border-left:3px solid #1044a3;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1044a3;">🏢 Our End</div>
          ${prevOurRecsFiltered.length ? prevOurRecsFiltered.map((r, i) => `
            <div style="border:1px solid #d0daea;border-radius:7px;padding:11px 13px;margin-bottom:8px;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#1044a3;color:white;font-size:11px;font-weight:700;display:grid;place-items:center;flex-shrink:0;">${i+1}</div>
                <div>
                  <div style="font-size:13px;color:#0f1f3d;font-weight:500;line-height:1.4;">${r.text}</div>
                  ${r.status ? `<div style="margin-top:6px;"><span style="background:${badgeBg(r.status)};color:${badgeColor(r.status)};font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;">${decIcon(r.status)} ${r.status}</span></div>` : ''}
                </div>
              </div>
            </div>
          `).join('') : '<div style="font-size:11px;color:#6b84a8;">No actions</div>'}
        </div>
        <div>
          <div style="background:#fef6e4;border-left:3px solid #c47c05;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#c47c05;">👤 Client End</div>
          ${prevClientRecsFiltered.length ? prevClientRecsFiltered.map((r, i) => `
            <div style="border:1px solid #e2e0d8;border-radius:7px;padding:11px 13px;margin-bottom:8px;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#c47c05;color:white;font-size:11px;font-weight:700;display:grid;place-items:center;flex-shrink:0;">${i+1}</div>
                <div>
                  <div style="font-size:13px;color:#0f1f3d;font-weight:500;line-height:1.4;">${r.text}</div>
                  ${r.status ? `<div style="margin-top:6px;"><span style="background:${badgeBg(r.status)};color:${badgeColor(r.status)};font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;">${decIcon(r.status)} ${r.status}</span></div>` : ''}
                </div>
              </div>
            </div>
          `).join('') : '<div style="font-size:11px;color:#6b84a8;">No actions</div>'}
        </div>
      </div>
    </div>` : ''}

    <!-- To Do List Two-Column -->
    ${(ourRecsFiltered.length || clientRecsFiltered.length) ? `
    <div style="background:white;border:1px solid #d0daea;border-radius:10px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#6b84a8;margin-bottom:16px;">To Do List from Current Meeting</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="background:#e8f0fd;border-left:3px solid #1044a3;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1044a3;">🏢 Our End</div>
          ${ourRecsFiltered.length ? ourRecsFiltered.map((r, i) => `
            <div style="border:1px solid #d0daea;border-radius:7px;padding:11px 13px;margin-bottom:8px;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#1044a3;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:500;color:#0f1f3d;margin-bottom:6px;">${r.text}</div>
                  ${r.dec ? `<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;background:${r.dec==='Agreed'?'#e8f0fd':r.dec==='Not Agreed'?'#fdf0ef':'#fdf8ec'};color:${r.dec==='Agreed'?'#1044a3':r.dec==='Not Agreed'?'#991b1b':'#b8860b'};">${decIcon(r.dec)} ${r.dec}</span>` : ''}
                </div>
              </div>
            </div>`).join('') : '<div style="color:#6b84a8;font-size:11px;padding:8px;">No actions added.</div>'}
        </div>
        <div>
          <div style="background:#fef6e4;border-left:3px solid #c47c05;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#c47c05;">👤 Client End</div>
          ${clientRecsFiltered.length ? clientRecsFiltered.map((r, i) => `
            <div style="border:1px solid #d0daea;border-radius:7px;padding:11px 13px;margin-bottom:8px;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#c47c05;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:500;color:#0f1f3d;margin-bottom:6px;">${r.text}</div>
                  ${r.dec ? `<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;background:${r.dec==='Agreed'?'#e8f0fd':r.dec==='Not Agreed'?'#fdf0ef':'#fdf8ec'};color:${r.dec==='Agreed'?'#1044a3':r.dec==='Not Agreed'?'#991b1b':'#b8860b'};">${decIcon(r.dec)} ${r.dec}</span>` : ''}
                </div>
              </div>
            </div>`).join('') : '<div style="color:#6b84a8;font-size:11px;padding:8px;">No actions added.</div>'}
        </div>
      </div>
    </div>` : ''}

    <!-- Discussion Summary -->
    ${discussionFiltered.length ? `
    <div style="background:white;border:1px solid #e2e0d8;border-radius:10px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#7a7a9a;margin-bottom:14px;">Discussion Summary</div>
      <ul style="list-style:none;padding:0;">
        ${discussionFiltered.map(dItem => `
          <li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:9px;padding-bottom:9px;border-bottom:1px solid #f0ede8;">
            <div style="width:7px;height:7px;border-radius:50%;background:#1a5fd4;margin-top:6px;flex-shrink:0;"></div>
            <span style="font-size:13px;color:#1a1a2e;overflow-wrap:anywhere;white-space:pre-wrap;">${dItem}</span>
          </li>
        `).join('')}
      </ul>
    </div>` : ''}

    <!-- Follow-up -->
    ${showFollowupInDraftValue !== 'No' ? followupReq === 'Yes' ? `
    <div style="background:linear-gradient(to right,#e8f0fd,white);border:1.5px solid #1a5fd4;border-radius:10px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#1a5fd4;margin-bottom:10px;">Next Follow-up Scheduled</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div><div style="font-size:10px;color:#7a7a9a;text-transform:uppercase;letter-spacing:1px;">Date</div><div style="font-size:13px;font-weight:700;color:#2d5016;margin-top:2px;">${formatDate(followupDateValue)}</div></div>
        ${followupPurposeValue ? `<div><div style="font-size:10px;color:#7a7a9a;text-transform:uppercase;letter-spacing:1px;">Purpose</div><div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:2px;">${followupPurposeValue}</div></div>` : ''}
      </div>
      ${followupNotesValue ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #c8e0b0;font-size:13px;color:#3d3d5c;white-space:pre-wrap;text-align:left;">${followupNotesValue}</div>` : ''}
    </div>` : `
    <div style="background:#f8f7f4;border:1px solid #e2e0d8;border-radius:8px;padding:14px 20px;margin-bottom:18px;color:#7a7a9a;font-size:13px;">
      No follow-up scheduled at this time.
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding:20px;color:#aaa;font-size:11px;letter-spacing:0.5px;">
      <div style="margin-bottom:12px;font-size:11px;line-height:1.4;color:#888;">These Minutes of Meeting have been prepared based on our discussions and summarize the key points and agreed action items. If you have any questions or require any clarification, please feel free to contact our team.</div>
      Document generated on ${formatDate(new Date().toISOString().split('T')[0])} · Team Fintness · Confidential
    </div>
  </div>
  `;
};
