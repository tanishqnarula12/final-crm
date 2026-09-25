// Others → Top Performing Schemes.
//
// A monthly mutual-fund scheme-performance workbook is uploaded here, every
// worksheet is imported as a category, and schemes are screened by one rule:
//
//     Median > Average Median  →  Top Performing
//
// Three tabs: Monthly Upload (the snapshot + its raw data), Performance
// Summary (the screening results), and History (past months and per-scheme
// trends). The month picker below is this module's OWN filter — it is
// deliberately independent of the dashboard's global date filter, because a
// September workbook is routinely uploaded in October and must stay filed
// under September.
//
// The raw/analysis split is load-bearing and visible in the UI: "Uploaded
// Data" renders the worksheet verbatim, while every screening verdict lives in
// separate, clearly-labelled system columns. Neither is ever written over the
// other.
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy, Upload, FileSpreadsheet, Calendar, Search, AlertTriangle, Download,
  Layers, ListFilter, History, ChevronRight, ChevronDown, Loader2, Trash2,
  TrendingUp, TrendingDown, HelpCircle, Info, X, ArrowLeft,
} from 'lucide-react';
import { Card, StatTile, btnPrimary, btnSecondary, inputCls } from './UI';
import UploadWizard from './schemePerf/UploadWizard';
import { RESULT, RESULT_LABEL, monthLabel, pct, signedPct } from '../utils/schemePerf';
import { dataUrlToBlobUrl } from '../utils/documents';
import { teamName } from '../services/team';
import { canTopSchemes } from '../utils/permissions';
import {
  listMonths, getUpload, getCategory, listSchemes, getOriginalFile,
  getSchemeHistory, searchSchemeNames, deleteUpload,
} from '../services/schemePerformance';

const TABS = [
  { id: 'upload', label: 'Monthly Upload', icon: Upload },
  { id: 'summary', label: 'Performance Summary', icon: Layers },
  { id: 'history', label: 'History', icon: History },
];

const RESULT_PILL = {
  [RESULT.TOP]: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  [RESULT.BELOW]: 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700/40',
  [RESULT.NA]: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
};

const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: RESULT.TOP, label: 'Top Performing' },
  { id: RESULT.BELOW, label: 'Below Threshold' },
  { id: RESULT.NA, label: 'Screening Unavailable' },
];

function ResultPill({ result }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 whitespace-nowrap ${RESULT_PILL[result] || RESULT_PILL[RESULT.NA]}`}>
      {RESULT_LABEL[result] || 'Unknown'}
    </span>
  );
}

const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export default function TopPerformingSchemes() {
  const [tab, setTab] = useState('upload');
  const [months, setMonths] = useState([]);
  const [uploadId, setUploadId] = useState(null);
  const [upload, setUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  // Permission matrix → Top Performing Schemes → Upload.
  const mayUpload = canTopSchemes('upload');

  // ---- month list ---------------------------------------------------------
  const refreshMonths = useCallback(async (preferUploadId) => {
    setLoading(true);
    setError('');
    try {
      const list = await listMonths();
      setMonths(list);
      const next = preferUploadId
        || (list.find((m) => m.currentUploadId === uploadId) ? uploadId : null)
        || list[0]?.currentUploadId
        || null;
      setUploadId(next);
      if (!next) setUpload(null);
    } catch (err) {
      setError(err?.message || 'Could not load performance months.');
    }
    setLoading(false);
  }, [uploadId]);

  useEffect(() => { refreshMonths(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ---- the selected snapshot ---------------------------------------------
  useEffect(() => {
    if (!uploadId) { setUpload(null); return; }
    let alive = true;
    setLoading(true);
    getUpload(uploadId)
      .then((u) => { if (alive) { setUpload(u); setError(''); } })
      .catch((err) => { if (alive) setError(err?.message || 'Could not load that month.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uploadId]);

  const totals = upload?.totals || { categories: 0, total: 0, top: 0, below: 0, na: 0 };

  const selectedMonth = useMemo(
    () => months.find((m) => m.versions.some((v) => v.id === uploadId)) || null,
    [months, uploadId]
  );
  const selectedVersion = useMemo(
    () => selectedMonth?.versions.find((v) => v.id === uploadId) || null,
    [selectedMonth, uploadId]
  );

  const handleSaved = async (created) => {
    setWizardOpen(false);
    await refreshMonths(created?.id);
    setTab('summary');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this uploaded workbook? The month\'s other versions stay untouched.')) return;
    try {
      await deleteUpload(id);
      await refreshMonths();
    } catch (err) {
      setError(err?.message || 'Could not remove that upload.');
    }
  };

  const openOriginal = async (id, fileName) => {
    try {
      const { fileDataUrl, fileName: name } = await getOriginalFile(id);
      const href = dataUrlToBlobUrl(fileDataUrl);
      const a = document.createElement('a');
      a.href = href;
      a.download = name || fileName || 'workbook.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch (err) {
      setError(err?.message || 'Could not open the original file.');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ---- Header ---------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Trophy size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Top Performing Schemes</h2>
            <p className="text-xs text-slate-400">
              Monthly scheme screening — Median vs Average Median, category by category.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* This module's OWN month filter — not the dashboard's global one. */}
          <div className="relative">
            <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={uploadId || ''}
              onChange={(e) => setUploadId(e.target.value || null)}
              disabled={!months.length}
              className={inputCls + ' cursor-pointer pl-8 pr-8 py-2 text-xs font-bold min-w-[190px] disabled:opacity-50'}
            >
              {!months.length && <option value="">No months uploaded yet</option>}
              {months.map((m) => (
                <option key={m.reportingMonth} value={m.currentUploadId}>
                  {monthLabel(m.reportingMonth)}
                  {m.versions.length > 1 ? ` (v${m.versions.find((v) => v.id === m.currentUploadId)?.version || m.versions[0].version})` : ''}
                </option>
              ))}
            </select>
          </div>
          {mayUpload && (
            <button onClick={() => setWizardOpen(true)} className={btnPrimary + ' text-xs'}>
              <Upload size={14} /> Upload Monthly Excel
            </button>
          )}
        </div>
      </div>

      {/* ---- Summary cards (follow the selected month) ------------------ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Total Categories" value={totals.categories} icon={Layers} accent="blue" />
        <StatTile label="Total Schemes" value={totals.total} icon={FileSpreadsheet} accent="indigo" />
        <StatTile label="Top Performing" value={totals.top} icon={TrendingUp} accent="emerald" />
        <StatTile label="Below Threshold" value={totals.below} icon={TrendingDown} accent="slate" />
        <StatTile label="Screening Unavailable" value={totals.na} icon={HelpCircle} accent="amber" />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-400">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="shrink-0 cursor-pointer hover:text-rose-900"><X size={13} /></button>
        </div>
      )}

      {/* ---- Tabs ------------------------------------------------------- */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-px">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 -mb-px ${
                on
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading && !upload && (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && !months.length && (
        <EmptyState onUpload={mayUpload ? () => setWizardOpen(true) : null} />
      )}

      {upload && tab === 'upload' && (
        <MonthlyUploadTab
          upload={upload}
          version={selectedVersion}
          onOpenOriginal={openOriginal}
          onDelete={handleDelete}
          canDelete={canTopSchemes('delete', upload)}
        />
      )}

      {upload && tab === 'summary' && <PerformanceSummaryTab upload={upload} />}

      {tab === 'history' && (
        <HistoryTab
          months={months}
          activeUploadId={uploadId}
          onPick={(id) => { setUploadId(id); setTab('upload'); }}
          onOpenOriginal={openOriginal}
        />
      )}

      {wizardOpen && (
        <UploadWizard
          existingMonths={months}
          onClose={() => setWizardOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Empty state
// ===========================================================================
function EmptyState({ onUpload }) {
  return (
    <Card className="p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
        <Trophy size={24} />
      </div>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No performance data yet</h3>
      <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
        Upload this month's scheme performance workbook. Every worksheet is read automatically as its own
        category, the raw data is kept exactly as uploaded, and schemes are screened on Median vs Average Median.
      </p>
      {onUpload && (
        <button onClick={onUpload} className={btnPrimary + ' text-xs mt-5'}>
          <Upload size={14} /> Upload Monthly Excel
        </button>
      )}
    </Card>
  );
}

// ===========================================================================
// TAB 1 — Monthly Upload: the snapshot's metadata + its RAW uploaded data
// ===========================================================================
function MonthlyUploadTab({ upload, version, onOpenOriginal, onDelete, canDelete }) {
  const [openCat, setOpenCat] = useState(null);

  return (
    <div className="space-y-4 animate-scale-up">
      {/* Snapshot header */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{monthLabel(upload.reportingMonth)}</h3>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                  Version {upload.version}
                </span>
                {upload.supersededAt && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
                    Replaced
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                File: <span className="font-semibold text-slate-700 dark:text-slate-300">{upload.fileName}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Uploaded By: <span className="font-semibold text-slate-600 dark:text-slate-400">{teamName(upload.uploadedBy) || '—'}</span>
                <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                Uploaded On: <span className="font-semibold text-slate-600 dark:text-slate-400">{fmtDate(upload.createdAt)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onOpenOriginal(upload.id, upload.fileName)} className={btnSecondary + ' text-xs'}>
              <Download size={14} /> View Original Excel
            </button>
            {canDelete && (
              <button
                onClick={() => onDelete(upload.id)}
                title="Remove this uploaded workbook"
                className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* UPLOADED DATA */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">Uploaded Data</h4>
          <span title="Exactly what the workbook contained — same columns, same order, nothing renamed, recalculated or hidden.">
            <Info size={12} className="text-slate-400" />
          </span>
        </div>

        {!openCat ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/50">
                  <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Category (Worksheet)</th>
                    <th className="px-4 py-3 text-right">Schemes</th>
                    <th className="px-4 py-3 text-right">Average Median</th>
                    <th className="px-4 py-3 text-right">Top Performing</th>
                    <th className="px-4 py-3 text-right">Below Threshold</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {upload.categories.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setOpenCat(c)}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{c.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{c.counts.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.avgMedian === null ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={11} /> Unavailable
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{pct(c.avgMedian)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{c.counts.top}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{c.counts.below}</td>
                      <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-slate-300 inline" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <RawCategoryView category={openCat} onBack={() => setOpenCat(null)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RAW view — the worksheet exactly as uploaded. Deliberately dumb: it renders
// the stored header row and cells in their original order and says nothing
// about screening. Analysis lives in its own tab, never mixed in here.
// ---------------------------------------------------------------------------
function RawCategoryView({ category, onBack }) {
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setBusy(true);
    getCategory(category.id)
      .then((c) => { if (alive) setFull(c); })
      .catch((e) => { if (alive) setErr(e?.message || 'Could not load that category.'); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [category.id]);

  const headers = full?.rawHeaders || [];
  const rows = full?.rawRows || [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{category.name}</h4>
            <p className="text-[11px] text-slate-400">
              {rows.length} rows · exactly as uploaded
              {category.avgMedianSource ? ` · Average Median from ${category.avgMedianSource}` : ''}
            </p>
          </div>
        </div>
        {category.avgMedian === null && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-lg">
            <AlertTriangle size={12} /> Average Median Unavailable
          </span>
        )}
      </div>

      {busy && <div className="p-8 text-center text-slate-400 text-xs"><Loader2 size={16} className="animate-spin inline mr-2" />Loading rows…</div>}
      {err && <div className="p-6 text-center text-rose-600 text-xs">{err}</div>}

      {!busy && !err && (
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-950/50 sticky top-0 z-10">
              <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5 border-r border-slate-100 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-950">#</th>
                {headers.map((h, i) => <th key={i} className="px-3 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, ri) => (
                <tr key={ri} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2 text-slate-300 dark:text-slate-600 tabular-nums border-r border-slate-100 dark:border-slate-800 sticky left-0 bg-white dark:bg-slate-900">{ri + 1}</td>
                  {headers.map((_, ci) => (
                    <td key={ci} className="px-3 py-2 text-slate-700 dark:text-slate-300">{r[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={headers.length + 1} className="px-3 py-8 text-center text-slate-400">This worksheet had no rows.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ===========================================================================
// TAB 2 — Performance Summary: category rollup + the screened scheme lists
// ===========================================================================
function PerformanceSummaryTab({ upload }) {
  const [category, setCategory] = useState('');   // '' = all categories
  const [quick, setQuick] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    listSchemes(upload.id, {
      result: quick === 'all' ? undefined : quick,
      category: category || undefined,
      q: q.trim() || undefined,
    })
      .then((s) => { if (alive) setRows(s); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [upload.id, category, quick, q]);

  // When one category is in focus, the two verdict groups are shown as the
  // separate lists the workflow asks for rather than one mixed table.
  const split = useMemo(() => ({
    top: rows.filter((r) => r.result === RESULT.TOP),
    below: rows.filter((r) => r.result === RESULT.BELOW),
    na: rows.filter((r) => r.result === RESULT.NA),
  }), [rows]);

  return (
    <div className="space-y-5 animate-scale-up">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Reporting Month: <span className="font-bold text-slate-800 dark:text-slate-200">{monthLabel(upload.reportingMonth)}</span>
      </p>

      {/* Category rollup */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {upload.categories.map((c) => {
          const on = category === c.name;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(on ? '' : c.name)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                on
                  ? 'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm'
                  : 'border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">{c.name}</h4>
                <ChevronRight size={14} className={`shrink-0 mt-0.5 transition-transform ${on ? 'rotate-90 text-amber-600' : 'text-slate-300'}`} />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Average Median:{' '}
                {c.avgMedian === null ? (
                  <span className="font-bold text-amber-600 dark:text-amber-400">Unavailable</span>
                ) : (
                  <span className="font-bold text-slate-700 dark:text-slate-300">{pct(c.avgMedian)}</span>
                )}
              </p>
              <div className="flex items-center gap-4 mt-2.5 text-[11px]">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{c.counts.top} Top Performing</span>
                <span className="font-bold text-slate-500">{c.counts.below} Below</span>
                {c.counts.na > 0 && <span className="font-bold text-amber-600 dark:text-amber-400">{c.counts.na} N/A</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search scheme…"
              className={inputCls + ' pl-9 py-2 text-xs'}
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls + ' cursor-pointer py-2 text-xs max-w-[190px]'}
          >
            <option value="">All Categories</option>
            {upload.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setQuick(f.id)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                  quick === f.id
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {busy ? (
        <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading schemes…
        </div>
      ) : quick === 'all' ? (
        // Unfiltered: the two verdict groups as separate, clearly-named lists.
        <div className="space-y-5">
          <SchemeTable
            title="Top Performing Schemes"
            subtitle="Median is above this category's Average Median."
            icon={TrendingUp}
            accent="emerald"
            rows={split.top}
          />
          <SchemeTable
            title="Ignore / Below Screening Threshold"
            subtitle="Median is at or below this category's Average Median. This is the outcome of the screening rule only — it is not a judgement on the fund itself."
            icon={TrendingDown}
            accent="slate"
            rows={split.below}
          />
          {split.na.length > 0 && (
            <SchemeTable
              title="Screening Not Available"
              subtitle="No Average Median was present for the category, or the Median cell could not be read as a number. Nothing has been assumed for these."
              icon={AlertTriangle}
              accent="amber"
              rows={split.na}
            />
          )}
        </div>
      ) : (
        <SchemeTable
          title={QUICK_FILTERS.find((f) => f.id === quick)?.label || 'Schemes'}
          subtitle={`${rows.length} scheme${rows.length === 1 ? '' : 's'}${category ? ` in ${category}` : ''}.`}
          icon={ListFilter}
          accent={quick === RESULT.TOP ? 'emerald' : quick === RESULT.NA ? 'amber' : 'slate'}
          rows={rows}
        />
      )}
    </div>
  );
}

const ACCENT = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
};

function SchemeTable({ title, subtitle, icon: Icon, accent, rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ACCENT[accent] || ACCENT.slate}`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
            {title} <span className="text-slate-400 font-semibold normal-case">({rows.length})</span>
          </h4>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{subtitle}</p>
        </div>
      </div>

      {!rows.length ? (
        <p className="px-4 py-8 text-center text-xs text-slate-400">Nothing in this list for the current filters.</p>
      ) : (
        <div className="overflow-x-auto max-h-[55vh]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/50 sticky top-0 z-10">
              <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Scheme Name</th>
                <th className="px-4 py-2.5 text-right">Median</th>
                <th className="px-4 py-2.5 text-right">Average Median</th>
                <th className="px-4 py-2.5 text-right">Difference</th>
                <th className="px-4 py-2.5">Screening Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.categoryName}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200">{r.schemeName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{pct(r.median)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{pct(r.avgMedian)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                    r.difference === null ? 'text-slate-400'
                      : r.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                  }`}>
                    {signedPct(r.difference)}
                  </td>
                  <td className="px-4 py-2.5"><ResultPill result={r.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ===========================================================================
// TAB 3 — History: every month's snapshots + how one scheme has trended
// ===========================================================================
function HistoryTab({ months, activeUploadId, onPick, onOpenOriginal }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggle = (m) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(m) ? next.delete(m) : next.add(m);
    return next;
  });

  // Suggestions, debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (!term.trim() || term === picked) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      searchSchemeNames(term.trim()).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [term, picked]);

  const loadHistory = (name) => {
    setPicked(name);
    setTerm(name);
    setSuggestions([]);
    setBusy(true);
    getSchemeHistory(name)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-5 animate-scale-up">
      {/* Scheme history */}
      <Card className="p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">Scheme History</h4>
          <span title="How one scheme has screened month over month. Reads the current version of each month.">
            <Info size={12} className="text-slate-400" />
          </span>
        </div>

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={term}
            onChange={(e) => { setTerm(e.target.value); setPicked(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && term.trim()) loadHistory(term.trim()); }}
            placeholder="Search a scheme to see its monthly screening…"
            className={inputCls + ' pl-9 py-2 text-xs'}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => loadHistory(s)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {busy && <p className="text-xs text-slate-400 mt-4"><Loader2 size={13} className="animate-spin inline mr-1.5" />Loading history…</p>}

        {!busy && picked && (
          history.length ? (
            <div className="mt-4">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2.5">{picked}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/50">
                    <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Month</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-3 py-2.5 text-right">Median</th>
                      <th className="px-3 py-2.5 text-right">Average Median</th>
                      <th className="px-3 py-2.5 text-right">Difference</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {history.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{monthLabel(h.reportingMonth)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{h.categoryName}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{pct(h.median)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{pct(h.avgMedian)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${
                          h.difference === null ? 'text-slate-400' : h.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                        }`}>{signedPct(h.difference)}</td>
                        <td className="px-3 py-2.5"><ResultPill result={h.result} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-4">No screening records found for “{picked}”.</p>
          )
        )}
      </Card>

      {/* Monthly snapshots */}
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2.5">Performance History</h4>
        {!months.length ? (
          <Card className="p-8 text-center text-xs text-slate-400">No months uploaded yet.</Card>
        ) : (
          <div className="space-y-2">
            {months.map((m) => {
              const open = expanded.has(m.reportingMonth);
              const current = m.versions.find((v) => v.id === m.currentUploadId) || m.versions[0];
              return (
                <Card key={m.reportingMonth} className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 p-4 flex-wrap">
                    <button
                      onClick={() => toggle(m.reportingMonth)}
                      className="flex items-center gap-2.5 text-left cursor-pointer min-w-0"
                    >
                      {open ? <ChevronDown size={15} className="text-slate-400 shrink-0" /> : <ChevronRight size={15} className="text-slate-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{monthLabel(m.reportingMonth)}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {current?.fileName} · {teamName(current?.uploadedBy) || '—'} · {fmtDate(current?.createdAt)}
                          {m.versions.length > 1 && ` · ${m.versions.length} versions`}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.currentUploadId === activeUploadId && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
                          Viewing
                        </span>
                      )}
                      <button onClick={() => onPick(m.currentUploadId)} className={btnSecondary + ' text-[10px] px-3 py-1.5'}>
                        Open
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      {m.versions.map((v) => (
                        <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 pl-11 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Version {v.version}
                              {v.isCurrent && <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Current</span>}
                              {v.supersededAt && <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Replaced</span>}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {v.fileName} · {teamName(v.uploadedBy) || '—'} · {fmtDate(v.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => onOpenOriginal(v.id, v.fileName)} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                              <Download size={11} /> Original Excel
                            </button>
                            <button onClick={() => onPick(v.id)} className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                              View
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
