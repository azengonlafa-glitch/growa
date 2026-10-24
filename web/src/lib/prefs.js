// Display and device preferences, kept on this device only (localStorage). Account-level choices (notifications,
// health-data sharing) live in the user's documents instead, so they follow the person to other devices.
import { useSyncExternalStore } from 'react';

const KEY = 'growaPrefs';
const EVENT = 'growa-prefs';

export const DEFAULTS = {
  theme: 'auto', // auto = follow the device · light = day · dark = night · schedule = day 06:00–18:00 (Bangkok), night otherwise
  textSize: 'normal', // normal | large | xlarge
  motion: 'auto', // auto = follow the device · reduce = switch animations off
  autoLocate: false, // open the map on the current position instead of the saved address
};

export function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}

const isNight = () => {
  const hour = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  return hour < 6 || hour >= 18;
};

// The theme that is actually showing, or null while it follows the device.
export const effectiveTheme = (p) => (p.theme === 'schedule' ? (isNight() ? 'dark' : 'light') : p.theme === 'light' || p.theme === 'dark' ? p.theme : null);

export function applyPrefs(p = loadPrefs()) {
  const root = document.documentElement;
  const theme = effectiveTheme(p);
  if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  root.style.fontSize = { large: '112.5%', xlarge: '125%' }[p.textSize] ?? '';
  if (p.motion === 'reduce') root.dataset.motion = 'reduce'; else delete root.dataset.motion;
}

export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: the choice lasts until reload */ }
  cached = next;
  applyPrefs(next);
  window.dispatchEvent(new Event(EVENT));
}

let cached = null;
const subscribe = (cb) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };
const snapshot = () => (cached ??= loadPrefs());
export const usePrefs = () => useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);

// Call once at start-up. The "schedule" theme flips at 06:00 and 18:00, so re-check once a minute.
export function startPrefs() {
  applyPrefs();
  setInterval(() => { if (loadPrefs().theme === 'schedule') applyPrefs(); }, 60_000);
}
