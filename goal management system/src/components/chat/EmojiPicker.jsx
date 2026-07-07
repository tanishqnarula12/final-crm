import { useState, useEffect, useRef } from 'react';
import { EMOJI_CATEGORIES } from './emojiData';

const RECENTS_KEY = 'crm:chat:recentEmojis';

const loadRecents = () => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 24) : [];
  } catch { return []; }
};

const pushRecentEmoji = (emoji) => {
  try {
    const cur = loadRecents().filter((e) => e !== emoji);
    localStorage.setItem(RECENTS_KEY, JSON.stringify([emoji, ...cur].slice(0, 24)));
  } catch { /* ignore */ }
};

// A compact, dependency-free emoji picker. `onPick(emoji)` fires on selection;
// the caller decides whether to close. Category tabs scroll the panel.
export default function EmojiPicker({ onPick, className = '' }) {
  const [active, setActive] = useState('smileys');
  const [recents, setRecents] = useState(loadRecents());
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => { setRecents(loadRecents()); }, []);

  const pick = (emoji) => {
    pushRecentEmoji(emoji);
    setRecents(loadRecents());
    onPick(emoji);
  };

  const scrollToCat = (id) => {
    setActive(id);
    const el = sectionRefs.current[id];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - scrollRef.current.offsetTop - 4, behavior: 'smooth' });
    }
  };

  return (
    <div className={`w-[320px] max-w-[86vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${className}`}>
      {/* Category tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => scrollToCat(cat.id)}
            title={cat.label}
            className={`shrink-0 w-8 h-8 rounded-lg text-lg leading-none flex items-center justify-center transition-colors cursor-pointer ${
              active === cat.id ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div ref={scrollRef} className="h-56 overflow-y-auto px-2 py-2">
        {recents.length > 0 && (
          <div className="mb-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-1">Recent</div>
            <div className="grid grid-cols-8 gap-0.5">
              {recents.map((e, i) => (
                <button key={`r${i}`} onClick={() => pick(e)} className="w-9 h-9 text-xl leading-none rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }} className="mb-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-1">{cat.label}</div>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((e, i) => (
                <button key={`${cat.id}${i}`} onClick={() => pick(e)} className="w-9 h-9 text-xl leading-none rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
