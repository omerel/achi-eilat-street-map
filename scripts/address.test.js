import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesStreet, buildAddressTitle } from './address.js';

test('matchesStreet is true when the road name contains the target substring', () => {
  assert.equal(matchesStreet('אח"י אילת', 'אילת'), true);
});

test('matchesStreet is false for a different street', () => {
  assert.equal(matchesStreet('פינלס', 'אילת'), false);
});

test('matchesStreet is false when road is missing', () => {
  assert.equal(matchesStreet(undefined, 'אילת'), false);
});

test('buildAddressTitle joins road and house number', () => {
  assert.equal(buildAddressTitle('אח"י אילת', '16'), 'אח"י אילת 16');
});

test('buildAddressTitle falls back to just the road when house number is missing', () => {
  assert.equal(buildAddressTitle('אח"י אילת', undefined), 'אח"י אילת');
});

test('buildAddressTitle returns empty string when road is missing', () => {
  assert.equal(buildAddressTitle(undefined, '16'), '');
});
