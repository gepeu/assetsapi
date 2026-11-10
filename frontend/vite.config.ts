import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The backend serves this build under /ui, apart from the API's own paths. Built files go in
// static/, not Vite's default assets/, so they can't be confused with the /ui/assets pages.
export default defineConfig({
  base: "/ui/",
  build: { assetsDir: "static" },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/tokenized_assets": "http://127.0.0.1:3000",
    },
  },
});
