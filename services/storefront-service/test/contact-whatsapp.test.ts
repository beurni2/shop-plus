import { describe, expect, it } from 'vitest';
import { whatsappDigits } from '../src/customer-projection.js';

/**
 * CONTACT-WHATSAPP-1 — the registration phone → wa.me digits, pinned value by
 * value: this string becomes a tappable link on a buyer's screen, and a wrong
 * transform is a dead chat with the wrong stranger.
 */
describe('whatsappDigits — the one deterministic transform between her signup and her buyers', () => {
  it('a bare 8-digit Burkina number gains the country code', () => {
    expect(whatsappDigits('70112233')).toBe('22670112233');
  });
  it('separators and the international dress all normalize to the same digits', () => {
    for (const forme of ['+226 70 11 22 33', '00226 70 11 22 33', '226-70-11-22-33', ' 226.70.11.22.33 ', '(226) 70 11 22 33']) {
      expect(whatsappDigits(forme), forme).toBe('22670112233');
    }
  });
  it('a local number with separators still gets the prefix', () => {
    expect(whatsappDigits('70 11 22 33')).toBe('22670112233');
  });
  it('a foreign international number is carried as she gave it (10–15 digits)', () => {
    expect(whatsappDigits('+33612345678')).toBe('33612345678');
    expect(whatsappDigits('12125551234')).toBe('12125551234');
  });
  it('what cannot be vouched for is undefined — never a dead link', () => {
    for (const mauvais of ['', '   ', 'abc', '70 11 22', '123456789', '1234567890123456', '70a12233', '+22-670', '70112233x']) {
      expect(whatsappDigits(mauvais), JSON.stringify(mauvais)).toBeUndefined();
    }
  });
});
