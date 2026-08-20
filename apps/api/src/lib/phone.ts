import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { normalizePhone } from '@sendwhats/shared';

/**
 * Normalizes to digits-only international form and validates with libphonenumber
 * when the number parses; falls back to the shared length heuristic otherwise
 * (some valid regional numbers aren't in libphonenumber's metadata).
 */
export function normalizeAndValidate(
  raw: string | null | undefined,
  countryCode = '20',
): { ok: true; digits: string; e164: string } | { ok: false; reason: string } {
  const normalized = normalizePhone(raw, countryCode);
  if (!normalized) return { ok: false, reason: 'Phone number is missing or malformed' };

  const parsed = parsePhoneNumberFromString(normalized.e164);
  if (parsed && !parsed.isValid()) {
    return { ok: false, reason: `"${raw}" is not a valid phone number` };
  }

  return { ok: true, digits: normalized.digits, e164: normalized.e164 };
}
