import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polygonCentroid } from './geo.js';

test('polygonCentroid averages the exterior ring vertices of a MultiPolygon', () => {
  // A unit square: (0,0) (0,2) (2,2) (2,0), closed back to (0,0)
  const multiPolygonCoords = [
    [
      [
        [0, 0],
        [0, 2],
        [2, 2],
        [2, 0],
        [0, 0],
      ],
    ],
  ];
  const [lon, lat] = polygonCentroid(multiPolygonCoords);
  assert.equal(lon, 1);
  assert.equal(lat, 1);
});
