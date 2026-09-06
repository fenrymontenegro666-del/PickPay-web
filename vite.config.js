import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Base dinámica:
  //  · Por defecto "/"  → la vista previa local funciona (assets en la raíz).
  //  · En GitHub Pages el workflow define VITE_BASE="/PickPay-web/" y la
  //    compilación apunta a la sub-ruta correcta del repositorio.
  base: process.env.VITE_BASE || "/",
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
