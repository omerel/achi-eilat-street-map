import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword, buildUpdatedHouses, encodeBase64Utf8, decodeBase64Utf8 } from './github.js';

test('checkPassword accepts an exact match', () => {
  assert.equal(checkPassword('secret123', 'secret123'), true);
});

test('checkPassword rejects a mismatch', () => {
  assert.equal(checkPassword('wrong', 'secret123'), false);
});

test('checkPassword rejects empty submitted password', () => {
  assert.equal(checkPassword('', 'secret123'), false);
});

test('buildUpdatedHouses adds a new entry without touching other houses', () => {
  const existing = {
    '11322--55': { address_title: 'אח"י אילת 12', residents: 'משפחת לוי', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = buildUpdatedHouses(
    existing,
    '11322--41',
    { address_title: 'אח"י אילת 16', residents: 'משפחת כהן', phone: '050-1234567', contact_note: '', updated_by: 'יוסי' },
    '2026-08-12T10:00:00.000Z',
  );
  assert.deepEqual(result['11322--55'], existing['11322--55']);
  assert.equal(result['11322--41'].residents, 'משפחת כהן');
  assert.equal(result['11322--41'].updated_at, '2026-08-12T10:00:00.000Z');
});

test('buildUpdatedHouses does not mutate the input object', () => {
  const existing = { '11322--41': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' } };
  buildUpdatedHouses(existing, '11322--41', { residents: 'שינוי' }, '2026-08-12T10:00:00.000Z');
  assert.equal(existing['11322--41'].residents, '');
});

test('base64 UTF-8 roundtrip preserves Hebrew text', () => {
  const original = 'משפחת כהן, אח"י אילת 16';
  const roundtripped = decodeBase64Utf8(encodeBase64Utf8(original));
  assert.equal(roundtripped, original);
});
