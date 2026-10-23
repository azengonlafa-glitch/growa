import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The app imports pure helpers from ../functions/src (schedule math).
  server: { fs: { allow: ['..'] } },
});
