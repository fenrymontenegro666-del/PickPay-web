# 🚀 PickPay

Plataforma social moderna donde los creadores pueden compartir contenido y monetizar su trabajo. Los usuarios pueden publicar contenido gratuito o de pago, y calificar el contenido que compran.

## ✨ Características

- **Publicación Libre**: Todos pueden publicar fotos, videos y texto sin necesidad de Premium
- **Contenido Monetizable**: Los usuarios Premium pueden publicar contenido con precio
- **Sistema de Calificaciones**: Los compradores pueden calificar el contenido (1-5 estrellas) con comentarios
- **Desbloqueo de Contenido**: Los usuarios pagan una vez para acceder al contenido premium
- **Perfiles de Usuario**: Información personal, foto de perfil y portada
- **Modo Claro/Oscuro**: Cambia entre temas según tu preferencia
- **Responsive**: Funciona perfectamente en móvil y desktop
- **Base de Datos en la Nube**: Conectado a Supabase para almacenamiento seguro

## 🛠️ Tecnologías

- **React 18** con TypeScript
- **Vite** como bundler
- **Tailwind CSS** para estilos
- **Supabase** para backend (autenticación, base de datos, almacenamiento)
- **Lucide React** para iconos

## 📋 Requisitos Previos

- Node.js 18+ y npm
- Cuenta de Supabase (gratuita)

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU-USUARIO/PickPay-web.git
cd PickPay-web
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar Supabase

1. Crea una cuenta en [Supabase](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve a **SQL Editor** y ejecuta el contenido de `supabase-schema.sql`
4. Copia tus credenciales de Supabase:
   - Ve a **Settings** → **API**
   - Copia **Project URL** y **anon/public key**

### 4. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 5. Ejecutar en modo desarrollo

```bash
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

## 📦 Compilación para Producción

```bash
npm run build
```

Los archivos compilados estarán en la carpeta `dist/`.

## 🌐 Despliegue en GitHub Pages

### Opción 1: Despliegue Automático con GitHub Actions

El proyecto incluye un workflow de GitHub Actions que despliega automáticamente cuando haces push a la rama `main`.

1. Sube tu código a GitHub:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/PickPay-web.git
git push -u origin main
```

2. Configura GitHub Pages:
   - Ve a **Settings** → **Pages**
   - En **Source**, selecciona **GitHub Actions**

3. El workflow se ejecutará automáticamente y tu sitio estará disponible en:
   `https://TU-USUARIO.github.io/PickPay-web/`

### Opción 2: Despliegue Manual

1. Compila el proyecto:

```bash
npm run build
```

2. Sube la carpeta `dist/` a GitHub Pages manualmente.

## 🗄️ Estructura de la Base de Datos

El proyecto usa 3 tablas principales en Supabase:

### profiles
- Datos de usuarios (nombre, email, bio, avatar, etc.)
- Información de Premium y saldo
- Configuración de país y moneda

### posts
- Publicaciones de los usuarios
- Contenido gratuito o con precio
- Likes, desbloqueos y comentarios

### ratings
- Calificaciones de contenido comprado
- Estrellas (1-5) y comentarios
- Relación con usuarios y posts

## 🔐 Seguridad

- Las credenciales de Supabase están protegidas en el archivo `.env`
- El archivo `.gitignore` evita que se suban las credenciales a GitHub
- Usa variables de entorno para todas las configuraciones sensibles
- Supabase maneja la autenticación de forma segura

## 📝 Uso

### Registro
1. Abre la aplicación
2. Haz clic en "Registrarse"
3. Completa tu información (nombre, email, contraseña, fecha de nacimiento)
4. Verifica tu email

### Publicar Contenido
1. Haz clic en "¿Qué quieres compartir?"
2. Escribe tu contenido
3. Opcionalmente, marca "Contenido monetizable" y establece un precio (requiere Premium)
4. Haz clic en "Publicar"

### Calificar Contenido
1. Desbloquea contenido de pago
2. Haz clic en "Calificar"
3. Selecciona estrellas (1-5) y escribe un comentario opcional
4. Envía tu calificación

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Haz fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

## 👤 Autor

Creado con ❤️ para la comunidad de creadores de contenido.

## 🐛 Reportar Problemas

Si encuentras algún bug o tienes sugerencias, por favor abre un issue en GitHub.

---

**Nota**: Este proyecto está en desarrollo activo. Algunas características pueden cambiar o mejorar en futuras versiones.
