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

function hideLoadingIndicator() {
  document.getElementById('map-loading').classList.add('hidden');
}

function showMapLoadError() {
  hideLoadingIndicator();
  document.getElementById('map').textContent = 'שגיאה בטעינת המפה, נסו לרענן את הדף';
}

async function loadData() {
  let parcelIds;
  try {
    parcelIds = await fetch(PARCEL_IDS_URL).then((r) => r.json());
  } catch {
    showMapLoadError();
    return;
  }

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

  let featureCollection;
  try {
    featureCollection = await fetch(`${WFS_URL}?${params.toString()}`).then((r) => r.json());
  } catch {
    showMapLoadError();
    return;
  }
  hideLoadingIndicator();
  renderParcels(featureCollection);
}

loadData();
