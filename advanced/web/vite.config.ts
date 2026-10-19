import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const server = process.env.VITE_DEV_SERVER ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // the browser talks to the page origin; in dev, forward sockets to the game server
    proxy: {
      '/socket.io': { target: server, ws: true },
      '/healthz': server,
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
