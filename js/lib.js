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
