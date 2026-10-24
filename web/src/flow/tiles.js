import L from 'leaflet';

// OpenStreetMap tiles; flair.css washes them to white and grey so pins and routes stand out
// (the colour treatment is a CSS filter on .leaflet-tile-pane, which also flips to a dark map in dark mode).
export function baseLayer() {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
}
