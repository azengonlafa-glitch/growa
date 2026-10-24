import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './flair.css';
import './profile.css';
import App from './App.jsx';
import { startPrefs } from './lib/prefs.js';

startPrefs();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
