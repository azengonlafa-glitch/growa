// Today's dose schedule for a patient, built from the same schedule rules the
// server uses (functions/src/schedule.js).
import { useMemo } from 'react';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQueryData } from './hooks.js';
import { bangkokDayStart, doseSlots, DAY_MS, bangkokClock } from '../../../functions/src/schedule.js';

export { bangkokClock };

export function useMeds(patientId) {
  return useQueryData(
    patientId ? query(collection(db, 'patients', patientId, 'medications'), where('active', '==', true)) : null,
    [patientId],
  );
}

// [{ at, time, med, log }] for today, where log is the latest log for that slot (or null = "ยังไม่ได้บันทึก").
export function useTodaySchedule(patientId, meds) {
  const dayStart = bangkokDayStart(Date.now());
  const [logs, logsLoading] = useQueryData(
    patientId
      ? query(collection(db, 'patients', patientId, 'doseLogs'), where('scheduledFor', '>=', Timestamp.fromMillis(dayStart)))
      : null,
    [patientId, dayStart],
  );
  const slots = useMemo(() => {
    const rows = [];
    for (const med of meds) {
      for (const at of doseSlots(med, dayStart, dayStart + DAY_MS)) {
        const forSlot = logs
          .filter((l) => l.medicationId === med.id && l.scheduledFor?.toMillis() === at)
          .sort((a, b) => (b.loggedAt?.toMillis() ?? Infinity) - (a.loggedAt?.toMillis() ?? Infinity));
        rows.push({ at, time: bangkokClock(at), med, log: forSlot[0] ?? null });
      }
    }
    return rows.sort((a, b) => a.at - b.at);
  }, [meds, logs, dayStart]);
  return [slots, logsLoading];
}

export function daysLeft(med) {
  const t = med.estimatedRunOutDate?.toMillis?.();
  return t ? Math.max(0, Math.floor((t - Date.now()) / DAY_MS)) : null;
}

export const isLow = (med) => {
  const d = daysLeft(med);
  return d !== null && d <= (med.refillThresholdDays ?? 7);
};

export const DOSE_STATUS = {
  taken: ['รับประทานแล้ว', 'good'],
  skipped: ['งดมื้อนี้', 'neutral'],
  missed: ['ยืนยันว่าพลาดมื้อ', 'bad'],
};
