import { useEffect, useState } from 'react';

// Below Tailwind's `md` breakpoint (768px) the app uses its phone layout: the
// bottom tab bar instead of the side rail, card lists instead of wide tables.
export const PHONE_QUERY = '(max-width: 767.98px)';

export const isPhoneViewport = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches;

// The part of the screen actually visible — on phones it shrinks when the
// on-screen keyboard opens (and iOS pans it with offsetTop), which the CSS
// viewport units don't follow. The phone chat sizes itself to this so the
// composer sits right on top of the keyboard, WhatsApp-style. Returns null
// when not `enabled` or unsupported.
export function useVisualViewport(enabled) {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    return vv ? { height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) } : null;
  };
  const [box, setBox] = useState(() => (enabled ? read() : null));
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) { setBox(null); return undefined; }
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBox((prev) => {
        const next = read();
        return prev && next && prev.height === next.height && prev.offsetTop === next.offsetTop ? prev : next;
      }));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [enabled]);
  return box;
}

// Live version for layouts that must switch when a phone rotates or a
// foldable opens/closes.
export function useIsPhone() {
  const [phone, setPhone] = useState(isPhoneViewport);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}
