import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Base relativa: los assets se resuelven respecto al index.html.
  // ✅ Funciona en GitHub Pages bajo /PickPay-web/ (o cualquier sub-ruta).
  // ✅ Funciona en previsualización local (evita pantalla en blanco).
  // Si quieres forzar la ruta absoluta del repo, cámbialo a: base: "/PickPay-web/",
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
