export function matchesStreet(roadName, streetSubstring) {
  if (!roadName) return false;
  return roadName.includes(streetSubstring);
}

export function buildAddressTitle(road, houseNumber) {
  if (!road) return '';
  return houseNumber ? `${road} ${houseNumber}` : road;
}
