// Cloud Storage rules tests (cross-service checks read the Firestore emulator).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';

let env;
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const storage = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
const upload = (uid, path, bytes, contentType) => uploadBytes(ref(storage(uid), path), bytes, { contentType });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-medilink',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.firestore();
    await setDoc(doc(s, 'pharmacies/newRx'), { verificationStatus: 'needs_changes' });
    await setDoc(doc(s, 'pharmacies/newRx/staff/owner'), { role: 'owner', active: true });
    await setDoc(doc(s, 'pharmacies/newRx/staff/clerk'), { role: 'staff', active: true });
    await setDoc(doc(s, 'pharmacies/liveRx'), { verificationStatus: 'approved' });
    await setDoc(doc(s, 'pharmacies/liveRx/staff/owner2'), { role: 'owner', active: true });
    await setDoc(doc(s, 'pharmacies/liveRx/staff/clerk2'), { role: 'staff', active: true });
    await setDoc(doc(s, 'patients/mom'), { ownerUid: 'mom' });
    await setDoc(doc(s, 'patients/mom/caregivers/son'), {
      status: 'active', permissions: { viewMeds: true, editMeds: false },
    });
  });
});

describe('pharmacy licence documents', () => {
  test('only the owner uploads, only while the application is open', async () => {
    await assertSucceeds(upload('owner', 'pharmacies/newRx/verification/license.pdf', pdf, 'application/pdf'));
    await assertFails(upload('clerk', 'pharmacies/newRx/verification/x.pdf', pdf, 'application/pdf'));
    await assertFails(upload('owner2', 'pharmacies/liveRx/verification/late.pdf', pdf, 'application/pdf'));
  });

  test('rejects non-document files and overwrites', async () => {
    await assertFails(upload('owner', 'pharmacies/newRx/verification/run.exe', pdf, 'application/x-msdownload'));
    await assertSucceeds(upload('owner', 'pharmacies/newRx/verification/a.pdf', pdf, 'application/pdf'));
    await assertFails(upload('owner', 'pharmacies/newRx/verification/a.pdf', pdf, 'application/pdf'));
  });

  test('documents are private to the store and admins', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      uploadBytes(ref(ctx.storage(), 'pharmacies/newRx/verification/a.pdf'), pdf, { contentType: 'application/pdf' }));
    await assertSucceeds(getMetadata(ref(env.authenticatedContext('admin', { admin: true }).storage(), 'pharmacies/newRx/verification/a.pdf')));
    await assertFails(getMetadata(ref(storage('clerk'), 'pharmacies/newRx/verification/a.pdf')));
    await assertFails(getMetadata(ref(storage(null), 'pharmacies/newRx/verification/a.pdf')));
  });
});

describe('product images', () => {
  test('staff upload images; public can view approved stores only', async () => {
    await assertSucceeds(upload('clerk2', 'pharmacies/liveRx/products/p1/main.png', png, 'image/png'));
    await assertFails(upload('owner', 'pharmacies/liveRx/products/p1/x.png', png, 'image/png'));
    await assertFails(upload('clerk2', 'pharmacies/liveRx/products/p1/doc.pdf', pdf, 'application/pdf'));
    await assertSucceeds(getMetadata(ref(storage(null), 'pharmacies/liveRx/products/p1/main.png')));

    await env.withSecurityRulesDisabled((ctx) =>
      uploadBytes(ref(ctx.storage(), 'pharmacies/newRx/products/p1/main.png'), png, { contentType: 'image/png' }));
    await assertFails(getMetadata(ref(storage(null), 'pharmacies/newRx/products/p1/main.png')));
  });
});

describe('patient documents', () => {
  test('owner and permitted caregivers only', async () => {
    await assertSucceeds(upload('mom', 'patients/mom/documents/label.jpg', png, 'image/jpeg'));
    await assertFails(upload('son', 'patients/mom/documents/x.jpg', png, 'image/jpeg')); // no editMeds
    await assertSucceeds(getMetadata(ref(storage('son'), 'patients/mom/documents/label.jpg'))); // viewMeds
    await assertFails(getMetadata(ref(storage('stranger'), 'patients/mom/documents/label.jpg')));
    await assertFails(getMetadata(ref(env.authenticatedContext('admin', { admin: true }).storage(), 'patients/mom/documents/label.jpg')));
  });
});
