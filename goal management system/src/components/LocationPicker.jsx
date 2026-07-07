import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { inputCls } from './UI';

// The world country/state/city dataset is a few MB — split it into its own
// chunk and fetch it lazily on first use instead of bloating every page load.
let cscModule = null;
let cscPromise = null;
function loadCSC() {
  if (!cscPromise) {
    cscPromise = import('country-state-city').then(mod => { cscModule = mod; return mod; });
  }
  return cscPromise;
}

function useCSC() {
  const [mod, setMod] = useState(cscModule);
  useEffect(() => {
    if (mod) return;
    loadCSC().then(setMod);
  }, [mod]);
  return mod;
}

const RESULT_CAP = 150;

// Ranks "starts with" matches above plain "contains" matches, the way a
// professional address-autocomplete (Stripe, Google Forms, etc.) behaves.
function filterOptions(options, query) {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, RESULT_CAP);
  const starts = [];
  const contains = [];
  for (const opt of options) {
    const lower = opt.toLowerCase();
    if (lower.startsWith(q)) starts.push(opt);
    else if (lower.includes(q)) contains.push(opt);
    if (starts.length + contains.length >= RESULT_CAP * 3) break;
  }
  return [...starts, ...contains].slice(0, RESULT_CAP);
}

// Generic searchable combobox: type to filter, click (or Enter) to select.
// Keeps whatever text is typed as the live value even if it doesn't match an
// option, so a city/state missing from the dataset can still be entered.
function Combobox({ value, onChange, options, placeholder, disabled, emptyHint }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [menuRect, setMenuRect] = useState(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = useMemo(() => filterOptions(options, open ? query : ''), [options, query, open]);

  const updateMenuRect = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  const openMenu = () => {
    if (disabled) return;
    updateMenuRect();
    setOpen(true);
    setHighlight(0);
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
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !e.target.closest('[data-combobox-menu]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const select = (opt) => {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') openMenu();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); if (!open) openMenu(); else updateMenuRect(); }}
          onFocus={openMenu}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputCls + ' pl-8 pr-8 disabled:opacity-50 disabled:cursor-not-allowed'}
          autoComplete="off"
        />
        {query && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(''); onChange(''); inputRef.current?.focus(); openMenu(); }}
            className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
            title="Clear"
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {open && !disabled && menuRect && createPortal(
        <div
          data-combobox-menu
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width, zIndex: 9999 }}
          className="max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1"
        >
          {filtered.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-slate-400 dark:text-slate-500 italic">{emptyHint || 'No matches — keep typing or enter it manually.'}</div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt + i}
                onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3.5 py-2 text-sm cursor-pointer truncate ${i === highlight ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
              >
                {opt}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function CountrySelect({ value, onChange, placeholder }) {
  const csc = useCSC();
  const options = useMemo(() => csc ? csc.Country.getAllCountries().map(c => c.name) : [], [csc]);
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      disabled={!csc}
      placeholder={csc ? (placeholder || 'Type to search countries…') : 'Loading countries…'}
    />
  );
}

export function StateSelect({ country, value, onChange, placeholder }) {
  const csc = useCSC();
  const countryObj = useMemo(() => csc ? csc.Country.getAllCountries().find(c => c.name === country) : null, [csc, country]);
  const options = useMemo(() => (csc && countryObj) ? csc.State.getStatesOfCountry(countryObj.isoCode).map(s => s.name) : [], [csc, countryObj]);
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      disabled={!countryObj}
      placeholder={!csc ? 'Loading…' : countryObj ? (placeholder || 'Type to search states…') : 'Select a country first'}
      emptyHint={countryObj && options.length === 0 ? 'No states on file — enter it manually.' : undefined}
    />
  );
}

export function CitySelect({ country, state, value, onChange, placeholder }) {
  const csc = useCSC();
  const countryObj = useMemo(() => csc ? csc.Country.getAllCountries().find(c => c.name === country) : null, [csc, country]);
  const stateObj = useMemo(
    () => (csc && countryObj) ? csc.State.getStatesOfCountry(countryObj.isoCode).find(s => s.name === state) : null,
    [csc, countryObj, state]
  );
  const options = useMemo(
    () => (csc && countryObj && stateObj) ? csc.City.getCitiesOfState(countryObj.isoCode, stateObj.isoCode).map(c => c.name) : [],
    [csc, countryObj, stateObj]
  );
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      disabled={!stateObj}
      placeholder={!csc ? 'Loading…' : stateObj ? (placeholder || 'Type to search cities…') : 'Select a state first'}
      emptyHint={stateObj && options.length === 0 ? 'No cities on file — enter it manually.' : undefined}
    />
  );
}
