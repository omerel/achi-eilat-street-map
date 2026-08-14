import { writeFile } from 'node:fs/promises';
import { polygonCentroid, distanceToPolylineMeters } from './geo.js';
import { buildAddressTitle } from './address.js';

const WFS_URL = 'https://open.govmap.gov.il/geoserver/opendata/ows';
// Padded bounding box (EPSG:4326, minlon,minlat,maxlon,maxlat) around the
// Achi Eilat street way in OSM, padded ~150m to catch parcels on both sides.
const BBOX = '34.9477584,32.5793281,34.9528707,32.5830575';
const NOMINATIM_DELAY_MS = 1100; // Nominatim usage policy: max 1 request/second
// Real mapped geometry of Achi Eilat street (OpenStreetMap way 122157388).
const STREET_LINE = [
  [34.9491584, 32.5818575],
  [34.9497338, 32.5817306],
  [34.9500814, 32.5815113],
  [34.9504314, 32.5812560],
  [34.9506277, 32.5811073],
  [34.9508199, 32.5809753],
  [34.9514707, 32.5805281],
];
const STREET_BUFFER_METERS = 55;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchParcelsInBbox() {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'opendata:PARCEL_ALL',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    bbox: `${BBOX},EPSG:4326`,
  });
  const response = await fetch(`${WFS_URL}?${params.toString()}`);
  const data = await response.json();
  return data.features;
}

async function reverseGeocode(lon, lat) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'achi-eilat-street-map-seed-script/1.0' },
  });
  const data = await response.json();
  return data.address || {};
}

async function main() {
  console.log('Fetching parcels from GovMap WFS...');
  const features = await fetchParcelsInBbox();
  console.log(`Fetched ${features.length} candidate parcels, reverse-geocoding each (rate-limited)...`);

  const parcelIds = [];
  const houses = {};

  for (const feature of features) {
    const [lon, lat] = polygonCentroid(feature.geometry.coordinates);
    const address = await reverseGeocode(lon, lat);
    await sleep(NOMINATIM_DELAY_MS);

    const distanceMeters = distanceToPolylineMeters([lon, lat], STREET_LINE);
    if (distanceMeters > STREET_BUFFER_METERS) continue;

    const gush = feature.properties.GUSH_NUM;
    const parcel = feature.properties.PARCEL;
    const id = `${gush}--${parcel}`;
    const addressTitle = buildAddressTitle(address.road, address.house_number);

    parcelIds.push({ id, gush, parcel });
    houses[id] = {
      address_title: addressTitle,
      residents: '',
      phone: '',
      contact_note: '',
      updated_by: '',
      updated_at: '',
    };
    console.log(`  included ${id} (${distanceMeters.toFixed(1)}m) -> ${addressTitle || '(אין כתובת ידועה)'}`);
  }

  await writeFile('data/parcelIds.json', JSON.stringify(parcelIds, null, 2));
  await writeFile('houses.json', JSON.stringify(houses, null, 2));
  console.log(`Done. ${parcelIds.length} parcels within ${STREET_BUFFER_METERS}m of the street were written.`);
}

main();
