# 🚀 Guía de Despliegue en GitHub Pages

Esta guía te ayudará a desplegar PickPay en GitHub Pages paso a paso.

## 📋 Requisitos Previos

1. Cuenta de GitHub
2. Git instalado en tu computadora
3. Repositorio creado en GitHub

## 🔧 Paso 1: Preparar el Repositorio Local

Abre una terminal en la carpeta de tu proyecto y ejecuta:

```bash
# Inicializar Git (si no lo has hecho)
git init

# Agregar todos los archivos
git add .

# Hacer el primer commit
git commit -m "Initial commit: PickPay application"
```

## 🌐 Paso 2: Conectar con GitHub

### Opción A: Crear repositorio nuevo

1. Ve a [GitHub](https://github.com) y crea un nuevo repositorio llamado `PickPay-web`
2. NO inicialices con README, .gitignore o licencia (ya los tienes)
3. Copia la URL del repositorio

```bash
# Agregar el repositorio remoto
git remote add origin https://github.com/TU-USUARIO/PickPay-web.git

# Cambiar el nombre de la rama a main
git branch -M main

# Subir el código
git push -u origin main
```

### Opción B: Si ya tienes un repositorio

```bash
# Si ya tienes un repositorio remoto configurado
git remote set-url origin https://github.com/TU-USUARIO/PickPay-web.git
git push -u origin main
```

## ⚙️ Paso 3: Configurar GitHub Pages

### Método 1: GitHub Actions (Recomendado)

El proyecto ya incluye un workflow de GitHub Actions. Solo necesitas:

1. Ve a tu repositorio en GitHub
2. Haz clic en **Settings** (Configuración)
3. En el menú lateral, haz clic en **Pages**
4. En **Build and deployment**:
   - **Source**: Selecciona **GitHub Actions**
5. ¡Listo! El workflow se ejecutará automáticamente

### Método 2: Despliegue desde rama gh-pages

1. Compila el proyecto:

```bash
npm run build
```

2. Instala gh-pages:

```bash
npm install -D gh-pages
```

3. Agrega este script a `package.json`:

```json
{
  "scripts": {
    "deploy": "gh-pages -d dist"
  }
}
```

4. Ejecuta:

```bash
npm run deploy
```

5. Configura GitHub Pages:
   - Ve a **Settings** → **Pages**
   - **Source**: Selecciona **Deploy from a branch**
   - **Branch**: Selecciona `gh-pages` y `/ (root)`
   - Haz clic en **Save**

## 🔑 Paso 4: Configurar Variables de Entorno en GitHub

**IMPORTANTE**: Las credenciales de Supabase deben configurarse como secretos en GitHub.

1. Ve a **Settings** → **Secrets and variables** → **Actions**
2. Haz clic en **New repository secret**
3. Agrega estos secretos:

**Nombre**: `VITE_SUPABASE_URL`  
**Valor**: `https://tu-proyecto.supabase.co`

**Nombre**: `VITE_SUPABASE_ANON_KEY`  
**Valor**: `tu-anon-key-de-supabase`

4. Haz clic en **Add secret** para cada uno

## ✅ Paso 5: Verificar el Despliegue

1. Ve a la pestaña **Actions** en tu repositorio
2. Verás el workflow ejecutándose
3. Espera a que termine (aproximadamente 2-3 minutos)
4. Cuando esté completo, verás un check verde ✅
5. Tu sitio estará disponible en:
   - `https://TU-USUARIO.github.io/PickPay-web/`

## 🐛 Solución de Problemas

### El sitio no se actualiza

```bash
# Forzar un nuevo despliegue
git commit --allow-empty -m "Trigger deployment"
git push
```

### Error de permisos

1. Ve a **Settings** → **Actions** → **General**
2. En **Workflow permissions**, selecciona **Read and write permissions**
3. Haz clic en **Save**

### Las variables de entorno no se cargan

1. Verifica que los nombres de los secretos sean exactos:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Asegúrate de que no tengan espacios al inicio o final
3. Vuelve a ejecutar el workflow

### El sitio muestra una página en blanco

1. Verifica la consola del navegador (F12)
2. Asegúrate de que `vite.config.js` tenga:
   ```javascript
   base: process.env.VITE_BASE || "/"
   ```
3. Verifica que las variables de entorno estén configuradas en GitHub

## 🔄 Actualizar el Sitio

Cada vez que hagas cambios en el código:

```bash
# Agregar cambios
git add .

# Hacer commit
git commit -m "Descripción de los cambios"

# Subir a GitHub
git push
```

El workflow de GitHub Actions se ejecutará automáticamente y actualizará tu sitio.

## 📊 Monitorear el Despliegue

1. Ve a la pestaña **Actions** en tu repositorio
2. Haz clic en el workflow más reciente
3. Verás el progreso de cada paso
4. Si hay errores, haz clic en el paso fallido para ver los logs

## 🎯 URL de tu Sitio

Una vez desplegado, tu sitio estará en:

```
https://TU-USUARIO.github.io/PickPay-web/
```

Reemplaza `TU-USUARIO` con tu nombre de usuario de GitHub.

## 💡 Consejos

- **Primera vez**: El despliegue puede tardar hasta 5 minutos
- **Cambios frecuentes**: GitHub Pages tiene un límite de 10 despliegues por hora
- **Caché**: Si no ves los cambios, prueba con Ctrl+F5 (o Cmd+Shift+R en Mac)
- **Dominio personalizado**: Puedes configurar un dominio propio en **Settings** → **Pages** → **Custom domain**

## 🆘 Necesitas Ayuda?

Si tienes problemas con el despliegue:

1. Revisa los logs en **Actions**
2. Verifica que todas las variables de entorno estén configuradas
3. Asegúrate de que el código compile localmente con `npm run build`
4. Abre un issue en GitHub con los detalles del error

---

¡Listo! Tu sitio PickPay debería estar en línea y accesible para todos. 🎉
