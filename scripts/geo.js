export function polygonCentroid(multiPolygonCoordinates) {
  const ring = multiPolygonCoordinates[0][0];
  const points = ring.slice(0, -1); // drop the closing point (duplicate of the first)
  const sum = points.reduce((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

export function distanceToPolylineMeters(point, polyline) {
  const [px, py] = point;
  let best = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const [ax, ay] = polyline[i];
    const [bx, by] = polyline[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    let t = dx === 0 && dy === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const distDegrees = Math.hypot(px - cx, py - cy);
    const distMeters = distDegrees * 111320;
    if (distMeters < best) best = distMeters;
  }
  return best;
}
