// Shared attachment control for the COBR workspace registers (Renewals,
// Claims, FDs, Policies).
//
// Files are stored inline on the record as data URLs, matching the shape the
// Tasks module already uses for its document chips
// ({ id, fileName, fileType, dataUrl, date, uploadedBy }) so anything that
// already knows how to render a task attachment can render these too.
import React, { useRef, useState } from 'react';
import { Upload, X, Paperclip, Download, Lock, FileText } from 'lucide-react';
import { btnGhost } from '../UI';
import { getCurrentUser } from '../../utils/auth';
import { uid } from '../../utils/calc';

export function AttachmentChips({ files = [], onRemove, compact = false }) {
  const [preview, setPreview] = useState(null);
  if (!files.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <span
            key={f.id}
            title={`${f.fileName}${f.uploadedBy ? ` · uploaded by ${f.uploadedBy}` : ''}`}
            className={`inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200/60 dark:ring-slate-700/50 ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold max-w-[220px]`}
          >
            <Paperclip size={compact ? 9 : 10} className="shrink-0" />
            <button
              type="button"
              onClick={() => f.dataUrl && setPreview(f)}
              className="truncate hover:underline cursor-pointer"
            >
              {f.fileName || 'file'}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                title="Remove"
                className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{preview.fileName}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Uploaded by {preview.uploadedBy || 'System'}
                  {preview.date ? ` · ${new Date(preview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={preview.dataUrl} download={preview.fileName} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  <Download size={11} /> Download
                </a>
                <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
              {(preview.dataUrl || '').startsWith('data:image/') ? (
                <img src={preview.dataUrl} alt={preview.fileName} className="max-w-full max-h-full object-contain rounded-lg" />
              ) : (preview.dataUrl || '').startsWith('data:application/pdf') ? (
                <iframe src={preview.dataUrl} title={preview.fileName} className="w-full h-[70vh] rounded-lg border-0" />
              ) : (
                <div className="text-center space-y-3 py-10">
                  <FileText size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
                  <p className="text-xs text-slate-500">Preview is not available for this file type.</p>
                  <a href={preview.dataUrl} download={preview.fileName} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">
                    <Download size={13} /> Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AttachmentField({
  label = 'Attachment',
  files = [],
  onChange,
  disabled = false,
  lockedHint = '',
  hint = '',
}) {
  const inputRef = useRef(null);

  const handleFiles = (e) => {
    if (disabled) return;
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    let pending = picked.length;
    const collected = [];
    picked.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        collected.push({
          id: uid(),
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          dataUrl: ev.target.result,
          date: new Date().toISOString(),
          uploadedBy: getCurrentUser()?.name || 'System',
        });
        pending -= 1;
        if (pending === 0) onChange([...(files || []), ...collected]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const remove = (id) => onChange((files || []).filter((f) => f.id !== id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          {disabled && <Lock size={11} className="text-slate-400" />}
          {label}
        </span>
        {!disabled && (
          <button type="button" onClick={() => inputRef.current?.click()} className={btnGhost + ' py-1 px-2 text-[10px]'}>
            <Upload size={11} /> Upload
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" multiple onChange={handleFiles} className="hidden" />

      {disabled ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
          {lockedHint || 'Attachments are locked at this stage.'}
        </p>
      ) : (files || []).length === 0 ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">{hint || 'No files attached yet.'}</p>
      ) : null}

      <AttachmentChips files={files} onRemove={disabled ? null : remove} />
    </div>
  );
}
