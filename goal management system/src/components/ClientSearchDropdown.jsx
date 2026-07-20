// Advanced client search — as you type, matches across BOTH Group Leaders
// (the Client records themselves: name/PAN/mobile/email) AND Applicants
// (their family members: name/PAN/mobile/email), shown as two categorized,
// clickable result lists. A matched Applicant also always surfaces their
// owning Group Leader (even if the Group Leader's own info didn't match),
// so you can jump to either the specific person or the whole family.
import React from 'react';
import { IdCard, Building2, SearchX } from 'lucide-react';
import { Avatar } from './UI';

const norm = (v) => (v || '').toString().toLowerCase();
const matches = (fields, q) => fields.some((v) => norm(v).includes(q));

function computeResults(clients, query) {
  const q = query.trim().toLowerCase();
  if (!q) return { applicants: [], groupLeaders: [] };

  const applicants = [];
  const groupLeaderMap = new Map(); // client.id -> client, de-duplicated

  clients.forEach((client) => {
    const details = client.clientDetails || {};
    if (matches([client.name, client.pan, details.mobile, details.email], q)) {
      groupLeaderMap.set(client.id, client);
    }

    const family = Array.isArray(details.familyDetails) ? details.familyDetails : [];
    family
      .filter((f) => (f.relation || '').toLowerCase() !== 'self')
      .forEach((f) => {
        if (matches([f.name, f.pan, f.mobile, f.email], q)) {
          applicants.push({ client, applicant: f });
          groupLeaderMap.set(client.id, client); // context: whose family this is
        }
      });
  });

  return {
    applicants: applicants.slice(0, 8),
    groupLeaders: [...groupLeaderMap.values()].slice(0, 8),
  };
}

function ResultRow({ name, sub, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
    >
      <Avatar name={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{name || '—'}</span>
          {badge && (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
        {sub && <div className="text-[10px] text-slate-450 dark:text-slate-500 truncate mt-0.5">{sub}</div>}
      </div>
    </button>
  );
}

export default function ClientSearchDropdown({ query, clients, onSelectApplicant, onSelectGroupLeader }) {
  const { applicants, groupLeaders } = React.useMemo(() => computeResults(clients, query), [clients, query]);
  const hasResults = applicants.length > 0 || groupLeaders.length > 0;

  if (!query.trim()) return null;

  return (
    <div className="absolute top-full left-0 mt-2 w-[420px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-2xl z-50 animate-scale-up overflow-hidden">
      {!hasResults ? (
        <div className="p-6 text-center">
          <SearchX size={22} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">No matches for "{query}"</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Search by name, mobile, email or PAN</p>
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto py-2">
          {applicants.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-1.5">
                <IdCard size={13} className="text-blue-500" />
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Applicants</span>
              </div>
              {applicants.map(({ client, applicant }, i) => (
                <ResultRow
                  key={`${client.id}-${i}`}
                  name={applicant.name}
                  badge={applicant.relation}
                  sub={
                    [applicant.mobile, applicant.email, applicant.pan].filter(Boolean).join(' · ') +
                    `  ·  Group Leader: ${client.name}`
                  }
                  onClick={() => onSelectApplicant(client.id, applicant)}
                />
              ))}
            </div>
          )}
          {groupLeaders.length > 0 && (
            <div className={applicants.length > 0 ? 'mt-1 pt-2 border-t border-slate-100 dark:border-slate-800' : ''}>
              <div className="flex items-center gap-2 px-4 py-1.5">
                <Building2 size={13} className="text-indigo-500" />
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Group Leaders</span>
              </div>
              {groupLeaders.map((client) => {
                const d = client.clientDetails || {};
                return (
                  <ResultRow
                    key={client.id}
                    name={client.name}
                    sub={[d.mobile, d.email, client.pan].filter(Boolean).join(' · ') || 'No contact info'}
                    onClick={() => onSelectGroupLeader(client.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
