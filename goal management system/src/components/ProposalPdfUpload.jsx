import React, { useRef } from 'react';
import { FileUp, X, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { btnSecondary } from './UI';

// "Upload Proposal": pick a proposal PDF this CRM generated earlier and the
// form is filled from it (see utils/proposalPdf.js). The file never leaves
// the device.
export function UploadProposalButton({ onFile, busy }) {
  const inputRef = useRef(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-proposal-upload
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-busy={busy}
        title="Fill this form from a proposal PDF made earlier in the CRM"
        className={btnSecondary + ' py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait'}
      >
        <FileUp size={14} /> {busy ? 'Reading PDF…' : 'Upload Proposal'}
      </button>
    </>
  );
}

// What the upload did: what was filled in, and anything to check by hand.
export function ProposalImportNotice({ notice, onClose }) {
  if (!notice) return null;
  const isError = notice.kind === 'error';
  return (
    <div
      data-import-notice={notice.kind}
      className={`rounded-xl border p-4 text-xs ${isError
        ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300'
        : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'}`}
    >
      <div className="flex items-start gap-2.5">
        {isError ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="font-bold break-words">{notice.title}</div>
          {(notice.lines || []).map((l, i) => <div key={i} className="break-words">{l}</div>)}
          {notice.warnings?.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-bold mb-1"><AlertTriangle size={13} /> Please check</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {notice.warnings.map((w, i) => <li key={i} className="break-words">{w}</li>)}
              </ul>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 p-1 rounded-md opacity-70 hover:opacity-100 cursor-pointer">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
