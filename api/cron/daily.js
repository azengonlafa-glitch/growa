// Daily job (Vercel Cron, 06:00 Bangkok): refresh every medication's stock
// estimate and send refill alerts. Vercel signs cron calls with CRON_SECRET.
import { recalculateAllMedications } from '../../functions/src/care.js';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const count = await recalculateAllMedications();
  return res.status(200).json({ recalculated: count });
}
