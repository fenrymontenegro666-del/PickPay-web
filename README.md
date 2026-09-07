# PickPay - Plataforma de Contenido con Calificaciones

Plataforma social donde los creadores pueden publicar contenido (gratis o de pago) y los usuarios pueden calificar el contenido que compran.

## ✨ Características

- ✅ **Autenticación con Supabase** - Registro e inicio de sesión seguros
- ✅ **Sistema de Calificaciones** - Los usuarios pueden calificar el contenido comprado (1-5 estrellas + comentario)
- ✅ **Contenido de Pago** - Los creadores pueden vender contenido con precios personalizados
- ✅ **Feed Social** - Visualización de publicaciones con calificaciones promedio
- ✅ **Perfiles de Usuario** - Biografía, avatar y estadísticas
- ✅ **Modo Claro/Oscuro** - Interfaz adaptable
- ✅ **Responsive** - Funciona en desktop y móvil
- ✅ **Multi-moneda** - Soporte para EUR, USD, MXN, ARS, COP

## 🚀 Configuración Inicial

### 1. Configurar Supabase

1. Ve a tu proyecto en Supabase: https://pbuqxypmxkhkaluuquyr.supabase.co
2. Abre el **SQL Editor** en el menú lateral
3. Copia y pega todo el contenido de `supabase-schema.sql`
4. Haz clic en **Run** para ejecutar el SQL
5. Verifica que se crearon las tablas: `profiles`, `posts`, `ratings`

### 2. Configurar Variables de Entorno

El archivo `.env` ya está creado con tus credenciales:

```
VITE_SUPABASE_URL=https://pbuqxypmxkhkaluuquyr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Instalar Dependencias

```bash
npm install
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 📋 Cómo Usar

### Para Creadores

1. **Regístrate** con tu email y crea tu perfil
2. **Activa Premium** (simulado) para poder publicar contenido de pago
3. **Crea publicaciones** con o sin precio
4. **Gana dinero** cuando los usuarios desbloqueen tu contenido

### Para Usuarios

1. **Regístrate** y explora el feed
2. **Desbloquea contenido** pagando el precio establecido
3. **Califica el contenido** que compraste (1-5 estrellas + comentario)
4. **Ayuda a otros** compartiendo tu opinión

## 🌟 Sistema de Calificaciones

### Cómo Funciona

1. **Solo puedes calificar contenido que compraste** (desbloqueaste)
2. **Una calificación por post** - puedes editarla pero no duplicarla
3. **Calificación visible** - todos ven el promedio antes de comprar
4. **Comentarios opcionales** - puedes dejar un comentario junto con las estrellas

### Visualización

- **Estrellas doradas** muestran la calificación promedio
- **Número de calificaciones** aparece junto al promedio
- **Botón "Calificar"** aparece después de desbloquear
- **Botón "Editar calificación"** si ya calificaste

## 🗄️ Estructura de la Base de Datos

### Tabla `profiles`
- Información de usuarios
- Saldo, estado premium, país, moneda
- Avatar, biografía, tarjeta de pago

### Tabla `posts`
- Publicaciones de los usuarios
- Precio (null = gratis)
- Lista de usuarios que desbloquearon
- Comentarios

### Tabla `ratings`
- Calificaciones de 1-5 estrellas
- Comentarios opcionales
- Relación única: un usuario = una calificación por post

## 🔒 Seguridad

- **Row Level Security (RLS)** activado en todas las tablas
- Los usuarios solo pueden editar sus propios datos
- Las calificaciones son únicas por usuario/post
- Autenticación segura con Supabase Auth

## 📦 Despliegue en GitHub Pages

El proyecto está configurado para desplegarse automáticamente:

```bash
git add .
git commit -m "feat: sistema de calificaciones con Supabase"
git push origin main
```

GitHub Actions compilará y publicará en:
`https://TU-USUARIO.github.io/PickPay-web/`

## 🛠️ Tecnologías

- **React 18** + TypeScript
- **Vite** - Build tool rápido
- **Tailwind CSS** - Estilos
- **Supabase** - Backend como servicio
  - PostgreSQL - Base de datos
  - Auth - Autenticación
  - Realtime - Actualizaciones en tiempo real
- **Lucide React** - Iconos

## 📝 Próximas Mejoras

- [ ] Subida real de imágenes/videos
- [ ] Chat en tiempo real
- [ ] Sistema de suscripciones mensuales
- [ ] Notificaciones push
- [ ] Integración con Stripe para pagos reales
- [ ] Moderación de contenido
- [ ] Sistema de seguidores

## 🤝 Contribuir

Este es un proyecto de demostración. Siéntete libre de:
- Reportar bugs
- Sugerir mejoras
- Hacer forks y personalizar

## 📄 Licencia

MIT License - Úsalo como quieras

---

**Desarrollado con ❤️ usando Supabase y React**
