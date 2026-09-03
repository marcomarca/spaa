import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendPort = process.env.VITE_BACKEND_PORT || "8009";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
