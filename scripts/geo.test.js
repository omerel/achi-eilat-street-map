import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polygonCentroid, distanceToPolylineMeters } from './geo.js';

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

test('distanceToPolylineMeters returns near-zero for a point on the line', () => {
  const polyline = [[34.95, 32.58], [34.96, 32.58]];
  const dist = distanceToPolylineMeters([34.955, 32.58], polyline);
  assert.ok(dist < 1);
});

test('distanceToPolylineMeters measures perpendicular distance from an offset point', () => {
  const polyline = [[34.95, 32.58], [34.96, 32.58]];
  // ~0.0009 degrees of latitude north of the line ≈ 100m under the 111320 approximation
  const dist = distanceToPolylineMeters([34.955, 32.5809], polyline);
  assert.ok(dist > 90 && dist < 110, `expected ~100m, got ${dist}`);
});
