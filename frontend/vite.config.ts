import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The backend serves this build under /ui, because /assets is an API route. Built files go in
// static/, not Vite's default assets/, so they can't be confused with the /ui/assets pages.
export default defineConfig({
  base: "/ui/",
  build: { assetsDir: "static" },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/assets": "http://127.0.0.1:3000",
    },
  },
});
