# PickPay · Despliegue en GitHub Pages

URL final: **`https://<tu-usuario>.github.io/PickPay-web/`**

---

## 1 · Configuración de la base (`/PickPay-web/`)

El proyecto usa `vite.config.js` (no `.ts`). Tienes **dos opciones**:

### Opción A — Automática (recomendada, ya está lista)

El workflow `.github/workflows/deploy-pages.yml` inyecta la base en cada build:

```bash
npx vite build --base=/PickPay-web/
```

No hay que tocar ningún archivo: el desarrollo local sigue en `/` y el build de
GitHub Pages sale con `/PickPay-web/`.

### Opción B — Editar `vite.config.js` (si prefieres fijarla en el archivo)

Añade `base` dentro de `defineConfig`. El archivo debe quedar así:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/PickPay-web/",   // ← línea añadida
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: { port: 3000 },
  },
});
```

> Si eliges la opción B, quita `--base=...` del paso "Build" del workflow para
> no duplicarla (aunque Vite tolera que coincidan).

## 2 · React Router

**No aplica**: la app no usa React Router (la navegación es por estado interno
de `App.tsx`), así que no hay ningún `basename` que configurar.

## 3 · Commit y push a `main`

Desde la carpeta del proyecto, con tu repositorio `PickPay-web` ya creado en
GitHub y enlazado (`git remote add origin …`):

```bash
git add .
git commit -m "chore: despliegue automático en GitHub Pages (base /PickPay-web/)"
git branch -M main
git push -u origin main
```

Este primer push dispara el workflow. A partir de ahí, **cada push a `main`
republica la página automáticamente** (también puedes lanzarlo a mano desde
GitHub → Actions → "Deploy to GitHub Pages" → Run workflow).

## 4 · Activar Pages (una sola vez)

En GitHub → tu repositorio → **Settings → Pages**:

- **Source:** `GitHub Actions` (no "Deploy from a branch")
- Guarda y espera el check verde del workflow (~1–2 min)

## 5 · Verificación

1. Abre `https://<tu-usuario>.github.io/PickPay-web/`
2. Pulsa `Ctrl/Cmd + U` o abre la consola (`F12`): los assets deben cargar desde
   `/PickPay-web/assets/…` sin errores 404.
3. Comprueba que el registro, el feed, el chat y la cartera funcionan igual que
   en local (los datos viven en `localStorage`/`IndexedDB` del navegador del
   visitante, así que la app es 100% funcional como sitio estático).

## 6 · Si el repositorio tiene otro nombre

Cambia la variable `BASE_PATH` en `.github/workflows/deploy-pages.yml`:

```yaml
env:
  BASE_PATH: /Nombre-Real-Del-Repo/
```

## 7 · Alternativa manual (sin Actions)

Si algún día quieres publicar sin el workflow:

```bash
npx vite build --base=/PickPay-web/
npx gh-pages -d dist
```

(con Pages en modo "Deploy from a branch" → rama `gh-pages` → carpeta `/ (root)`).

---

**Estado del proyecto para Pages:** compatible como sitio 100% estático —
fuentes y media son URLs absolutas, no hay rutas de servidor ni cookies de
sesión que dependan del dominio.
