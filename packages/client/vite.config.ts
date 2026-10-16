import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    // Em desenvolvimento o jogo conversa com o servidor (porta 3001) pela mesma origem.
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
