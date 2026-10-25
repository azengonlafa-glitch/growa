// How steadily the doses were taken. One definition for the report and the home screen:
//   on time = logged within 60 minutes of its time, late = after that; missed / skipped are only what a person confirmed;
//   a dose nobody logged is "not logged" (never assumed missed); steadiness = taken ÷ (taken + missed + not logged),
//   skipped doses and doses not yet due are left out.
import { bangkokDayStart, doseSlots } from '../../../functions/src/schedule.js';

export const GRACE_MS = 60 * 60e3;

export const blank = () => ({ ontime: 0, late: 0, missed: 0, skipped: 0, unlogged: 0 });
export const taken = (c) => c.ontime + c.late;
export const percent = (c) => { const d = taken(c) + c.missed + c.unlogged; return d ? Math.round((taken(c) / d) * 100) : null; };

export function analyse(meds, logs, fromMs, nowMs) {
  const latest = new Map(); // `${medId}|${slot}` → newest log (a correction is a newer log for the same slot)
  for (const l of logs) {
    const k = `${l.medicationId}|${l.scheduledFor?.toMillis?.()}`;
    const t = l.loggedAt?.toMillis?.() ?? Infinity;
    const cur = latest.get(k);
    if (!cur || t >= (cur.loggedAt?.toMillis?.() ?? Infinity)) latest.set(k, l);
  }
  const total = blank();
  const perMed = [];
  const byDay = new Map();
  for (const med of meds) {
    const c = blank();
    // Counting starts when the medicine entered the system (start date, else when its stock was first counted).
    const since = Math.max(fromMs, med.startDate?.toMillis?.() ?? med.stockCountedAt?.toMillis?.() ?? fromMs);
    for (const at of doseSlots(med, since, nowMs)) {
      const log = latest.get(`${med.id}|${at}`);
      let kind = null;
      if (log?.status === 'taken') kind = (log.loggedAt?.toMillis?.() ?? at) - at <= GRACE_MS ? 'ontime' : 'late';
      else if (log?.status === 'skipped') kind = 'skipped';
      else if (log?.status === 'missed') kind = 'missed';
      else if (at + GRACE_MS < nowMs) kind = 'unlogged';
      if (!kind) continue; // not due yet
      c[kind] += 1; total[kind] += 1;
      const day = bangkokDayStart(at);
      byDay.set(day, [...(byDay.get(day) ?? []), { at, med, kind, log }]);
    }
    perMed.push({ med, c });
  }
  const days = [...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([day, rows]) => [day, rows.sort((a, b) => a.at - b.at)]);
  return { total, perMed, days };
}

