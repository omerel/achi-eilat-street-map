import { checkPassword, buildUpdatedHouses, encodeBase64Utf8, decodeBase64Utf8 } from './github.js';

const GITHUB_API = 'https://api.github.com';
const PARCEL_ID_PATTERN = /^\d+--\d+$/;
const FIELD_LIMITS = {
  address_title: 100,
  residents: 200,
  phone: 50,
  contact_note: 500,
  updated_by: 100,
};

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

    const { parcelId, password } = body;

    if (!checkPassword(password, env.SHARED_PASSWORD)) {
      return jsonResponse({ error: 'invalid_password' }, 403);
    }
    if (typeof parcelId !== 'string' || parcelId.length === 0) {
      return jsonResponse({ error: 'missing_parcel_id' }, 400);
    }
    if (!PARCEL_ID_PATTERN.test(parcelId)) {
      return jsonResponse({ error: 'invalid_parcel_id' }, 400);
    }

    const fields = {};
    for (const [key, maxLength] of Object.entries(FIELD_LIMITS)) {
      const value = body[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string') {
        return jsonResponse({ error: 'invalid_field', field: key }, 400);
      }
      const trimmed = value.trim();
      if (trimmed.length > maxLength) {
        return jsonResponse({ error: 'field_too_long', field: key }, 400);
      }
      fields[key] = trimmed;
    }
    const updatedAt = new Date().toISOString();
    const contentsUrl = `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/houses.json`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let getResponse;
      try {
        getResponse = await fetch(contentsUrl, { headers: githubHeaders(env) });
      } catch {
        return jsonResponse({ error: 'github_unreachable' }, 502);
      }
      if (!getResponse.ok) return jsonResponse({ error: 'github_read_failed' }, 502);
      const getData = await getResponse.json();
      const existingHouses = JSON.parse(decodeBase64Utf8(getData.content));
      const updatedHouses = buildUpdatedHouses(existingHouses, parcelId, fields, updatedAt);

      let putResponse;
      try {
        putResponse = await fetch(contentsUrl, {
          method: 'PUT',
          headers: githubHeaders(env),
          body: JSON.stringify({
            message: `עדכון פרטי בית ${parcelId}`,
            content: encodeBase64Utf8(JSON.stringify(updatedHouses, null, 2)),
            sha: getData.sha,
          }),
        });
      } catch {
        return jsonResponse({ error: 'github_unreachable' }, 502);
      }

      if (putResponse.status === 409) {
        if (attempt === 0) continue; // stale sha, retry once
        return jsonResponse({ error: 'conflict_retry_failed' }, 409);
      }
      if (!putResponse.ok) return jsonResponse({ error: 'github_write_failed' }, 502);
      return jsonResponse(updatedHouses[parcelId], 200);
    }
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
