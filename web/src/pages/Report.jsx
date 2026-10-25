// Medication report: how steadily the doses were taken over the last 7 or 30 days, per medicine and day by day,
// with the patient's details and a space for the doctor's notes. Print it or save it as a PDF for an appointment.
//
// How the numbers are counted (shown on the page too):
//   a dose is "on time" when it was logged within 60 minutes of its time, "late" after that;
//   "missed" and "skipped" are only what a person confirmed; a dose nobody logged is "not logged" (not assumed missed);
//   steadiness = taken ÷ (taken + missed + not logged); skipped doses and doses not yet due are left out.
import { useMemo, useState } from 'react';
import { collection, doc, Timestamp, where, query } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useDocData, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { bangkokClock, bangkokDayStart, DAY_MS, NAMED_TIME_LABELS } from '../../../functions/src/schedule.js';
import { analyse, blank, percent } from '../lib/adherence.js';
import { Badge, Button, Card, Empty, Icon, Loading, PageHeader, Segmented } from '../components/ui.jsx';
import { ageOf } from './House.jsx';
import './report.css';

const longDay = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' });
const weekDay = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'short' });
const SEX = { female: 'หญิง', male: 'ชาย', other: 'อื่น ๆ' };
const LABEL = { ontime: ['กินตรงเวลา', 'good'], late: ['กินล่าช้า', 'warn'], missed: ['พลาดมื้อ', 'bad'], skipped: ['งดมื้อนี้', 'neutral'], unlogged: ['ไม่ได้บันทึก', 'warn'] };
const MEAL = { before: 'ก่อนอาหาร', after: 'หลังอาหาร', with: 'พร้อมอาหาร' };

function Info({ patient, health, caregivers }) {
  const age = ageOf(patient.birthYear);
  const appt = patient.nextAppointment?.toMillis?.();
  const conditions = health?.conditions ?? [];
  const allergies = (health?.allergies ?? []).map((a) => a.substance).filter(Boolean);
  return (
    <Card className="rp-info">
      <h2>{patient.displayName}</h2>
      <dl className="rp-facts">
        <div><dt>อายุ / เพศ</dt><dd>{[age !== null ? `${age} ปี` : null, SEX[patient.sex]].filter(Boolean).join(' · ') || '—'}</dd></div>
        <div><dt>โรคประจำตัว</dt><dd>{conditions.length ? conditions.join(' · ') : '—'}</dd></div>
        <div><dt>แพ้ยา</dt><dd>{allergies.length ? allergies.join(' · ') : 'ไม่ได้บันทึก'}</dd></div>
        <div><dt>โรงพยาบาล</dt><dd>{patient.hospital || '—'}</dd></div>
        <div><dt>แพทย์ที่ดูแล</dt><dd>{patient.doctor || '—'}</dd></div>
        <div><dt>นัดครั้งถัดไป</dt><dd>{appt ? longDay.format(appt) : '—'}</dd></div>
        {caregivers ? <div><dt>ผู้ดูแลในบ้าน</dt><dd>{caregivers.join(' · ') || '—'}</dd></div> : null}
      </dl>
    </Card>
  );
}

export default function Report() {
  const { patients, house, memberNames } = useSession();
  const visible = patients.filter((p) => can(p, 'viewMeds'));
  const mine = visible.find((p) => p.isSelf && p.isOwner);
  const [patientId, setPatientId] = useState(() => { try { return sessionStorage.getItem('medsPatient'); } catch { return null; } });
  const patient = visible.find((p) => p.id === patientId) ?? mine ?? visible[0];
  const [range, setRange] = useState(7);

  const now = Date.now();
  const today = bangkokDayStart(now);
  const from = today - (range - 1) * DAY_MS;
  const [meds, medsLoading] = useQueryData(patient ? query(collection(db, 'patients', patient.id, 'medications'), where('active', '==', true)) : null, [patient?.id]);
  const [logs, logsLoading] = useQueryData(patient ? query(collection(db, 'patients', patient.id, 'doseLogs'), where('scheduledFor', '>=', Timestamp.fromMillis(from))) : null, [patient?.id, from]);
  const [health] = useDocData(patient && can(patient, 'viewHealth') ? doc(db, 'patients', patient.id, 'health', 'profile') : null, [patient?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => analyse(meds, logs, from, Date.now()), [meds, logs, from]);

  if (!patient) return <Empty title="ยังไม่มีโปรไฟล์ที่ดูได้" />;
  const pct = percent(result.total);
  // Medicines grouped by the condition they are for ("ไม่ระบุโรค" when none was given); only worth showing when it adds something.
  const byCondition = (() => {
    const g = new Map();
    for (const { med, c } of result.perMed) {
      const k = med.condition || 'ไม่ระบุโรค';
      const cur = g.get(k) ?? [blank(), []];
      for (const key of Object.keys(cur[0])) cur[0][key] += c[key];
      cur[1].push(med.name);
      g.set(k, cur);
    }
    return g.size > 1 || (g.size === 1 && !g.has('ไม่ระบุโรค')) ? [...g.entries()].map(([k, [c, meds]]) => [k, c, meds]) : [];
  })();
  const caregivers = house ? Object.entries(memberNames ?? {}).map(([, n]) => n) : [];
  const loading = medsLoading || logsLoading;
  const pick = (id) => { try { sessionStorage.setItem('medsPatient', id); } catch { /* storage may be blocked */ } setPatientId(id); };

  return (
    <div className="stack-lg rp">
      <PageHeader
        eyebrow="ใช้ประกอบการพบแพทย์"
        title="รายงานการใช้ยา"
        subtitle={`${range === 7 ? '7 วันล่าสุด' : 'ย้อนหลัง 30 วัน'} · ${longDay.format(from)} – ${longDay.format(today)}`}
        actions={<Button size="sm" onClick={() => window.print()}><Icon name="list" size={18} />พิมพ์ / บันทึก PDF</Button>}
      />

      <div className="rp-controls rp-noprint">
        {visible.length > 1 ? <Segmented label="เลือกโปรไฟล์" value={patient.id} onChange={pick} options={visible.map((p) => [p.id, p.id === mine?.id ? 'ตัวเอง' : p.displayName])} /> : null}
        <Segmented label="ช่วงเวลา" value={range} onChange={setRange} options={[[7, '7 วัน'], [30, '30 วัน']]} />
      </div>

      <Info patient={patient} health={health} caregivers={caregivers.length ? caregivers : null} />

      {loading ? <Loading /> : (
        <>
          <Card className="rp-score">
            <div className={`rp-ring${pct === null ? ' none' : pct >= 80 ? ' good' : pct >= 50 ? ' mid' : ' low'}`} style={{ '--p': pct ?? 0 }} role="img" aria-label={pct === null ? 'ยังไม่มีข้อมูล' : `ความสม่ำเสมอ ${pct} เปอร์เซ็นต์`}>
              <strong className="num">{pct === null ? '—' : `${pct}%`}</strong><span>กินยาสม่ำเสมอ</span>
            </div>
            <ul className="rp-counts">
              {Object.entries(LABEL).map(([k, [text, tone]]) => (
                <li key={k}><Badge tone={tone}>{text}</Badge><strong className="num">{result.total[k]}</strong> <span className="muted small">มื้อ</span></li>
              ))}
            </ul>
            <p className="rp-how muted small">คำนวณจาก (กินแล้ว) ÷ (กินแล้ว + พลาดที่ยืนยัน + ไม่ได้บันทึก) ไม่นับมื้อที่งดและมื้อที่ยังไม่ถึงเวลา มื้อที่ไม่มีใครบันทึกไม่ได้แปลว่าพลาด แต่ยังยืนยันไม่ได้ว่ากินแล้ว กินตรงเวลาคือบันทึกภายใน 60 นาที นับตั้งแต่วันที่เพิ่มรายการยาในระบบ</p>
          </Card>

          <section className="stack">
            <h2>แยกตามยา</h2>
            {result.perMed.length ? (
              <div className="rp-table-wrap">
                <table className="rp-table">
                  <thead><tr><th>ยา</th><th>โรค</th><th>เวลา</th><th>ตรงเวลา</th><th>ล่าช้า</th><th>พลาด</th><th>ไม่ได้บันทึก</th><th>สม่ำเสมอ</th></tr></thead>
                  <tbody>
                    {result.perMed.map(({ med, c }) => {
                      const p = percent(c);
                      return (
                        <tr key={med.id}>
                          <td data-label="ยา"><strong>{med.name}</strong><span className="muted small">{MEAL[med.mealRelation] ?? ''}</span></td>
                          <td data-label="โรค">{med.condition || '—'}</td>
                          <td data-label="เวลา">{(med.times ?? []).map((t) => NAMED_TIME_LABELS[t] ?? t).join(' · ')}</td>
                          <td data-label="ตรงเวลา" className="num">{c.ontime}</td>
                          <td data-label="ล่าช้า" className="num">{c.late}</td>
                          <td data-label="พลาด" className="num">{c.missed}</td>
                          <td data-label="ไม่ได้บันทึก" className="num">{c.unlogged}</td>
                          <td data-label="สม่ำเสมอ"><span className="rp-bar" role="img" aria-label={p === null ? 'ยังไม่มีข้อมูล' : `${p} เปอร์เซ็นต์`}><i style={{ width: `${p ?? 0}%` }} /></span><strong className="num">{p === null ? '—' : `${p}%`}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon="pill" title="ยังไม่มียาในรายการ" />}
          </section>

          {byCondition.length ? (
            <section className="stack">
              <h2>แยกตามโรค</h2>
              <ul className="rp-cond">
                {byCondition.map(([name, c, meds]) => {
                  const p = percent(c);
                  return (
                    <li key={name}>
                      <span><strong>{name}</strong><span className="muted small">{meds.join(' · ')}</span></span>
                      <span className="rp-bar" role="img" aria-label={p === null ? 'ยังไม่มีข้อมูล' : `${p} เปอร์เซ็นต์`}><i style={{ width: `${p ?? 0}%` }} /></span>
                      <strong className="num">{p === null ? '—' : `${p}%`}</strong>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="stack rp-history">
            <h2>ประวัติการกินยารายวัน</h2>
            {result.days.length ? result.days.map(([day, rows]) => (
              <Card key={day} className="rp-day">
                <h3>{weekDay.format(day)}</h3>
                <ul>
                  {rows.map((r) => {
                    const [text, tone] = LABEL[r.kind];
                    const when = r.log?.loggedAt?.toMillis?.();
                    return (
                      <li key={`${r.med.id}-${r.at}`}>
                        <span className="num rp-time">{bangkokClock(r.at)}</span>
                        <span className="rp-med"><strong>{r.med.name}</strong>{MEAL[r.med.mealRelation] ? <span className="muted small"> · {MEAL[r.med.mealRelation]}</span> : null}</span>
                        <Badge tone={tone}>{text}</Badge>
                        <span className="muted small rp-logged">{when ? `บันทึก ${bangkokClock(when)} น.` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )) : <p className="muted">ยังไม่มีมื้อยาที่ถึงเวลาในช่วงนี้</p>}
          </section>
        </>
      )}

      <section className="rp-doctor" aria-label="บันทึกของแพทย์">
        <h2>บันทึกของแพทย์</h2>
        <div className="rp-lines" aria-hidden>{Array.from({ length: 7 }, (_, i) => <span key={i} />)}</div>
        <p className="muted small">พิมพ์ออกมาเพื่อให้แพทย์เขียนบันทึก ผลที่เห็นนี้มาจากที่ผู้ใช้กดยืนยันในแอป ไม่ใช่การวินิจฉัย</p>
      </section>
      <p className="rp-printed muted small">สร้างจาก growa เมื่อ {longDay.format(Date.now())}</p>
    </div>
  );
}
