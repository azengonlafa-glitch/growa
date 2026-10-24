import { useEffect, useState, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase.js';

export function useAuthUser() {
  const [user, setUser] = useState(undefined); // undefined = still loading
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

// Live document. `ref` may be null to skip. Returns [data|null, loading, error].
export function useDocData(ref, deps) {
  const [state, setState] = useState([null, true, null]);
  useEffect(() => {
    if (!ref) {
      setState([null, false, null]);
      return undefined;
    }
    setState((s) => [s[0], true, null]);
    return onSnapshot(
      ref,
      (snap) => setState([snap.exists() ? { id: snap.id, ...snap.data() } : null, false, null]),
      (err) => setState([null, false, err]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Live query. `q` may be null to skip. Returns [rows, loading, error].
export function useQueryData(q, deps) {
  const [state, setState] = useState([[], true, null]);
  useEffect(() => {
    if (!q) {
      setState([[], false, null]);
      return undefined;
    }
    setState((s) => [s[0], true, null]);
    return onSnapshot(
      q,
      (snap) => setState([snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })), false, null]),
      (err) => {
        console.error('query failed', err.code, err.message);
        setState([[], false, err]);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Wraps an async action with busy + error state for buttons.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      // Functions errors carry the server's Thai message; strip SDK prefixes/codes.
      setError(err.message?.replace(/^Firebase:\s*/, '').replace(/\s*\([a-z-]+\/[a-z-]+\)\.?$/, '') || 'เกิดข้อผิดพลาด');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

// Short-lived confirmation text ("saved") that clears itself.
export function useFlash(ms = 4000) {
  const [text, setText] = useState('');
  const timer = useRef(null);
  const flash = useCallback((msg) => {
    setText(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(''), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [text, flash];
}

// Minimal hash router: #/path/a/b -> ['path','a','b'].
export function useHashRoute() {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const go = (path) => {
  window.location.hash = `#/${path}`;
};
