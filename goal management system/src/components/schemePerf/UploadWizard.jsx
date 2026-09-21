// "+ Upload Monthly Excel" — pick a workbook, review what the importer found,
// correct anything it got wrong, then save the month as a snapshot.
//
// The review step is the point of this screen. Detection is heuristic by
// design (next month's file may move the header row, rename "Median" or add
// categories), so every detected choice — header row, scheme column, median
// column, Average Median — is shown and editable BEFORE anything is stored.
// A misread sheet is a two-click fix here rather than a code change later.
import { useState, useMemo, useRef } from 'react';
import {
  X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, Info, ChevronRight,
} from 'lucide-react';
import { btnPrimary, btnSecondary, inputCls, Field } from '../UI';
import {
  parseWorkbook, analysisRows, screenCategory, summarize, buildCategoryPayload,
  monthLabel, monthKey, pct, RESULT,
} from '../../utils/schemePerf';
import { createUpload } from '../../services/schemePerformance';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Excel workbooks for this are small (a few hundred KB). The cap is well under
// the API's 25 MB JSON body limit, which also has to carry the parsed rows.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const smallSelect =
  'px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer max-w-[190px]';

export default function UploadWizard({ existingMonths = [], onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [sheets, setSheets] = useState(null);
  const [month, setMonth] = useState('');
  const [monthSource, setMonthSource] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dupChoice, setDupChoice] = useState(null); // null | 'new' | 'replace'
  const inputRef = useRef(null);

  const existing = existingMonths.find((m) => m.reportingMonth === month) || null;
  const needsDupDecision = !!existing && !dupChoice;

  // ---- file → parsed sheets ----------------------------------------------
  const handleFile = async (f) => {
    setError('');
    if (!f) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) {
      setError('Please choose an Excel workbook (.xlsx, .xlsm or .xls).');
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB. Please keep it under 10 MB.`);
      return;
    }
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseWorkbook(buf, f.name);
      if (!parsed.sheets.length) {
        setError('That workbook has no worksheets.');
        setParsing(false);
        return;
      }
      // Keep the original bytes for "View Original Excel" — stored verbatim,
      // never a re-export of what we parsed.
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('Could not read that file.'));
        r.readAsDataURL(f);
      });

      setFile(f);
      setFileDataUrl(dataUrl);
      setSheets(parsed.sheets);
      setMonth(parsed.detectedMonth || '');
      setMonthSource(parsed.monthSource);
      setDupChoice(null);
    } catch (err) {
      setError(err?.message || 'Could not read that workbook.');
    }
    setParsing(false);
  };

  // ---- live preview of the screening, recomputed as the user corrects ----
  const preview = useMemo(() => {
    if (!sheets) return null;
    const perSheet = sheets.map((sh) => {
      const rows = analysisRows(sh);
      const schemes = screenCategory({
        rawRows: rows, schemeCol: sh.schemeCol, medianCol: sh.medianCol, avgMedian: sh.avgMedian,
      });
      return { sheet: sh, counts: summarize(schemes) };
    });
    const totals = perSheet.reduce((a, p) => ({
      categories: a.categories + (p.sheet.empty ? 0 : 1),
      total: a.total + p.counts.total,
      top: a.top + p.counts.top,
      below: a.below + p.counts.below,
      na: a.na + p.counts.na,
    }), { categories: 0, total: 0, top: 0, below: 0, na: 0 });
    return { perSheet, totals };
  }, [sheets]);

  const patchSheet = (idx, patch) =>
    setSheets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  // ---- save ---------------------------------------------------------------
  const handleSave = async () => {
    if (!month) { setError('Please choose the reporting month this workbook covers.'); return; }
    if (needsDupDecision) { setError('Please choose what to do about the existing file for this month.'); return; }
    setSaving(true);
    setError('');
    try {
      const categories = sheets
        .filter((s) => !s.empty && s.rawRows.length)
        .map((s) => buildCategoryPayload(s, month));

      if (!categories.length) {
        setError('None of the worksheets in this workbook contain any rows.');
        setSaving(false);
        return;
      }

      const { upload } = await createUpload({
        reportingMonth: month,
        fileName: file.name,
        fileSize: file.size,
        fileDataUrl,
        mode: dupChoice || 'new',
        categories: categories.map((c) => ({
          ...c,
          // The API recomputes every verdict from median + avgMedian, so only
          // the inputs to the rule need to travel.
          schemes: c.schemes.map((s) => ({
            schemeName: s.schemeName, median: s.median, rowIndex: s.rowIndex,
          })),
        })),
      });
      onSaved?.(upload);
    } catch (err) {
      setError(err?.message || 'Could not save this upload.');
      setSaving(false);
    }
  };

  const now = new Date();
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i);
  const [my, mm] = month ? month.split('-') : ['', ''];

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Upload Monthly Excel</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Every worksheet becomes a category. Nothing already stored is overwritten.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* ---- 1. File picker ------------------------------------------ */}
          {!sheets && (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-all"
            >
              {parsing ? (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <Loader2 size={30} className="animate-spin text-blue-600" />
                  <span className="text-sm font-bold">Reading worksheets…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Upload size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Drop the workbook here, or click to choose
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      .xlsx, .xlsm or .xls — every sheet is read automatically (max 10 MB)
                    </p>
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
          )}

          {/* ---- 2. Review ------------------------------------------------ */}
          {sheets && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800">
                <FileSpreadsheet size={18} className="text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {(file.size / 1024).toFixed(0)} KB · {preview.totals.categories} categor
                    {preview.totals.categories === 1 ? 'y' : 'ies'} · {preview.totals.total} schemes
                  </p>
                </div>
                <button
                  onClick={() => { setSheets(null); setFile(null); setFileDataUrl(''); setMonth(''); setDupChoice(null); }}
                  className={btnSecondary + ' text-[10px] px-3 py-1.5'}
                >
                  Change file
                </button>
              </div>

              {/* Reporting month */}
              <Field
                label="Reporting Month *"
                hint={
                  monthSource
                    ? `Detected from the ${monthSource}. Change it if that's not the month this file covers.`
                    : 'This workbook does not say which month it covers — please pick it.'
                }
              >
                <div className="flex items-center gap-2">
                  <select
                    value={mm}
                    onChange={(e) => setMonth(e.target.value && my ? `${my}-${e.target.value}` : (e.target.value ? `${now.getFullYear()}-${e.target.value}` : ''))}
                    className={inputCls + ' cursor-pointer max-w-[180px]'}
                  >
                    <option value="">Select month…</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={my}
                    onChange={(e) => setMonth(mm ? `${e.target.value}-${mm}` : '')}
                    className={inputCls + ' cursor-pointer max-w-[130px]'}
                  >
                    <option value="">Year…</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </Field>

              {/* Duplicate-month protection */}
              {existing && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-900 dark:text-amber-300">
                        A performance file already exists for {monthLabel(month)}.
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-0.5">
                        {existing.versions.length} version{existing.versions.length === 1 ? '' : 's'} on record.
                        Whichever you choose, the existing data is kept and stays readable from History.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {[
                          { id: 'replace', label: 'Replace Existing', note: 'new version becomes the one shown' },
                          { id: 'new', label: 'Upload as New Version', note: 'added alongside' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => { setDupChoice(opt.id); setError(''); }}
                            title={opt.note}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                              dupChoice === opt.id
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-900/60 hover:bg-amber-100 dark:hover:bg-amber-950/40'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button onClick={onClose} className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-sheet mapping review */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Worksheets Found
                  </h4>
                  <span title="Each worksheet becomes a category. These columns were detected automatically — correct any that are wrong before saving.">
                    <Info size={12} className="text-slate-400" />
                  </span>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950/50">
                        <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2.5">Category (Sheet)</th>
                          <th className="px-3 py-2.5">Scheme Column</th>
                          <th className="px-3 py-2.5">Median Column</th>
                          <th className="px-3 py-2.5">Average Median</th>
                          <th className="px-3 py-2.5 text-right">Screening</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {preview.perSheet.map(({ sheet, counts }, idx) => {
                          const noAvg = sheet.avgMedian === null || sheet.avgMedian === undefined;
                          if (sheet.empty) {
                            return (
                              <tr key={sheet.name} className="text-slate-400">
                                <td className="px-3 py-2.5 font-bold">{sheet.name}</td>
                                <td className="px-3 py-2.5 italic" colSpan={4}>Empty sheet — nothing to import</td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={sheet.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                              <td className="px-3 py-2.5">
                                <p className="font-bold text-slate-800 dark:text-slate-200">{sheet.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {sheet.rawRows.length} rows · header on row {sheet.headerRowIndex + 1}
                                </p>
                              </td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={sheet.schemeCol ?? ''}
                                  onChange={(e) => patchSheet(idx, { schemeCol: e.target.value === '' ? null : Number(e.target.value) })}
                                  className={smallSelect}
                                >
                                  <option value="">— none —</option>
                                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={sheet.medianCol ?? ''}
                                  onChange={(e) => patchSheet(idx, { medianCol: e.target.value === '' ? null : Number(e.target.value) })}
                                  className={smallSelect}
                                >
                                  <option value="">— none —</option>
                                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={sheet.avgMedian ?? ''}
                                  placeholder="not in sheet"
                                  onChange={(e) => patchSheet(idx, {
                                    avgMedian: e.target.value === '' ? null : Number(e.target.value),
                                    avgMedianSource: e.target.value === '' ? null : 'Entered manually at upload',
                                  })}
                                  className={`px-2 py-1.5 text-xs w-28 bg-white dark:bg-slate-950 border rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                    noAvg ? 'border-amber-400 dark:border-amber-700' : 'border-slate-300 dark:border-slate-800'
                                  }`}
                                />
                                <p className="text-[9px] text-slate-400 mt-0.5 max-w-[140px] truncate" title={sheet.avgMedianSource || ''}>
                                  {sheet.avgMedianSource || 'Not found in this sheet'}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {noAvg ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                    <AlertTriangle size={11} /> Not available
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold">
                                    <span className="text-emerald-600 dark:text-emerald-400">{counts.top} top</span>
                                    <span className="text-slate-300 dark:text-slate-700 mx-1">·</span>
                                    <span className="text-slate-500">{counts.below} below</span>
                                    {counts.na > 0 && (
                                      <>
                                        <span className="text-slate-300 dark:text-slate-700 mx-1">·</span>
                                        <span className="text-amber-600">{counts.na} n/a</span>
                                      </>
                                    )}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {preview.totals.na > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400/90 mt-2 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {preview.totals.na} scheme{preview.totals.na === 1 ? '' : 's'} cannot be screened — either the
                    category has no Average Median or the Median cell is not a readable number. They are still
                    imported in full and shown as “Screening Not Available”; no value is assumed for them.
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: 'Categories', value: preview.totals.categories, cls: 'text-slate-800 dark:text-slate-200' },
                  { label: 'Schemes', value: preview.totals.total, cls: 'text-slate-800 dark:text-slate-200' },
                  { label: 'Top Performing', value: preview.totals.top, cls: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Below Threshold', value: preview.totals.below, cls: 'text-slate-500' },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">{s.label}</span>
                    <span className={`text-lg font-bold tabular-nums ${s.cls}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-400">
            {sheets ? 'Raw data is stored exactly as uploaded. Screening is added alongside it.' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className={btnSecondary + ' text-xs'}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!sheets || saving || !month || needsDupDecision}
              className={btnPrimary + ' text-xs'}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={14} /> Save Snapshot</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
