import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { avatarColor, initials } from '../utils/calc';
import { teamPhoto } from '../services/team';

// Shows a team member's uploaded profile picture when one exists, otherwise
// coloured initials. `photo` can be passed explicitly; otherwise it's resolved
// from the team directory by `name` (so every existing `<Avatar name={...} />`
// that renders an internal user automatically gets their picture — clients /
// applicants who aren't team members simply fall through to initials).
export function Avatar({ name, size = 'md', photo, className = '' }) {
  const sizeClass = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'xs' ? 'w-5 h-5 text-[7px]' : 'w-9 h-9 text-xs';
  const [broken, setBroken] = useState(false);
  const src = photo || teamPhoto(name);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name || ''}
        onError={() => setBroken(true)}
        className={`${sizeClass} rounded-full object-cover shadow-sm shrink-0 transition-all hover:scale-105 active:scale-95 ${className}`}
      />
    );
  }
  return (
    <div className={`${sizeClass} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold shadow-sm shrink-0 transition-all hover:scale-105 active:scale-95 ${className}`}>
      {initials(name)}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-lg shadow-slate-100/40 dark:shadow-none hover:shadow-xl hover:shadow-slate-200/30 dark:hover:shadow-none transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, hint, icon: Icon, accent = 'blue' }) {
  const accents = {
    blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 ring-1 ring-blue-100/50 dark:ring-blue-900/30',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-100/50 dark:ring-indigo-900/30',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-100/50 dark:ring-emerald-900/30',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 ring-1 ring-amber-100/50 dark:ring-amber-900/30',
  };

  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 hover:translate-y-[-2px] duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums truncate">{value}</p>
          {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">{hint}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${accents[accent]}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <div className="space-y-1.5 relative">
      <label className={`block text-xs font-bold uppercase tracking-wider ${error ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
        {label}
      </label>
      {children}
      {error && <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-1 animate-fade-in">{error}</p>}
      {hint && !error && <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export const inputCls = 'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-600 dark:focus:ring-blue-500/10 transition-all placeholder-slate-400 dark:placeholder-slate-600 shadow-sm';
export const selectCls = inputCls + ' bg-white dark:bg-slate-950 cursor-pointer appearance-none';

export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 text-xs font-bold uppercase tracking-wider bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
export const btnSecondary = 'inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 text-xs font-bold uppercase tracking-wider bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer';

// Recursive helper to extract text content from React children
function getLabelText(children) {
  if (children === null || children === undefined) return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getLabelText).join('');
  }
  if (children.props && children.props.children) {
    return getLabelText(children.props.children);
  }
  return '';
}

// Custom Searchable Dropdown mimicking the LocationPicker styling
export function CoolSelect({
  value,
  onChange,
  children,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  emptyHint = 'No matches found',
  required = false,
  showValueOnSelect = false,
  freeInput = false,   // when true: typed text is accepted as value even if not in list
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [menuRect, setMenuRect] = useState(null);

  // Parse HTML-style option/optgroup elements from children into a flat list.
  // Each item is { value, label, group? } — optgroup label becomes a separator header.
  const options = useMemo(() => {
    if (!children) return [];
    const result = [];
    const parseOption = (child, group) => {
      if (!child) return;
      if (child.type === 'option') {
        const val = child.props.value !== undefined ? child.props.value : getLabelText(child.props.children);
        const lbl = getLabelText(child.props.children) || String(val || '');
        if (child.props.disabled) return;
        result.push({ value: val, label: lbl, group: group || null });
      } else if (child.type === 'optgroup') {
        const grpLabel = child.props.label || '';
        result.push({ value: `__group__${grpLabel}`, label: grpLabel, isGroup: true });
        React.Children.toArray(child.props.children).forEach(c => parseOption(c, grpLabel));
      }
    };
    React.Children.toArray(children).forEach(c => parseOption(c, null));
    return result;
  }, [children]);

  // Find currently selected option (skip group headers)
  const selectedOpt = useMemo(() => {
    return options.find(opt => !opt.isGroup && String(opt.value) === String(value));
  }, [options, value]);

  // Update query when value/selectedOpt changes
  useEffect(() => {
    if (!open) {
      if (selectedOpt) {
        setQuery(showValueOnSelect ? String(selectedOpt.value) : selectedOpt.label);
      } else if (freeInput && value) {
        setQuery(String(value));   // show raw typed value in freeInput mode
      } else {
        setQuery('');
      }
    }
  }, [selectedOpt, open, showValueOnSelect, freeInput, value]);

  // Filter options based on query; group headers only show when not filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!open || !q) return options;
    // When a query is active, skip group headers and filter by label
    const starts = [];
    const contains = [];
    for (const opt of options) {
      if (opt.isGroup) continue;
      const labelLower = opt.label.toLowerCase();
      if (labelLower.startsWith(q)) starts.push(opt);
      else if (labelLower.includes(q)) contains.push(opt);
    }
    return [...starts, ...contains];
  }, [options, query, open]);


  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlight(0);
  }, [filtered.length]);

  const updateMenuRect = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  const openMenu = () => {
    if (disabled) return;
    updateMenuRect();
    setOpen(true);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updateMenuRect();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target) &&
        !e.target.closest('[data-combobox-menu]')
      ) {
        // freeInput: emit the typed query as value if it differs from the current selection
        if (freeInput && open && query.trim() && (!selectedOpt || query.trim() !== selectedOpt.label)) {
          if (onChange) onChange({ target: { value: query.trim() } });
        }
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [freeInput, open, query, selectedOpt, onChange]);

  const select = (opt) => {
    if (!opt || opt.isGroup) return;   // skip group header clicks
    if (onChange) onChange({ target: { value: opt.value } });
    setQuery(showValueOnSelect ? String(opt.value) : opt.label);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') openMenu();
      return;
    }
    // Arrow navigation skips over group headers
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => {
        let next = h + 1;
        while (next < filtered.length - 1 && filtered[next]?.isGroup) next++;
        return Math.min(next, filtered.length - 1);
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => {
        let prev = h - 1;
        while (prev > 0 && filtered[prev]?.isGroup) prev--;
        return Math.max(prev, 0);
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlight];
      if (target && !target.isGroup) {
        select(target);
      } else if (freeInput && query.trim()) {
        if (onChange) onChange({ target: { value: query.trim() } });
        setOpen(false);
      } else {
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Auto-scroll highlighted element in list
  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.children[highlight];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, open]);

  // Determine if compact layout is requested via className
  const classList = className.split(/\s+/);
  const isCompact = classList.includes('text-xs') || classList.includes('py-1.5') || classList.includes('py-1') || classList.includes('py-2') || classList.includes('px-2');
  
  const cleanClassName = classList.filter(c => 
    !c.match(/^(p|px|py|pl|pr|pt|pb)-\d+(\.\d+)?$/) && 
    !c.match(/^text-(xs|sm|base|lg|xl|2xl)$/)
  ).join(' ');

  const iconSize = isCompact ? 11 : 13;
  const leftIconPos = isCompact ? 'left-2.5' : 'left-3';
  const rightIconPos = isCompact ? 'right-2.5' : 'right-3';
  const clearPos = isCompact ? 'right-6' : 'right-7';

  // Build input classes dynamically
  let inputClass = 'w-full text-slate-900 dark:text-white focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ';

  if (!className.includes('border-0')) {
    inputClass += 'border border-slate-300 dark:border-slate-800 ';
  }
  if (!className.includes('bg-transparent')) {
    inputClass += 'bg-white dark:bg-slate-950 ';
  } else {
    inputClass += 'bg-transparent ';
  }
  if (!className.includes('rounded-')) {
    inputClass += isCompact ? 'rounded-lg ' : 'rounded-xl ';
  }
  if (!className.includes('focus:ring-')) {
    inputClass += 'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-600 dark:focus:ring-blue-500/10 ';
  }
  if (!className.includes('shadow-')) {
    inputClass += 'shadow-sm ';
  }

  inputClass += isCompact ? 'py-1.5 pl-7 pr-7 text-xs ' : 'py-2.5 pl-8 pr-8 text-sm ';
  inputClass += cleanClassName;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <Search size={iconSize} className={`absolute ${leftIconPos} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`} />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          required={required}
          value={open ? query : (selectedOpt ? (showValueOnSelect ? String(selectedOpt.value) : selectedOpt.label) : (freeInput ? (value || '') : ''))}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) openMenu();
            else updateMenuRect();
          }}
          onFocus={openMenu}
          onClick={() => { if (!open) openMenu(); }}
          onKeyDown={handleKeyDown}
          placeholder={open && selectedOpt ? selectedOpt.label : placeholder}
          className={inputClass}
          autoComplete="off"
        />
        {selectedOpt && selectedOpt.value !== '' && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (onChange) onChange({ target: { value: '' } });
              setQuery('');
              inputRef.current?.focus();
              openMenu();
            }}
            className={`absolute ${clearPos} top-1/2 -translate-y-1/2 text-slate-350 hover:text-slate-550 dark:text-slate-600 dark:hover:text-slate-400`}
            title="Clear"
          >
            <X size={iconSize} />
          </button>
        )}
        <ChevronDown size={iconSize} className={`absolute ${rightIconPos} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`} />
      </div>

      {open && !disabled && menuRect && createPortal(
        <div
          data-combobox-menu
          ref={listRef}
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width, zIndex: 9999 }}
          className="max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1"
        >
          {filtered.filter(o => !o.isGroup).length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-slate-400 dark:text-slate-500 italic">
              {freeInput && query.trim() ? `Press Enter to use "${query.trim()}"` : emptyHint}
            </div>
          ) : (
            filtered.map((opt, i) => {
              if (opt.isGroup) {
                return (
                  <div key={opt.value + '-' + i} className="px-3.5 pt-2.5 pb-0.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest select-none">
                    {opt.label}
                  </div>
                );
              }
              return (
                <div
                  key={opt.value + '-' + i}
                  onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`px-3.5 py-2 text-sm cursor-pointer truncate ${i === highlight ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                >
                  {opt.label}
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
