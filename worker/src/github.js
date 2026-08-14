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
