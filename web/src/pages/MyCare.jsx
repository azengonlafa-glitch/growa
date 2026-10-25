// Medicines and health management: medication reminders and health profile.
import { useEffect, useState } from 'react';
import { useSession, can } from '../lib/session.js';
import { Button, Empty, Notice, PageHeader, Segmented } from '../components/ui.jsx';
import { MedsView } from './Meds.jsx';
import { HealthForm } from './Health.jsx';
import Profile from './Profile.jsx';

export default function MyCare({ tab: initialTab = 'meds' }) {
  const { patients } = useSession();
  const visible = patients.filter((p) => can(p, 'viewMeds') || can(p, 'viewHealth'));
  const mine = visible.find((p) => p.isSelf && p.isOwner);
  const [patientId, setPatientId] = useState(() => sessionStorage.getItem('medsPatient'));
  const patient = visible.find((p) => p.id === patientId) ?? mine ?? visible[0];
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  if (!patient) return <Empty title="ยังไม่มีโปรไฟล์ที่ดูได้" />;

  const isMine = patient.id === mine?.id;
  const pickPatient = (id) => {
    sessionStorage.setItem('medsPatient', id);
    setPatientId(id);
  };
  const back = () => {
    sessionStorage.removeItem('medsPatient');
    setPatientId(null);
  };

  // Only 2 top-level modes: ตารางยา and ข้อมูลสุขภาพ
  const tabs = [
    ...(can(patient, 'viewMeds') ? [['meds', 'ตารางยา']] : []),
    ...(can(patient, 'viewHealth') ? [['health', isMine ? 'ข้อมูลสุขภาพ' : 'ประวัติสุขภาพ']] : []),
  ];

  const active = tabs.some(([k]) => k === tab)
    ? tab
    : (tab === 'analysis' || tab === 'symptoms' ? 'health' : tabs[0]?.[0]);

  return (
    <div className="stack-lg mycare-page">
      <PageHeader
        back="care"
        title={isMine ? 'สุขภาพและยาของฉัน' : `สุขภาพและยาของ ${patient.displayName}`}
        subtitle={
          isMine
            ? 'ตารางเตือนกินยาส่วนตัว ข้อมูลสุขภาพ ผลวิเคราะห์พร้อมกราฟเปรียบเทียบ และประวัติอาการ'
            : 'ข้อมูลสุขภาพและยาของคนที่คุณดูแล'
        }
        actions={
          <a className="btn btn-secondary btn-sm" href="#/care" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            หน้ารวมโหมด
          </a>
        }
      />


      {!isMine && mine ? (
        <Notice tone="info" title={`คุณกำลังดูข้อมูลของ ${patient.displayName}${patient.viaHouse ? ' ในบ้านเดียวกัน' : ' ในฐานะผู้ดูแล'}`}>
          ทุกการบันทึกจะระบุชื่อคุณ <Button size="sm" variant="secondary" onClick={back}>กลับมาดูของฉัน</Button>
        </Notice>
      ) : null}

      {/* Only 2 main modes */}
      {tabs.length > 1 ? (
        <Segmented
          label="โหมดหลัก"
          value={active}
          onChange={setTab}
          options={tabs}
        />
      ) : null}

      {/* Panels */}
      {active === 'meds' ? (
        <MedsView key={`m-${patient.id}`} patient={patient} />
      ) : null}

      {active === 'health' ? (
        isMine ? (
          <Profile
            key={`p-${patient.id}`}
            embedded
            patient={patient}
            initialView={tab === 'analysis' ? 'analysis' : tab === 'symptoms' ? 'symptoms' : 'health'}
          />
        ) : (
          <HealthForm key={`h-${patient.id}`} patient={patient} />
        )
      ) : null}
    </div>
  );
}
