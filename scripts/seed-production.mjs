// Seeds a REAL Firebase project with the shared data the app needs:
//   - drug catalog (sample classes, review with a pharmacist before real use)
//   - 2 fictional partner pharmacies with sample products (marked sample: true)
//   - the FDA licensed-pharmacy directory (3,260 Bangkok stores)
// It creates no user accounts and no passwords.
//
//   node scripts/seed-production.mjs --yes [--admin-email you@example.com]
//                                          [--pharmacist-email friend@example.com]
//
// Needs FIREBASE_SERVICE_ACCOUNT_FILE=path/to/service-account.json (or the
// JSON itself in FIREBASE_SERVICE_ACCOUNT). Sign the people up in the app
// first; --admin-email makes that user a platform admin, --pharmacist-email
// makes that user the verified pharmacist of the demo partner store demoRx1.
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { seedCatalogAndPharmacies, seedDirectory } from './seed-data.mjs';

const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];

const json = process.env.FIREBASE_SERVICE_ACCOUNT
  ?? (process.env.FIREBASE_SERVICE_ACCOUNT_FILE ? readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8') : null);
if (!json) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT_FILE (path to the service-account JSON).');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is set; this script is for a real project. Use npm run seed for the emulator.');
  process.exit(1);
}

const account = JSON.parse(json);
initializeApp({ credential: cert(account) });
if (!args.includes('--yes')) {
  console.log(`This will write shared sample data to project "${account.project_id}".`);
  console.log('Re-run with --yes to continue.');
  process.exit(0);
}

const db = getFirestore();
const auth = getAuth();

await seedCatalogAndPharmacies(db);
const count = await seedDirectory(db);
console.log(`Seeded catalog, 2 sample partner pharmacies and ${count} FDA-licensed pharmacies.`);

if (args.includes('--admin-email')) {
  const user = await auth.getUserByEmail(flag('--admin-email'));
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  console.log(`${user.email} is now a platform admin (sign out and in again to refresh the token).`);
}
if (args.includes('--pharmacist-email')) {
  const user = await auth.getUserByEmail(flag('--pharmacist-email'));
  await db.doc(`pharmacies/demoRx1/staff/${user.uid}`).set({
    role: 'pharmacist', displayName: user.displayName ?? user.email,
    licenseNo: 'DEMO-PH-01', licenseVerified: true, active: true,
  });
  console.log(`${user.email} is now the verified pharmacist of demoRx1 (sample store).`);
}
