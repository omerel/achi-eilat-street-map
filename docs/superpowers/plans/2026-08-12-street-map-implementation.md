# מפת שכונה — אח"י אילת Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a free, zero-cost community website that shows the ~40 houses on Achi Eilat street (Zichron Yaakov) as clickable cadastral parcels on a map, with editable owner/contact info protected by a shared password.

**Architecture:** Static single-page site (Leaflet.js, no framework) hosted on GitHub Pages. Reads: government WFS (parcel polygons), Esri World Imagery (aerial basemap), and `houses.json` from `raw.githubusercontent.com`. Writes: a small Cloudflare Worker that checks a shared password and commits updates to `houses.json` via the GitHub Contents API using a scoped token.

**Tech Stack:** Vanilla JS (ES modules), Leaflet.js (via CDN), Node.js 22 (build-time scripts + tests, `node --test`), Cloudflare Workers (wrangler), GitHub Pages, GitHub Contents API.

## Global Constraints

- Zero cost: every service used (GitHub Pages, Cloudflare Workers free tier, GovMap WFS, Esri World Imagery, Nominatim) must require no paid plan and no API key.
- No build step for the site itself — plain HTML/CSS/JS served as-is by GitHub Pages.
- UI language is Hebrew, `dir="rtl"`.
- Editing uses one shared password for the whole street (no per-user accounts).
- `GITHUB_TOKEN` used by the Worker must be a fine-grained PAT scoped to `Contents:Write` on this one repo only.
- Any user-entered text (names, notes) is rendered via `textContent`/DOM APIs, never `innerHTML`, to prevent stored XSS.
- `updated_at` is always set server-side by the Worker from `new Date().toISOString()`, never trusted from the client.
- The site must not be indexed by search engines: `robots.txt` disallows all, and `index.html` has `<meta name="robots" content="noindex, nofollow">`.
- Map polygons shown must be limited to parcels on Achi Eilat street only (not a generic bounding-box area), per the approved design.

---

### Task 1: Project scaffolding + GitHub repo

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Modify: (none — repo already exists locally at `/home/omer/Projects/achi-eilat-street-map` with the design spec committed)

**Interfaces:**
- Produces: a GitHub remote named `origin` on a public repo, and the value of `REPO_FULL_NAME` (e.g. `someuser/achi-eilat-street-map`) that later tasks (7, 9) need to build `raw.githubusercontent.com` URLs.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "achi-eilat-street-map",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "seed": "node scripts/seed.js"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
worker/.wrangler/
worker/.dev.vars
.DS_Store
```

- [ ] **Step 3: Create the GitHub repo and push**

Run from `/home/omer/Projects/achi-eilat-street-map`:

```bash
gh repo create achi-eilat-street-map --public --source=. --remote=origin
git add package.json .gitignore
git commit -m "chore: scaffold project"
git branch -M main
git push -u origin main
```

This must be a **public** repo — GitHub Pages' free tier requires it. Confirm with the user before running `gh repo create` if not already confirmed (creating a public repo and pushing is a visible, hard-to-fully-reverse action).

- [ ] **Step 4: Record the repo full name for later tasks**

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

Write down this output (e.g. `someuser/achi-eilat-street-map`) — Tasks 7 and 9 need it as `REPO_FULL_NAME` to build `https://raw.githubusercontent.com/REPO_FULL_NAME/main/houses.json`.

---

### Task 2: Shared frontend pure logic (`js/lib.js`)

**Files:**
- Create: `js/lib.js`
- Test: `js/lib.test.js`

**Interfaces:**
- Produces: `parcelKey(gushNum, parcel)`, `buildCqlFilter(parcelIds)`, `mergeParcelWithHouse(parcelId, housesData)`, `formatUpdatedLine(updatedBy, updatedAtIso)` — all pure functions, no DOM/network. Consumed by `js/app.js` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `js/lib.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test js/lib.test.js`
Expected: FAIL — `js/lib.js` does not exist yet (module not found).

- [ ] **Step 3: Write `js/lib.js`**

```javascript
export function parcelKey(gushNum, parcel) {
  return `${gushNum}--${parcel}`;
}

export function buildCqlFilter(parcelIds) {
  return parcelIds
    .map(({ gush, parcel }) => `(GUSH_NUM=${gush} AND PARCEL=${parcel})`)
    .join(' OR ');
}

export function mergeParcelWithHouse(parcelId, housesData) {
  const house = housesData[parcelId] || {};
  return {
    id: parcelId,
    address_title: house.address_title || '',
    residents: house.residents || '',
    phone: house.phone || '',
    contact_note: house.contact_note || '',
    updated_by: house.updated_by || '',
    updated_at: house.updated_at || '',
    hasData: Boolean(house.residents || house.phone || house.contact_note),
  };
}

export function formatUpdatedLine(updatedBy, updatedAtIso) {
  if (!updatedBy || !updatedAtIso) return 'טרם עודכן';
  const date = new Date(updatedAtIso);
  return `עודכן ע"י ${updatedBy} בתאריך ${date.toLocaleDateString('he-IL')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test js/lib.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add js/lib.js js/lib.test.js
git commit -m "feat: add shared frontend pure logic for parcel/house data"
git push
```

---

### Task 3: Geo + address pure logic (`scripts/geo.js`, `scripts/address.js`)

**Files:**
- Create: `scripts/geo.js`
- Create: `scripts/geo.test.js`
- Create: `scripts/address.js`
- Create: `scripts/address.test.js`

**Interfaces:**
- Produces: `polygonCentroid(multiPolygonCoordinates)` from `scripts/geo.js`; `matchesStreet(roadName, streetSubstring)` and `buildAddressTitle(road, houseNumber)` from `scripts/address.js`. Consumed by `scripts/seed.js` (Task 4).

- [ ] **Step 1: Write the failing test for `polygonCentroid`**

Create `scripts/geo.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/geo.test.js`
Expected: FAIL — `scripts/geo.js` does not exist yet.

- [ ] **Step 3: Write `scripts/geo.js`**

```javascript
export function polygonCentroid(multiPolygonCoordinates) {
  const ring = multiPolygonCoordinates[0][0];
  const points = ring.slice(0, -1); // drop the closing point (duplicate of the first)
  const sum = points.reduce((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/geo.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing tests for address helpers**

Create `scripts/address.test.js`:

```javascript
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test scripts/address.test.js`
Expected: FAIL — `scripts/address.js` does not exist yet.

- [ ] **Step 7: Write `scripts/address.js`**

```javascript
export function matchesStreet(roadName, streetSubstring) {
  if (!roadName) return false;
  return roadName.includes(streetSubstring);
}

export function buildAddressTitle(road, houseNumber) {
  if (!road) return '';
  return houseNumber ? `${road} ${houseNumber}` : road;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test scripts/address.test.js`
Expected: PASS (9 tests total across both files)

- [ ] **Step 9: Commit**

```bash
git add scripts/geo.js scripts/geo.test.js scripts/address.js scripts/address.test.js
git commit -m "feat: add geo centroid and address-matching pure logic"
git push
```

---

### Task 4: Seed script — generate `data/parcelIds.json` and `houses.json`

**Files:**
- Create: `scripts/seed.js`
- Create: `data/parcelIds.json` (generated output)
- Create: `houses.json` (generated output)

**Interfaces:**
- Consumes: `polygonCentroid` from `scripts/geo.js`, `matchesStreet`/`buildAddressTitle` from `scripts/address.js` (Task 3).
- Produces: `data/parcelIds.json` — `[{ "id": "<gush>--<parcel>", "gush": number, "parcel": number }, ...]`. `houses.json` — `{ "<id>": { address_title, residents: "", phone: "", contact_note: "", updated_by: "", updated_at: "" }, ... }`. Consumed by `js/app.js` (Task 8) at runtime, and by the Worker (Task 6) as the file it edits.

This task's script performs real network I/O against two live public services (GovMap WFS and Nominatim), so it is verified by actually running it and inspecting the output, not by a mocked unit test — the pure sub-logic it depends on is already tested in Task 3.

- [ ] **Step 1: Write `scripts/seed.js`**

```javascript
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
```

- [ ] **Step 2: Create the `data/` directory and run the script**

```bash
mkdir -p data
node scripts/seed.js
```

Expected: console output lists each matched parcel with its address title (e.g. `11322--41 -> אח"י אילת 16`), finishing with a count. This will take a few minutes (one Nominatim request per second per candidate parcel).

- [ ] **Step 3: Inspect the output**

```bash
node -e "const d = JSON.parse(require('fs').readFileSync('data/parcelIds.json')); console.log('parcels:', d.length);"
cat houses.json | head -20
```

Expected: a parcel count in a plausible range for ~40 houses (some houses span more than one parcel, so a count somewhat above 40, e.g. 30-90, is expected — the seed script only emits parcels whose reverse-geocoded road actually contains "אילת", already verified during design research to correctly exclude cross-streets like פינלס/יגאל אלון that fall in the same bounding box). If the count is 0, the bounding box or `STREET_SUBSTRING` needs adjusting — re-run after checking a few `address.road` values by temporarily logging them all, not just matches.

- [ ] **Step 4: Commit the generated data**

```bash
git add scripts/seed.js data/parcelIds.json houses.json
git commit -m "feat: add seed script and generate initial street parcel data"
git push
```

---

### Task 5: Worker pure logic (`worker/src/github.js`)

**Files:**
- Create: `worker/src/github.js`
- Test: `worker/src/github.test.js`

**Interfaces:**
- Produces: `checkPassword(submitted, expected)`, `buildUpdatedHouses(existingHouses, parcelId, fields, updatedAtIso)`, `encodeBase64Utf8(text)`, `decodeBase64Utf8(base64)`. Consumed by `worker/src/index.js` (Task 6). Uses only `TextEncoder`/`TextDecoder`/`btoa`/`atob`, which are available both under plain Node (for testing) and the Cloudflare Workers runtime (for production) — no `Buffer`, no `nodejs_compat` flag needed.

- [ ] **Step 1: Write the failing tests**

Create `worker/src/github.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test worker/src/github.test.js`
Expected: FAIL — `worker/src/github.js` does not exist yet.

- [ ] **Step 3: Write `worker/src/github.js`**

```javascript
export function checkPassword(submitted, expected) {
  return typeof submitted === 'string' && submitted.length > 0 && submitted === expected;
}

export function buildUpdatedHouses(existingHouses, parcelId, fields, updatedAtIso) {
  const existing = existingHouses[parcelId] || {};
  const updatedEntry = {
    address_title: fields.address_title ?? existing.address_title ?? '',
    residents: fields.residents ?? '',
    phone: fields.phone ?? '',
    contact_note: fields.contact_note ?? '',
    updated_by: fields.updated_by ?? '',
    updated_at: updatedAtIso,
  };
  return { ...existingHouses, [parcelId]: updatedEntry };
}

export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test worker/src/github.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/src/github.js worker/src/github.test.js
git commit -m "feat: add worker pure logic for password check and house merge"
git push
```

---

### Task 6: Worker entrypoint (`worker/src/index.js`) + local dev test

**Files:**
- Create: `worker/src/index.js`
- Create: `worker/wrangler.toml`
- Create: `worker/package.json`

**Interfaces:**
- Consumes: `checkPassword`, `buildUpdatedHouses`, `encodeBase64Utf8`, `decodeBase64Utf8` from `worker/src/github.js` (Task 5).
- Produces: an HTTP endpoint `POST /update-house` accepting `{ parcelId, password, address_title, residents, phone, contact_note, updated_by }` and returning the updated house record as JSON. Consumed by `js/app.js` (Task 8) via `WORKER_URL`.

This task requires two manual, one-time credentials that cannot be created via CLI/API (GitHub does not offer programmatic self-issuance of PATs):

- [ ] **Step 1: Obtain a fine-grained GitHub PAT**

Ask the user to go to `https://github.com/settings/personal-access-tokens/new`, create a token scoped to **only** the `achi-eilat-street-map` repository (found via `REPO_FULL_NAME` from Task 1) with repository permission **Contents: Read and write**, and share the token value securely. Do not print it in any command output or commit it.

- [ ] **Step 2: Choose a shared neighborhood password**

Ask the user for the shared password residents will use to edit house entries.

- [ ] **Step 3: Create `worker/package.json`**

```json
{
  "name": "achi-eilat-street-map-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "node --test src"
  }
}
```

- [ ] **Step 4: Install wrangler**

```bash
cd worker
npm install -D wrangler@latest
```

- [ ] **Step 5: Create `worker/wrangler.toml`**

Replace `REPO_FULL_NAME` below with the value recorded in Task 1 (e.g. `someuser/achi-eilat-street-map`):

```toml
name = "achi-eilat-street-map-worker"
main = "src/index.js"
compatibility_date = "2026-08-12"

[vars]
GITHUB_REPO = "REPO_FULL_NAME"
```

- [ ] **Step 6: Create `worker/.dev.vars` (local secrets, gitignored)**

```
SHARED_PASSWORD=<the password chosen in Step 2>
GITHUB_TOKEN=<the fine-grained PAT from Step 1>
```

- [ ] **Step 7: Write `worker/src/index.js`**

```javascript
import { checkPassword, buildUpdatedHouses, encodeBase64Utf8, decodeBase64Utf8 } from './github.js';

const GITHUB_API = 'https://api.github.com';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsResponse();
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const { parcelId, password, address_title, residents, phone, contact_note, updated_by } = body;

    if (!checkPassword(password, env.SHARED_PASSWORD)) {
      return jsonResponse({ error: 'invalid_password' }, 403);
    }
    if (typeof parcelId !== 'string' || parcelId.length === 0) {
      return jsonResponse({ error: 'missing_parcel_id' }, 400);
    }

    const fields = { address_title, residents, phone, contact_note, updated_by };
    const updatedAt = new Date().toISOString();
    const contentsUrl = `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/houses.json`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const getResponse = await fetch(contentsUrl, { headers: githubHeaders(env) });
      if (!getResponse.ok) return jsonResponse({ error: 'github_read_failed' }, 502);
      const getData = await getResponse.json();
      const existingHouses = JSON.parse(decodeBase64Utf8(getData.content));
      const updatedHouses = buildUpdatedHouses(existingHouses, parcelId, fields, updatedAt);

      const putResponse = await fetch(contentsUrl, {
        method: 'PUT',
        headers: githubHeaders(env),
        body: JSON.stringify({
          message: `עדכון פרטי בית ${parcelId}`,
          content: encodeBase64Utf8(JSON.stringify(updatedHouses, null, 2)),
          sha: getData.sha,
        }),
      });

      if (putResponse.status === 409 && attempt === 0) continue; // stale sha, retry once
      if (!putResponse.ok) return jsonResponse({ error: 'github_write_failed' }, 502);
      return jsonResponse(updatedHouses[parcelId], 200);
    }

    return jsonResponse({ error: 'conflict_retry_failed' }, 409);
  },
};

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'achi-eilat-street-map-worker',
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
```

- [ ] **Step 8: Run the pure-logic tests once more from the worker directory**

Run: `node --test src` (from `worker/`)
Expected: PASS (same 6 tests as Task 5 — confirms nothing broke)

- [ ] **Step 9: Start the local dev server**

```bash
npx wrangler dev
```

Expected: prints a local URL, typically `http://127.0.0.1:8787`.

- [ ] **Step 10: Manually verify against the real repo (in a second terminal)**

This performs a real commit to the real `houses.json` on GitHub — that is expected and is exactly what proves the pipeline works.

```bash
curl -s -X POST http://127.0.0.1:8787/update-house \
  -H "Content-Type: application/json" \
  -d '{"parcelId":"TEST--0","password":"<the password from Step 2>","address_title":"בדיקה","residents":"בדיקת מערכת","phone":"","contact_note":"","updated_by":"בדיקה אוטומטית"}'
```

Expected: HTTP 200 with a JSON body echoing `residents: "בדיקת מערכת"` and an `updated_at` timestamp. Then check `gh api repos/REPO_FULL_NAME/commits --jq '.[0].commit.message'` shows the `עדכון פרטי בית TEST--0` commit.

- [ ] **Step 11: Verify the wrong-password path**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/update-house \
  -H "Content-Type: application/json" \
  -d '{"parcelId":"TEST--0","password":"wrong-password","residents":"should not save"}'
```

Expected: `403`.

- [ ] **Step 12: Clean up the test entry**

Edit `houses.json` directly on GitHub (or re-run the curl from Step 10 targeting a real parcel id from `data/parcelIds.json` once Task 4 has run, and manually remove the `TEST--0` key), then `git pull` locally to stay in sync.

- [ ] **Step 13: Commit**

```bash
git add worker/src/index.js worker/wrangler.toml worker/package.json worker/package-lock.json
git commit -m "feat: add worker HTTP entrypoint for updating house records"
git push
```

---

### Task 7: Static site shell (`index.html`, `css/style.css`, `js/config.js`, `robots.txt`)

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/config.js`
- Create: `robots.txt`

**Interfaces:**
- Produces: DOM elements `#map`, `#edit-dialog`, `#edit-form` (with named inputs `address_title`, `residents`, `phone`, `contact_note`, `updated_by`, `password`), `#edit-dialog-title`, `#edit-error`, `#edit-cancel`; and config constants `WFS_URL`, `WFS_LAYER`, `PARCEL_IDS_URL`, `HOUSES_JSON_URL`, `WORKER_URL`, `MAP_CENTER`, `MAP_ZOOM` from `js/config.js`. Consumed by `js/app.js` (Task 8).

- [ ] **Step 1: Create `robots.txt`**

```
User-agent: *
Disallow: /
```

- [ ] **Step 2: Create `js/config.js`**

Replace `REPO_FULL_NAME` with the value recorded in Task 1. The `WORKER_URL` below points at the local `wrangler dev` server for now — Task 9 updates it to the deployed production URL.

```javascript
export const WFS_URL = 'https://open.govmap.gov.il/geoserver/opendata/ows';
export const WFS_LAYER = 'opendata:PARCEL_ALL';
export const PARCEL_IDS_URL = 'data/parcelIds.json';
export const HOUSES_JSON_URL = 'https://raw.githubusercontent.com/REPO_FULL_NAME/main/houses.json';
export const WORKER_URL = 'http://127.0.0.1:8787/update-house';
export const MAP_CENTER = [32.5812, 34.9503];
export const MAP_ZOOM = 18;
```

- [ ] **Step 3: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>מפת שכונה - אח"י אילת</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="map"></div>

  <dialog id="edit-dialog">
    <form id="edit-form" method="dialog">
      <h2 id="edit-dialog-title">עריכת פרטי בית</h2>
      <label>
        כתובת
        <input type="text" name="address_title">
      </label>
      <label>
        שמות דיירים
        <input type="text" name="residents">
      </label>
      <label>
        טלפון
        <input type="text" name="phone">
      </label>
      <label>
        הערת קשר
        <input type="text" name="contact_note">
      </label>
      <label>
        השם שלך (מי מעדכן)
        <input type="text" name="updated_by" required>
      </label>
      <label>
        סיסמת השכונה
        <input type="password" name="password" required>
      </label>
      <p id="edit-error" class="error"></p>
      <div class="dialog-actions">
        <button type="submit">שמור</button>
        <button type="button" id="edit-cancel">ביטול</button>
      </div>
    </form>
  </dialog>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `css/style.css`**

```css
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
}

#map {
  width: 100%;
  height: 100vh;
}

dialog {
  border: none;
  border-radius: 8px;
  padding: 1.5rem;
  max-width: 400px;
  width: 90%;
}

dialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

dialog label {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

dialog input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem;
  margin-top: 0.25rem;
  font-size: 1rem;
}

.dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-start;
}

.error {
  color: #c62828;
  min-height: 1.2rem;
}

.meta-line {
  font-size: 0.75rem;
  color: #666;
}
```

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/config.js robots.txt
git commit -m "feat: add static site shell with map container and edit dialog"
git push
```

---

### Task 8: Frontend app logic (`js/app.js`) + manual integration test

**Files:**
- Create: `js/app.js`

**Interfaces:**
- Consumes: `parcelKey`, `buildCqlFilter`, `mergeParcelWithHouse`, `formatUpdatedLine` from `js/lib.js` (Task 2); config constants from `js/config.js` (Task 7); DOM elements from `index.html` (Task 7); the `POST /update-house` Worker endpoint (Task 6); `data/parcelIds.json` and `houses.json` (Task 4).
- Produces: the running map application — no further tasks consume this as code, it is the final integration point.

- [ ] **Step 1: Write `js/app.js`**

```javascript
import {
  WFS_URL, WFS_LAYER, PARCEL_IDS_URL, HOUSES_JSON_URL, WORKER_URL, MAP_CENTER, MAP_ZOOM,
} from './config.js';
import { parcelKey, buildCqlFilter, mergeParcelWithHouse, formatUpdatedLine } from './lib.js';

const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);

L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 20, attribution: 'Esri World Imagery' },
).addTo(map);

let housesData = {};
let geoJsonLayer = null;
let activeParcelId = null;

const dialog = document.getElementById('edit-dialog');
const form = document.getElementById('edit-form');
const dialogTitle = document.getElementById('edit-dialog-title');
const errorEl = document.getElementById('edit-error');

function styleForHouse(house) {
  return {
    color: house.hasData ? '#2e7d32' : '#888888',
    weight: 2,
    fillOpacity: house.hasData ? 0.35 : 0.1,
  };
}

function buildPopupContent(house) {
  const container = document.createElement('div');

  const title = document.createElement('h3');
  title.textContent = house.address_title || 'בית ללא כתובת רשומה';
  container.appendChild(title);

  const residents = document.createElement('p');
  residents.textContent = house.residents || 'אין פרטים עדיין';
  container.appendChild(residents);

  if (house.phone) {
    const phone = document.createElement('p');
    phone.textContent = `טלפון: ${house.phone}`;
    container.appendChild(phone);
  }

  if (house.contact_note) {
    const note = document.createElement('p');
    note.textContent = house.contact_note;
    container.appendChild(note);
  }

  const meta = document.createElement('p');
  meta.className = 'meta-line';
  meta.textContent = formatUpdatedLine(house.updated_by, house.updated_at);
  container.appendChild(meta);

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'ערוך';
  editButton.addEventListener('click', () => openEditDialog(house));
  container.appendChild(editButton);

  return container;
}

function openPopup(parcelId, layer) {
  const house = mergeParcelWithHouse(parcelId, housesData);
  activeParcelId = parcelId;
  layer.bindPopup(buildPopupContent(house)).openPopup();
}

function openEditDialog(house) {
  dialogTitle.textContent = house.address_title || 'עריכת פרטי בית';
  form.address_title.value = house.address_title;
  form.residents.value = house.residents;
  form.phone.value = house.phone;
  form.contact_note.value = house.contact_note;
  form.updated_by.value = '';
  form.password.value = '';
  errorEl.textContent = '';
  dialog.showModal();
}

function findLayerForParcel(parcelId) {
  let found = null;
  geoJsonLayer.eachLayer((layer) => {
    const id = parcelKey(layer.feature.properties.GUSH_NUM, layer.feature.properties.PARCEL);
    if (id === parcelId) found = layer;
  });
  return found;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.textContent = '';

  const payload = {
    parcelId: activeParcelId,
    password: form.password.value,
    address_title: form.address_title.value.trim(),
    residents: form.residents.value.trim(),
    phone: form.phone.value.trim(),
    contact_note: form.contact_note.value.trim(),
    updated_by: form.updated_by.value.trim(),
  };

  let response;
  try {
    response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    errorEl.textContent = 'שגיאת רשת, נסו שוב';
    return;
  }

  if (response.status === 403) {
    errorEl.textContent = 'סיסמה שגויה';
    return;
  }
  if (!response.ok) {
    errorEl.textContent = 'שגיאה בשמירה, נסו שוב';
    return;
  }

  const updatedHouse = await response.json();
  housesData[activeParcelId] = updatedHouse;
  dialog.close();

  const layer = findLayerForParcel(activeParcelId);
  if (layer) {
    const merged = mergeParcelWithHouse(activeParcelId, housesData);
    layer.setStyle(styleForHouse(merged));
    layer.bindPopup(buildPopupContent(merged)).openPopup();
  }
});

document.getElementById('edit-cancel').addEventListener('click', () => dialog.close());

function renderParcels(featureCollection) {
  if (geoJsonLayer) geoJsonLayer.remove();
  geoJsonLayer = L.geoJSON(featureCollection, {
    style: (feature) => {
      const id = parcelKey(feature.properties.GUSH_NUM, feature.properties.PARCEL);
      return styleForHouse(mergeParcelWithHouse(id, housesData));
    },
    onEachFeature: (feature, layer) => {
      const id = parcelKey(feature.properties.GUSH_NUM, feature.properties.PARCEL);
      layer.on('click', () => openPopup(id, layer));
    },
  }).addTo(map);
}

async function loadData() {
  const parcelIds = await fetch(PARCEL_IDS_URL).then((r) => r.json());

  try {
    housesData = await fetch(HOUSES_JSON_URL).then((r) => r.json());
  } catch {
    housesData = {};
  }

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: WFS_LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    CQL_FILTER: buildCqlFilter(parcelIds),
  });
  const featureCollection = await fetch(`${WFS_URL}?${params.toString()}`).then((r) => r.json());
  renderParcels(featureCollection);
}

loadData();
```

- [ ] **Step 2: Serve the site locally**

```bash
python3 -m http.server 8000
```

- [ ] **Step 3: Make sure the local Worker from Task 6 is still running**

```bash
cd worker && npx wrangler dev
```

- [ ] **Step 4: Manually test in a browser**

Open `http://localhost:8000/`. Verify:
- The map loads centered on Achi Eilat street with Esri satellite imagery visible.
- Only parcels belonging to the street are outlined (spot-check against the map — there should be no polygons from the neighboring streets seen during design research, e.g. פינלס or יגאל אלון).
- Clicking a parcel opens a popup with its address title and current data (or "אין פרטים עדיין" if empty).
- Clicking "ערוך" opens the dialog pre-filled with the current values.
- Submitting with the wrong password shows "סיסמה שגויה" inline and keeps the dialog open with the entered values intact.
- Submitting with the correct password closes the dialog, and the popup + parcel color update immediately without a page reload.
- Reloading the page shows the saved data persisted (confirms the Worker's GitHub commit and the `raw.githubusercontent.com` read both work).

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: wire up map rendering and edit flow in the browser"
git push
```

---

### Task 9: Deploy to production

**Files:**
- Modify: `js/config.js` (`WORKER_URL`)

**Interfaces:**
- Produces: the live public site URL and the live Worker URL — the deliverable of the whole plan.

- [ ] **Step 1: Deploy the Worker**

```bash
cd worker
npx wrangler deploy
```

Expected: prints a URL like `https://achi-eilat-street-map-worker.<account-subdomain>.workers.dev`.

- [ ] **Step 2: Set production secrets on the deployed Worker**

```bash
npx wrangler secret put SHARED_PASSWORD
npx wrangler secret put GITHUB_TOKEN
```

Enter the same values used in `worker/.dev.vars` (Task 6) when prompted.

- [ ] **Step 3: Point the frontend at the deployed Worker**

Edit `js/config.js`, replacing the `WORKER_URL` line with the URL from Step 1 plus the `/update-house` path:

```javascript
export const WORKER_URL = 'https://achi-eilat-street-map-worker.<account-subdomain>.workers.dev/update-house';
```

- [ ] **Step 4: Enable GitHub Pages**

```bash
gh api repos/REPO_FULL_NAME/pages -X POST -f "source[branch]=main" -f "source[path]=/" 2>/dev/null || \
gh api repos/REPO_FULL_NAME/pages -X PUT -f "source[branch]=main" -f "source[path]=/"
```

(The first call creates the Pages site if it doesn't exist yet; if it already exists that call fails and the second `PUT` updates it — this handles both first-run and re-run.)

- [ ] **Step 5: Commit and push the config change**

```bash
git add js/config.js
git commit -m "chore: point frontend at deployed production worker"
git push
```

- [ ] **Step 6: Find the live Pages URL**

```bash
gh api repos/REPO_FULL_NAME/pages --jq .html_url
```

- [ ] **Step 7: End-to-end smoke test on the live URL**

Open the URL from Step 6 (GitHub Pages typically takes ~1 minute to build after the push). Repeat the same checks as Task 8 Step 4, but against the live site and live Worker instead of localhost. Confirm a real edit through the live site produces a new commit on `houses.json` (`gh api repos/REPO_FULL_NAME/commits --jq '.[0].commit.message'`).

- [ ] **Step 8: Share the URL**

Give the resulting `html_url` to the residents of Achi Eilat street along with the shared password (out of band, e.g. a WhatsApp group message — not part of this codebase).
