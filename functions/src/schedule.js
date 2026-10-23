// Dose schedule math in Asia/Bangkok time (UTC+7, no DST).
// Pure (no Firebase imports) so the web app uses the exact same rules.

export const TZ_OFFSET_MS = 7 * 3600e3;
export const DAY_MS = 24 * 3600e3;
export const NAMED_TIMES = { morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' };
export const NAMED_TIME_LABELS = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };

const toMillis = (t) => (t == null ? null : typeof t === 'number' ? t : t.toMillis?.() ?? null);

export function timeOfDayMs(t) {
  const hhmm = NAMED_TIMES[t] ?? t;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 60e3 : null;
}

// Local midnight (as UTC ms) of the Bangkok day containing `ms`.
export function bangkokDayStart(ms) {
  return Math.floor((ms + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
}

// All scheduled dose instants (epoch ms) in [fromMs, toMs).
export function doseSlots(med, fromMs, toMs) {
  const offsets = (med.times ?? []).map(timeOfDayMs).filter((x) => x !== null);
  if (med.asNeeded || offsets.length === 0 || toMs <= fromMs) return [];
  const start = Math.max(fromMs, toMillis(med.startDate) ?? fromMs);
  const end = Math.min(toMs, toMillis(med.endDate) ?? toMs);
  const slots = [];
  let dayStart = bangkokDayStart(start);
  for (let guard = 0; dayStart < end && guard < 400; guard++, dayStart += DAY_MS) {
    for (const off of offsets) {
      const at = dayStart + off;
      if (at >= start && at < end) slots.push(at);
    }
  }
  return slots.sort((a, b) => a - b);
}

// "HH:mm" of an instant in Bangkok time.
export function bangkokClock(ms) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(11, 16);
}
