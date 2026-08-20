/**
 * Dependency-free phone helpers shared by API, worker and web.
 * Strict per-country validation happens on the API with libphonenumber-js;
 * this is the normalization everything else agrees on.
 */

export interface NormalizedPhone {
  /** Digits only, country code included, no '+' — the form Evolution API wants. */
  digits: string;
  /** Human/E.164 form with a leading '+'. */
  e164: string;
}

/** Default country dialling code used when a number is written in local form. */
export const DEFAULT_COUNTRY_CODE = '20'; // Egypt; overridable per organization

export function normalizePhone(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): NormalizedPhone | null {
  if (!raw) return null;

  let value = String(raw).trim();
  // Arabic-Indic digits -> ASCII
  value = value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  value = value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  const hadPlus = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!hadPlus) {
    // Local form: drop a single trunk '0' and prefix the country code.
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (!digits.startsWith(countryCode)) digits = countryCode + digits;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return { digits, e164: `+${digits}` };
}

export function isValidPhone(raw: string | null | undefined, countryCode?: string): boolean {
  return normalizePhone(raw, countryCode) !== null;
}

/** WhatsApp JID used by Evolution API for an individual chat. */
export function toWhatsAppJid(digits: string): string {
  return digits.includes('@') ? digits : `${digits}@s.whatsapp.net`;
}
