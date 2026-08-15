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
  const withUpdatedEntry = { ...existingHouses, [parcelId]: updatedEntry };
  return applyToSiblings(withUpdatedEntry, updatedEntry.address_title, {
    residents: updatedEntry.residents,
    phone: updatedEntry.phone,
    contact_note: updatedEntry.contact_note,
    updated_by: updatedEntry.updated_by,
    updated_at: updatedEntry.updated_at,
  });
}

// Multiple cadastral parcels can represent the same physical house (e.g. a
// building split across several registered lots). When a resident fills in
// contact info for one parcel, propagate it to every other entry that shares
// the exact same non-empty address_title, so siblings don't keep showing
// "no info yet". address_title itself is never touched by this function --
// only the contact fields passed in.
export function applyToSiblings(housesData, addressTitle, contactFields) {
  if (!addressTitle) return housesData;
  const result = { ...housesData };
  for (const [id, entry] of Object.entries(housesData)) {
    if (entry.address_title === addressTitle) {
      result[id] = { ...entry, ...contactFields };
    }
  }
  return result;
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
