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

const AUTH_ERRORS = {
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/wrong-password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/user-not-found': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
  'auth/email-already-in-use': 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน',
  'auth/weak-password': 'รหัสผ่านง่ายเกินไป ใช้อย่างน้อย 6 ตัวอักษร',
  'auth/too-many-requests': 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
  'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสัญญาณแล้วลองใหม่',
  'auth/user-disabled': 'บัญชีนี้ถูกระงับ',
  'auth/requires-recent-login': 'เพื่อความปลอดภัย กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ก่อนทำรายการนี้',
};

// Turns an SDK or function error into one readable Thai sentence. Function errors already carry the server's Thai text.
export function friendlyError(err) {
  const code = err?.code ?? '';
  if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'ไม่มีสิทธิ์ทำรายการนี้ หรือข้อมูลยังไม่พร้อม ลองรีเฟรชแล้วทำใหม่';
  if (code === 'unavailable') return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  const msg = (err?.message ?? '')
    .replace(/^Firebase:\s*/, '')
    .replace(/\s*\[\d{3}\]\s*$/, '')
    .replace(/\s*\([a-z-]+\/[a-z-]+\)\.?$/, '')
    .trim();
  return !msg || /^error$/i.test(msg) ? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' : msg;
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
      setError(friendlyError(err));
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
