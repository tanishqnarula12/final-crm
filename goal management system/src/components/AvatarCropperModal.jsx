import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, Check } from 'lucide-react';
import { btnPrimary, btnGhost } from './UI';

const VIEWPORT = 300; // preview circle size, css px
const OUTPUT = 480; // exported square image size, px

// A small drag-to-pan + zoom-to-fit avatar cropper. Takes a raw (uncropped)
// data URL — whatever the file input just read — and returns a square,
// re-encoded data URL of exactly what's visible inside the circular
// viewport when the user confirms. Used for both personal and group photos
// so both go through the same "make it look good before it's set" step
// instead of whatever crop/orientation the source file happened to have.
export default function AvatarCropperModal({ src, onCancel, onConfirm }) {
  const [natural, setNatural] = useState(null); // { w, h }
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);
  const dragState = useRef(null);

  // Load the source image once to get its natural size and compute the
  // minimum zoom that still fully covers the circular viewport.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const min = VIEWPORT / Math.min(w, h);
      setNatural({ w, h });
      setMinScale(min);
      setScale(min);
      setOffset({ x: (VIEWPORT - w * min) / 2, y: (VIEWPORT - h * min) / 2 });
    };
    img.src = src;
  }, [src]);

  const clamp = (nextOffset, nextScale) => {
    if (!natural) return nextOffset;
    const w = natural.w * nextScale;
    const h = natural.h * nextScale;
    const minX = VIEWPORT - w;
    const minY = VIEWPORT - h;
    return {
      x: Math.min(0, Math.max(minX, nextOffset.x)),
      y: Math.min(0, Math.max(minY, nextOffset.y)),
    };
  };

  const onPointerDown = (e) => {
    if (!natural) return;
    const point = 'touches' in e ? e.touches[0] : e;
    dragState.current = { startX: point.clientX, startY: point.clientY, origin: offset };
  };
  const onPointerMove = (e) => {
    if (!dragState.current) return;
    const point = 'touches' in e ? e.touches[0] : e;
    const dx = point.clientX - dragState.current.startX;
    const dy = point.clientY - dragState.current.startY;
    const next = { x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy };
    setOffset(clamp(next, scale));
  };
  const onPointerUp = () => { dragState.current = null; };

  const onZoom = (e) => {
    const next = Number(e.target.value);
    setScale(next);
    setOffset((prev) => clamp(prev, next));
  };

  const handleConfirm = () => {
    if (!natural) return;
    setSaving(true);
    const k = OUTPUT / VIEWPORT;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      imgRef.current,
      0, 0, natural.w, natural.h,
      offset.x * k, offset.y * k, natural.w * scale * k, natural.h * scale * k
    );
    onConfirm(canvas.toDataURL('image/jpeg', 0.92));
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[10000] animate-fade-in" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Adjust Photo</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            className="relative mx-auto rounded-full overflow-hidden cursor-grab active:cursor-grabbing bg-slate-100 dark:bg-slate-950 select-none ring-1 ring-slate-200 dark:ring-slate-800"
            style={{ width: VIEWPORT, height: VIEWPORT, touchAction: 'none' }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          >
            {natural && (
              <img
                ref={imgRef}
                src={src}
                alt="Crop preview"
                draggable={false}
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: natural.w * scale,
                  height: natural.h * scale,
                  maxWidth: 'none',
                }}
              />
            )}
          </div>
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 font-medium">Drag to reposition</p>

          <div className="flex items-center gap-3 px-1">
            <ZoomIn size={14} className="text-slate-400 shrink-0" />
            <input
              type="range"
              min={minScale}
              max={minScale * 3}
              step={(minScale * 3 - minScale) / 100 || 0.001}
              value={scale}
              onChange={onZoom}
              disabled={!natural}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onCancel} className={btnGhost}>Cancel</button>
          <button onClick={handleConfirm} disabled={!natural || saving} className={btnPrimary}>
            <Check size={14} /> Use Photo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
