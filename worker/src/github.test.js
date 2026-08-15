import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword, buildUpdatedHouses, applyToSiblings, encodeBase64Utf8, decodeBase64Utf8 } from './github.js';

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

test('applyToSiblings copies contact fields to every entry sharing the same address_title', () => {
  const houses = {
    '11322--41': { address_title: 'אח"י אילת 16', residents: 'משפחת כהן', phone: '050-1', contact_note: 'note', updated_by: 'יוסי', updated_at: '2026-08-12T10:00:00.000Z' },
    '11322--42': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11321--300': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = applyToSiblings(houses, 'אח"י אילת 16', {
    residents: 'משפחת כהן',
    phone: '050-1',
    contact_note: 'note',
    updated_by: 'יוסי',
    updated_at: '2026-08-12T10:00:00.000Z',
  });
  assert.equal(result['11322--42'].residents, 'משפחת כהן');
  assert.equal(result['11322--42'].phone, '050-1');
  assert.equal(result['11322--42'].contact_note, 'note');
  assert.equal(result['11322--42'].updated_by, 'יוסי');
  assert.equal(result['11322--42'].updated_at, '2026-08-12T10:00:00.000Z');
  assert.equal(result['11321--300'].residents, 'משפחת כהן');
});

test('applyToSiblings leaves address_title untouched on siblings', () => {
  const houses = {
    '11322--41': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--42': { address_title: 'אח"י אילת 16 b', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = applyToSiblings(houses, 'אח"י אילת 16', { residents: 'X', phone: '', contact_note: '', updated_by: '', updated_at: '' });
  assert.equal(result['11322--42'].address_title, 'אח"י אילת 16 b');
});

test('applyToSiblings does not touch entries with a different address_title', () => {
  const houses = {
    '11322--41': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--55': { address_title: 'אח"י אילת 12', residents: 'משפחת לוי', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = applyToSiblings(houses, 'אח"י אילת 16', { residents: 'X', phone: '', contact_note: '', updated_by: '', updated_at: '' });
  assert.deepEqual(result['11322--55'], houses['11322--55']);
});

test('applyToSiblings does not touch entries with an empty address_title', () => {
  const houses = {
    '11322--41': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--48': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = applyToSiblings(houses, 'אח"י אילת 16', { residents: 'X', phone: '', contact_note: '', updated_by: '', updated_at: '' });
  assert.deepEqual(result['11322--48'], houses['11322--48']);
});

test('applyToSiblings is a no-op (returns data unchanged in content) when address_title argument is empty', () => {
  const houses = {
    '11322--48': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--49': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = applyToSiblings(houses, '', { residents: 'X', phone: '', contact_note: '', updated_by: '', updated_at: '' });
  assert.deepEqual(result, houses);
});

test('applyToSiblings does not mutate its input', () => {
  const houses = {
    '11322--41': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--42': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  applyToSiblings(houses, 'אח"י אילת 16', { residents: 'X', phone: '', contact_note: '', updated_by: '', updated_at: '' });
  assert.equal(houses['11322--42'].residents, '');
});

test('buildUpdatedHouses propagates contact fields to siblings sharing the updated address_title', () => {
  const existing = {
    '11322--41': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--42': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11321--300': { address_title: 'אח"י אילת 16', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--55': { address_title: 'אח"י אילת 12', residents: 'משפחת לוי', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--48': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = buildUpdatedHouses(
    existing,
    '11322--41',
    { residents: 'משפחת כהן', phone: '050-1234567', contact_note: 'הערה', updated_by: 'יוסי' },
    '2026-08-12T10:00:00.000Z',
  );

  // Siblings sharing the same address_title get the contact fields too.
  assert.equal(result['11322--42'].residents, 'משפחת כהן');
  assert.equal(result['11322--42'].phone, '050-1234567');
  assert.equal(result['11322--42'].contact_note, 'הערה');
  assert.equal(result['11322--42'].updated_by, 'יוסי');
  assert.equal(result['11322--42'].updated_at, '2026-08-12T10:00:00.000Z');
  assert.equal(result['11321--300'].residents, 'משפחת כהן');

  // address_title itself is left alone on siblings.
  assert.equal(result['11322--42'].address_title, 'אח"י אילת 16');
  assert.equal(result['11321--300'].address_title, 'אח"י אילת 16');

  // Entries with a different address_title are untouched.
  assert.deepEqual(result['11322--55'], existing['11322--55']);

  // Entries with an empty address_title are untouched.
  assert.deepEqual(result['11322--48'], existing['11322--48']);
});

test('buildUpdatedHouses does not propagate when the updated entry has an empty address_title', () => {
  const existing = {
    '11322--48': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
    '11322--49': { address_title: '', residents: '', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  };
  const result = buildUpdatedHouses(
    existing,
    '11322--48',
    { residents: 'משפחת כהן' },
    '2026-08-12T10:00:00.000Z',
  );
  assert.equal(result['11322--48'].residents, 'משפחת כהן');
  assert.deepEqual(result['11322--49'], existing['11322--49']);
});
