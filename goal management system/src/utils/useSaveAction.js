// Save → Saving… → Saved for a button whose action waits on the server.
//
// People click Save again when nothing seems to happen, and every extra click
// on an unguarded button ran the save again — a note added twice, a document
// saved twice. `run` ignores clicks while a save is in flight (checked on a
// ref, so even two clicks in the same frame can't both get through), shows
// "saved" briefly once it lands, then calls `afterSaved` — so a form closes
// only after the user has seen that it worked. An ignored click never calls
// `afterSaved`. A failed save goes straight back to idle and rethrows, so the
// caller can show the error and keep what was typed.
//
//   const save = useSaveAction();
//   <button onClick={() => save.run(() => api.post(...), close).catch(showError)} disabled={save.busy}>
//     <SaveLabel state={save.state} idle="Save Note" />
//   </button>
import { useCallback, useEffect, useRef, useState } from 'react';

export function useSaveAction({ savedMs = 900 } = {}) {
  const [state, setState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (action, afterSaved) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setState('saving');
    try {
      const result = await action();
      if (mounted.current) {
        setState('saved');
        await new Promise((resolve) => setTimeout(resolve, savedMs));
      }
      afterSaved?.(result);
      return result;
    } finally {
      inFlight.current = false;
      if (mounted.current) setState('idle');
    }
  }, [savedMs]);

  return { state, busy: state !== 'idle', run };
}
