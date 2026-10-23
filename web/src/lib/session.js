// Who is signed in and what they can reach: own profile, patient profiles
// (own + cared-for), and pharmacies where they work.
import { createContext, useContext, useEffect, useState } from 'react';
import { collection, collectionGroup, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useDocData, useQueryData } from './hooks.js';

export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function useSessionData(user) {
  const uid = user?.uid ?? null;
  const [profile, profileLoading] = useDocData(uid ? doc(db, 'users', uid) : null, [uid]);
  const [owned, ownedLoading] = useQueryData(
    uid ? query(collection(db, 'patients'), where('ownerUid', '==', uid)) : null, [uid],
  );
  const [links] = useQueryData(
    uid ? query(collectionGroup(db, 'caregivers'), where('caregiverUid', '==', uid)) : null, [uid],
  );

  // Profiles shared with me as an active caregiver.
  const [cared, setCared] = useState([]);
  const activeKey = links.filter((l) => l.status === 'active').map((l) => l.ref.parent.parent.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = activeKey ? activeKey.split(',') : [];
    Promise.all(ids.map(async (pid) => {
      const snap = await getDoc(doc(db, 'patients', pid));
      const link = links.find((l) => l.ref.parent.parent.id === pid);
      return snap.exists() ? { id: pid, ...snap.data(), permissions: link?.permissions ?? {}, viaCaregiver: true } : null;
    })).then((rows) => !cancelled && setCared(rows.filter(Boolean)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // Pharmacies where I am active staff (approved partner stores only).
  const [staffOf, setStaffOf] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    (async () => {
      const stores = await getDocs(query(collection(db, 'pharmacies'), where('verificationStatus', '==', 'approved')));
      const mine = [];
      for (const s of stores.docs) {
        const staff = await getDoc(doc(db, 'pharmacies', s.id, 'staff', uid));
        if (staff.exists() && staff.data().active) mine.push({ pharmacyId: s.id, pharmacy: s.data(), ...staff.data() });
      }
      if (!cancelled) setStaffOf(mine);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [uid]);

  const ownedFull = owned.map((p) => ({ ...p, isOwner: true }));
  return {
    user,
    profile,
    loading: profileLoading || ownedLoading,
    patients: [...ownedFull.sort((a, b) => Number(b.isSelf) - Number(a.isSelf)), ...cared],
    invitations: links.filter((l) => l.status === 'invited'),
    staffOf,
  };
}

// Can the current user do `perm` on this patient? Owners can do everything.
export const can = (patient, perm) => Boolean(patient?.isOwner || patient?.permissions?.[perm]);
