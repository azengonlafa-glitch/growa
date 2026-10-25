// Runs the project's callable Cloud Functions on Vercel.
// POST /api/call/<name>  { data }  with  Authorization: Bearer <Firebase ID token>
// Responses mirror Firebase callables: { result } or { error: { status, message } }.
import * as functions from '../../functions/index.js';
import { auth, HttpsError } from '../../functions/src/common.js';

const STATUS_CODES = {
  'invalid-argument': 400, 'failed-precondition': 400, 'out-of-range': 400,
  unauthenticated: 401, 'permission-denied': 403, 'not-found': 404,
  'already-exists': 409, aborted: 409, 'resource-exhausted': 429,
  unavailable: 503, internal: 500,
};

async function caller(req) {
  // The token normally comes in the Authorization header; it is also sent in the body, because a proxy in front of a deployment
  // (for example Vercel's deployment protection) may remove or replace that header. Both are tried.
  const header = req.headers.authorization ?? '';
  const candidates = [...new Set([
    header.startsWith('Bearer ') ? header.slice(7) : '',
    typeof req.body?.idToken === 'string' ? req.body.idToken : '',
  ].filter(Boolean))];
  for (const raw of candidates) {
    try {
      const token = await auth.verifyIdToken(raw);
      return { uid: token.uid, token };
    } catch (err) {
      // Handlers reject missing auth with their own message; the reason is passed along so the page can show why.
      req.authFailure = `${err?.code ?? 'error'}: ${String(err?.message ?? '').slice(0, 140)}`;
    }
  }
  return undefined;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { status: 'invalid-argument', message: 'POST only' } });
  const fn = functions[req.query.fn];
  // Only callables are exposed; triggers and schedules stay internal.
  if (!fn?.__endpoint?.callableTrigger) {
    return res.status(404).json({ error: { status: 'not-found', message: 'ไม่พบฟังก์ชันนี้' } });
  }
  try {
    const result = await fn.run({ auth: await caller(req), data: req.body?.data ?? {}, rawRequest: req });
    return res.status(200).json({ result: result ?? null });
  } catch (err) {
    if (err instanceof HttpsError) {
      const detail = err.code === 'unauthenticated' ? (req.authFailure ?? 'ไม่มีโทเค็นแนบมากับคำขอ') : undefined;
      if (detail) console.warn(`[auth] ${req.query.fn} refused: ${detail} (host ${req.headers.host}, header ${req.headers.authorization ? 'yes' : 'no'}, body token ${req.body?.idToken ? 'yes' : 'no'})`);
      return res.status(STATUS_CODES[err.code] ?? 500).json({ error: { status: err.code, message: err.message, ...(detail ? { detail } : {}) } });
    }
    console.error(req.query.fn, err);
    return res.status(500).json({ error: { status: 'internal', message: 'เกิดข้อผิดพลาดในระบบ' } });
  }
}
