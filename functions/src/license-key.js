// Normalises a Thai drug-store licence number so "ขย1 กท 193/2562",
// "ขย.1 กท.193/2562" and "ขย 1 กท 193 / 2562" all compare equal.
export function licenseKey(licenseNo) {
  return String(licenseNo ?? '').replace(/[\s.]/g, '').toLowerCase();
}
