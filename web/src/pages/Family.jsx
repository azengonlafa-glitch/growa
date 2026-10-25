import { useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { useAction, useFlash, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { Badge, Button, Card, ConfirmButton, ErrorText, Field, Flash, Icon, PageHeader } from '../components/ui.jsx';

const PERMS = [
  ['viewMeds', 'ดูรายการยาและตารางยา'],
  ['logDoses', 'บันทึกการรับประทานยา'],
  ['editMeds', 'แก้ไขรายการยา'],
  ['requestRefill', 'สั่งเติมยาและสั่งซื้อแทน'],
  ['viewOrders', 'ดูคำสั่งซื้อและรับแจ้งเตือนการจัดส่ง'],
  ['viewHealth', 'ดูประวัติแพ้ยาและโรคประจำตัว'],
];
const STATUS = { invited: ['รอตอบรับ', 'warn'], requested: ['ขอสิทธิ์เข้ามา', 'info'], active: ['ใช้งานอยู่', 'good'], declined: ['ปฏิเสธ', 'neutral'], revoked: ['ยกเลิกแล้ว', 'neutral'] };

function PermissionPicker({ value, onChange }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {PERMS.map(([k, label]) => (
        <label key={k} className="check">
          <input type="checkbox" checked={Boolean(value[k])} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />
          {label}
        </label>
      ))}
    </div>
  );
}

function CaregiverRow({ patient, cg }) {
  const [perms, setPerms] = useState(cg.permissions);
  const [editing, setEditing] = useState(cg.status === 'requested');
  const { busy, error, run } = useAction();
  const update = (data) => run(async () => {
    await updateDoc(cg.ref, { ...data, updatedAt: serverTimestamp() });
    await call('afterCaregiverChange', { patientId: patient.id, caregiverUid: cg.id });
    setEditing(false);
  });
  const [label, tone] = STATUS[cg.status];
  const full = Object.fromEntries(PERMS.map(([k]) => [k, Boolean(perms[k])]));

  return (
    <div className="list-item list-item-wrap" style={{ alignItems: 'flex-start' }}>
      <div className="list-item-main stack" style={{ gap: 6 }}>
        <div className="row"><strong>{cg.caregiverName}</strong><Badge tone={tone}>{label}</Badge></div>
        {editing ? <PermissionPicker value={perms} onChange={setPerms} /> : (
          <span className="muted small">{PERMS.filter(([k]) => cg.permissions[k]).map(([, l]) => l).join(' · ') || 'ไม่มีสิทธิ์'}</span>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="actions-col">
        {cg.status === 'requested' ? (
          <>
            <Button size="sm" busy={busy} onClick={() => update({ status: 'active', permissions: full })}>อนุมัติ</Button>
            <Button size="sm" variant="secondary" busy={busy} onClick={() => update({ status: 'declined' })}>ปฏิเสธ</Button>
          </>
        ) : ['active', 'invited'].includes(cg.status) ? (
          <>
            {editing
              ? <Button size="sm" busy={busy} onClick={() => update({ permissions: full })}>บันทึกสิทธิ์</Button>
              : <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>แก้สิทธิ์</Button>}
            <ConfirmButton size="sm" variant="ghost" busy={busy} question={`ยกเลิกสิทธิ์ของ ${cg.caregiverName}?`} yes="ยกเลิกสิทธิ์" onConfirm={() => update({ status: 'revoked' })}>ยกเลิกสิทธิ์</ConfirmButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

function OwnedProfile({ patient }) {
  const [caregivers] = useQueryData(collection(db, 'patients', patient.id, 'caregivers'), [patient.id]);
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState({ viewMeds: true, logDoses: true, requestRefill: true, viewOrders: true });
  const [open, setOpen] = useState(false);
  const [sent, flash] = useFlash();
  const { busy, error, run } = useAction();

  return (
    <Card className="stack">
      <div className="between">
        <h3>{patient.isSelf ? 'โปรไฟล์ของฉัน' : patient.displayName}</h3>
        <Badge tone="info">คุณเป็นเจ้าของข้อมูล</Badge>
      </div>
      {caregivers.length ? (
        <div className="list">{caregivers.map((cg) => <CaregiverRow key={cg.id} patient={patient} cg={cg} />)}</div>
      ) : <p className="muted small">ยังไม่มีผู้ดูแล</p>}
      {open ? (
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          run(() => call('inviteCaregiver', { patientId: patient.id, email, permissions: perms }).then(() => { setEmail(''); setOpen(false); flash('ส่งคำเชิญแล้ว รอผู้ดูแลตอบรับ'); }));
        }}>
          <Field label="อีเมลของผู้ดูแล" hint="ผู้ดูแลต้องสมัครสมาชิกก่อน และต้องกดตอบรับคำเชิญ">
            <input type="email" name="caregiver-email" inputMode="email" autoComplete="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="สิทธิ์ที่ให้"><PermissionPicker value={perms} onChange={setPerms} /></Field>
          <div className="row">
            <Button type="submit" busy={busy}>ส่งคำเชิญ</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
          </div>
        </form>
      ) : <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Icon name="plus" size={18} stroke={2.6} />เชิญผู้ดูแล</Button>}
      <Flash>{sent}</Flash>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

async function answerInvite(inv, status) {
  await updateDoc(inv.ref, { status, updatedAt: serverTimestamp() });
  await call('afterCaregiverChange', { patientId: inv.ref.parent.parent.id, caregiverUid: inv.id });
}

export function LegacyCaregivers() {
  const { user, patients, invitations } = useSession();
  const owned = patients.filter((p) => p.isOwner);
  const cared = patients.filter((p) => p.viaCaregiver);
  const [newName, setNewName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const add = useAction();
  const request = useAction();
  const respond = useAction();
  const [added, flashAdded] = useFlash();
  const [requested, flashRequested] = useFlash();

  return (
    <div className="stack-lg">
      {invitations.length ? (
        <section className="stack">
          <h2>คำเชิญถึงคุณ</h2>
          {invitations.map((inv) => (
            <Card key={inv.id} className="between list-item-wrap">
              <div>
                <strong>ช่วยดูแล {inv.patientDisplayName}</strong>
                <p className="muted small">{PERMS.filter(([k]) => inv.permissions[k]).map(([, l]) => l).join(' · ')}</p>
              </div>
              <div className="row">
                <Button size="sm" busy={respond.busy} onClick={() => respond.run(() => answerInvite(inv, 'active'))}>ตอบรับ</Button>
                <Button size="sm" variant="secondary" busy={respond.busy} onClick={() => respond.run(() => answerInvite(inv, 'declined'))}>ปฏิเสธ</Button>
              </div>
            </Card>
          ))}
          <ErrorText>{respond.error}</ErrorText>
        </section>
      ) : null}

      {cared.length ? (
        <section className="stack">
          <h2>คนที่คุณดูแล</h2>
          <div className="grid-cards">
            {cared.map((p) => (
              <a key={p.id} className="card card-link stack" href="#/meds" onClick={() => sessionStorage.setItem('medsPatient', p.id)}>
                <h3>{p.displayName}</h3>
                <span className="muted small">{PERMS.filter(([k]) => p.permissions[k]).map(([, l]) => l).join(' · ')}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="stack">
        <h2>ผู้ดูแลภายนอกบ้านของโปรไฟล์ที่คุณเป็นเจ้าของ</h2>
        {owned.map((p) => <OwnedProfile key={p.id} patient={p} />)}
      </section>

      <section className="stack">
        <h2>ขอสิทธิ์ช่วยดูแลคนนอกบ้าน</h2>
        <Card className="stack">
          <p className="muted small">ระบบจะส่งคำขอไปให้เจ้าของข้อมูลอนุมัติก่อน คุณจะยังไม่เห็นข้อมูลใด ๆ จนกว่าจะได้รับอนุมัติ</p>
          <form className="row" onSubmit={(e) => {
            e.preventDefault();
            request.run(() => call('requestCaregiverAccess', { ownerEmail }).then(() => { setOwnerEmail(''); flashRequested('ส่งคำขอแล้ว รอเจ้าของข้อมูลอนุมัติ'); }));
          }}>
            <input type="email" name="owner-email" inputMode="email" autoComplete="off" spellCheck={false} style={{ flex: '1 1 200px' }} required placeholder="อีเมลของเจ้าของข้อมูล เช่น name@example.com" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} aria-label="อีเมลเจ้าของข้อมูล" />
            <Button type="submit" busy={request.busy}>ส่งคำขอ</Button>
          </form>
          <Flash>{requested}</Flash>
          <ErrorText>{request.error}</ErrorText>
        </Card>
      </section>

    </div>
  );
}
