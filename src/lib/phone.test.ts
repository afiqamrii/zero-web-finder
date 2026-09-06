import { describe, it, expect } from 'vitest';
import { sanitizePhone } from './phone';

describe('sanitizePhone', () => {
  it('handles standard Malaysian numbers starting with 0', () => {
    expect(sanitizePhone('012-345 6789')).toBe('60123456789');
    expect(sanitizePhone('03-12345678')).toBe('60312345678');
  });

  it('handles numbers already in +60 format', () => {
    expect(sanitizePhone('+60 12-345 6789')).toBe('60123456789');
    expect(sanitizePhone('+60312345678')).toBe('60312345678');
  });

  it('handles numbers already in 60 format', () => {
    expect(sanitizePhone('60123456789')).toBe('60123456789');
    expect(sanitizePhone('60 12 345 6789')).toBe('60123456789');
  });

  it('handles non-Malaysian numbers', () => {
    expect(sanitizePhone('+1 555 123 4567')).toBe('15551234567');
  });

  it('returns null for empty or invalid inputs', () => {
    expect(sanitizePhone(null)).toBeNull();
    expect(sanitizePhone(undefined)).toBeNull();
    expect(sanitizePhone('')).toBeNull();
    expect(sanitizePhone('invalid')).toBeNull();
    expect(sanitizePhone('123')).toBeNull(); // too short
  });
});
