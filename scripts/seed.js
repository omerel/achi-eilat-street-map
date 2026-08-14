import { writeFile } from 'node:fs/promises';
import { polygonCentroid } from './geo.js';
import { matchesStreet, buildAddressTitle } from './address.js';

const WFS_URL = 'https://open.govmap.gov.il/geoserver/opendata/ows';
// Padded bounding box (EPSG:4326, minlon,minlat,maxlon,maxlat) around the
// Achi Eilat street way in OSM, padded ~150m to catch parcels on both sides.
const BBOX = '34.9477584,32.5793281,34.9528707,32.5830575';
const STREET_SUBSTRING = 'אילת';
const NOMINATIM_DELAY_MS = 1100; // Nominatim usage policy: max 1 request/second

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

    if (!matchesStreet(address.road, STREET_SUBSTRING)) continue;

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
    console.log(`  matched ${id} -> ${addressTitle}`);
  }

  await writeFile('data/parcelIds.json', JSON.stringify(parcelIds, null, 2));
  await writeFile('houses.json', JSON.stringify(houses, null, 2));
  console.log(`Done. ${parcelIds.length} parcels matched "${STREET_SUBSTRING}" and were written.`);
}

main();
