import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parcelKey, buildCqlFilter, mergeParcelWithHouse, formatUpdatedLine } from './lib.js';

test('parcelKey joins gush and parcel with --', () => {
  assert.equal(parcelKey(11322, 41), '11322--41');
});

test('buildCqlFilter builds an OR-chain of GUSH_NUM/PARCEL pairs', () => {
  const filter = buildCqlFilter([
    { gush: 11322, parcel: 41 },
    { gush: 11322, parcel: 55 },
  ]);
  assert.equal(filter, '(GUSH_NUM=11322 AND PARCEL=41) OR (GUSH_NUM=11322 AND PARCEL=55)');
});

test('mergeParcelWithHouse returns empty defaults when parcel has no house data', () => {
  const result = mergeParcelWithHouse('11322--41', {});
  assert.equal(result.id, '11322--41');
  assert.equal(result.address_title, '');
  assert.equal(result.hasData, false);
});

test('mergeParcelWithHouse marks hasData true when any contact field is set', () => {
  const result = mergeParcelWithHouse('11322--41', {
    '11322--41': { address_title: 'אח"י אילת 16', residents: 'משפחת כהן', phone: '', contact_note: '', updated_by: '', updated_at: '' },
  });
  assert.equal(result.hasData, true);
  assert.equal(result.residents, 'משפחת כהן');
});

test('formatUpdatedLine returns placeholder when never updated', () => {
  assert.equal(formatUpdatedLine('', ''), 'טרם עודכן');
});

test('formatUpdatedLine formats name and date when updated', () => {
  const line = formatUpdatedLine('יוסי', '2026-08-12T10:00:00Z');
  assert.match(line, /^עודכן ע"י יוסי בתאריך/);
});
