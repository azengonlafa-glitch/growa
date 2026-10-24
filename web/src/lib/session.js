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

  // Profiles shared with me as an active caregiver. The patient documents are fetched once per profile (retrying while the
  // server is still applying an accepted invitation), but the permissions come straight from the live link so a change
  // by the owner shows up at once.
  const [caredDocs, setCaredDocs] = useState({});
  const activeKey = links.filter((l) => l.status === 'active').map((l) => l.ref.parent.parent.id).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = activeKey ? activeKey.split(',') : [];
    const load = async (pid, attempt = 0) => {
      try {
        const snap = await getDoc(doc(db, 'patients', pid));
        if (!cancelled && snap.exists()) setCaredDocs((prev) => ({ ...prev, [pid]: snap.data() }));
      } catch (err) {
        // Right after "accept" the local write is visible before the server has it, so the first read can be refused.
        if (!cancelled && attempt < 5) setTimeout(() => load(pid, attempt + 1), 600 * (attempt + 1));
      }
    };
    ids.forEach((pid) => load(pid));
    return () => { cancelled = true; };
  }, [activeKey]);
  const cared = links
    .filter((l) => l.status === 'active' && caredDocs[l.ref.parent.parent.id])
    .map((l) => ({ id: l.ref.parent.parent.id, ...caredDocs[l.ref.parent.parent.id], permissions: l.permissions ?? {}, viaCaregiver: true }));

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
