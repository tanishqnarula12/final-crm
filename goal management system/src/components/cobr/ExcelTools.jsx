// Excel Upload / Download for the COBR workspace's Renewals / Claims / Fixed
// Deposits / Other Insurance Policies registers. Download always exports
// whatever the module's other filters currently leave visible; Upload reads
// back the exact same column format (see utils/cobrExcel.js for why the two
// can't drift apart) and shows a per-row validation summary before anything
// is actually imported.
import React, { useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { btnGhost, btnPrimary } from '../UI';
import { RecordModal } from './RecordShell';
import { exportRecordsToExcel, parseExcelFile } from '../../utils/cobrExcel';
import { buildImportedRecord } from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';

export function ExcelToolbar({ spec, rows, allRows, clients, onImport, canImport = false }) {
  const [showImport, setShowImport] = useState(false);

  const handleDownload = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    exportRecordsToExcel({
      fields: spec.fields,
      rows,
      sheetName: spec.sheetName,
      filename: `${spec.sheetName.replace(/\s+/g, '_')}_${stamp}.xlsx`,
    });
  };

  return (
    <>
      <div className="flex items-end gap-2">
        {canImport && (
          <button type="button" onClick={() => setShowImport(true)} className={btnGhost + ' py-2 text-xs'}>
            <Upload size={13} /> Upload Excel
          </button>
        )}
        <button type="button" onClick={handleDownload} className={btnGhost + ' py-2 text-xs'}>
          <Download size={13} /> Download Excel
        </button>
      </div>

      {showImport && (
        <ExcelImportModal
          spec={spec}
          allRows={allRows}
          clients={clients}
          onClose={() => setShowImport(false)}
          onImport={onImport}
        />
      )}
    </>
  );
}

function ExcelImportModal({ spec, allRows, clients, onClose, onImport }) {
  const fileRef = useRef(null);
  const me = getCurrentUser();
  const [headerError, setHeaderError] = useState('');
  const [results, setResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setHeaderError('');
    setResults(null);
    setImportedCount(0);

    const existingKeys = new Set((allRows || []).map(spec.dedupeKey).filter(Boolean));
    const { headerError: hErr, results: parsed } = await parseExcelFile(file, {
      fields: spec.fields,
      clients,
      dedupeKeyFor: spec.dedupeKey,
      existingKeys,
    });
    if (hErr) { setHeaderError(hErr); return; }
    setResults(parsed);
  };

  const validRows = results ? results.filter((r) => r.errors.length === 0) : [];
  const failedRows = results ? results.filter((r) => r.errors.length > 0) : [];

  const handleImport = async () => {
    if (!validRows.length) return;
    setImporting(true);
    try {
      const records = validRows.map((r) => buildImportedRecord(spec.type, r.resolved, me));
      await onImport(records);
      setImportedCount(records.length);
      setResults(failedRows);
    } finally {
      setImporting(false);
    }
  };

  return (
    <RecordModal
      title={`Upload Excel — ${spec.label}`}
      subtitle="The uploaded file must use the exact same columns as Download Excel"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={(
        <div className="flex justify-between items-center gap-2 w-full">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {importedCount > 0 && <span className="text-emerald-600 dark:text-emerald-400">{importedCount} imported — </span>}
            {results ? `${validRows.length} of ${results.length} rows ready` : 'Upload a .xlsx / .xls file'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>{importedCount > 0 ? 'Close' : 'Cancel'}</button>
            <button
              onClick={handleImport}
              disabled={!validRows.length || importing}
              className={btnPrimary + (!validRows.length || importing ? ' opacity-50 cursor-not-allowed' : '')}
            >
              {importing ? 'Importing…' : `Import ${validRows.length} record${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
          <Download size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            First time? Click <strong>Download Excel</strong> on the {spec.label} list first — it exports in the exact format this upload expects (all {spec.label} sub-form fields, in the same column order), even with zero rows.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600 hover:bg-blue-50/10 dark:hover:bg-blue-950/10 rounded-2xl p-8 flex flex-col items-center gap-2.5 transition-all text-slate-500 dark:text-slate-450 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shadow-inner"
        >
          <FileSpreadsheet size={32} className="text-slate-400 dark:text-slate-600" />
          <span className="font-bold text-sm uppercase tracking-wider">Click to upload spreadsheet</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-sans font-medium">.xlsx / .xls</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

        {headerError && (
          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 text-xs font-medium border border-rose-200/50 dark:border-rose-900/40 animate-fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {headerError}
          </div>
        )}

        {results && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Records</p>
                <p className="text-base font-black text-slate-800 dark:text-slate-200 tabular-nums">{results.length}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Ready to Import</p>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{validRows.length}</p>
              </div>
              <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 px-3 py-2.5">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Failed</p>
                <p className="text-base font-black text-rose-700 dark:text-rose-400 tabular-nums">{failedRows.length}</p>
              </div>
            </div>

            {results.length > 0 && (
              <div className="overflow-auto max-h-64 rounded-xl border border-slate-200 dark:border-slate-800/80">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5 text-left w-12">Row</th>
                      <th className="px-3 py-2.5 text-left">Client / Applicant</th>
                      <th className="px-3 py-2.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.rowNum} className={`border-b border-slate-50 dark:border-slate-800/50 ${r.errors.length ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''}`}>
                        <td className="px-3 py-2.5 text-slate-400 tabular-nums align-top">{r.rowNum}</td>
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-semibold text-slate-700 dark:text-slate-300">{r.resolved.groupLeader || '—'}</p>
                          <p className="text-[10px] text-slate-400">{r.resolved.applicant || '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {r.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                              <CheckCircle2 size={12} /> Ready
                            </span>
                          ) : (
                            <ul className="space-y-0.5">
                              {r.errors.map((e, i) => (
                                <li key={i} className="flex items-start gap-1 text-rose-600 dark:text-rose-400">
                                  <X size={11} className="mt-0.5 shrink-0" /> {e}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </RecordModal>
  );
}
