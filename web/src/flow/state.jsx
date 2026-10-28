// What the customer has decided so far in the ordering flow (pharmacy, kind, symptom result, cart).
// Kept in sessionStorage so a refresh in the middle of a step does not lose the trip.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const KEY = 'growaFlow';
const EMPTY = { pharmacy: null, center: null, kind: null, triage: null, consult: null, cart: [], payment: 'promptpay' };

const FlowContext = createContext(null);
export const useFlow = () => useContext(FlowContext);

function load() {
  try {
    return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') };
  } catch {
    return EMPTY;
  }
}

export function FlowProvider({ children }) {
  const [flow, setFlow] = useState(load);
  const update = useCallback((patch) => {
    setFlow((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep it in memory */ }
      return next;
    });
  }, []);
  // New trip: keep the chosen pharmacy and location, drop everything decided after it.
  const restart = useCallback(() => update((p) => ({ ...EMPTY, pharmacy: p.pharmacy, center: p.center })), [update]);
  const reset = useCallback(() => update(() => EMPTY), [update]);
  const value = useMemo(() => ({ ...flow, update, restart, reset }), [flow, update, restart, reset]);
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

// The branch is picked when it is first needed: to see and order drugs, to talk to its pharmacist, or at the basket.
export const STEPS = ['เลือกประเภท', 'ตอบคำถาม', 'ผลประเมิน', 'เลือกสาขา', 'สั่งซื้อ'];
export const STEPS_GOODS = ['เลือกประเภท', 'เลือกสินค้า', 'เลือกสาขา', 'สั่งซื้อ'];
