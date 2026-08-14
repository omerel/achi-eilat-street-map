export function polygonCentroid(multiPolygonCoordinates) {
  const ring = multiPolygonCoordinates[0][0];
  const points = ring.slice(0, -1); // drop the closing point (duplicate of the first)
  const sum = points.reduce((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}
