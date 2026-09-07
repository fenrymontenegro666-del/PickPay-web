-- =============================================================
-- PickPay · Esquema de base de datos para Supabase
-- Ejecuta este SQL en el SQL Editor de tu proyecto Supabase
-- =============================================================

-- Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  birth_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  premium_until TIMESTAMPTZ,
  sub_price_cents INTEGER NOT NULL DEFAULT 499,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  hue TEXT[] NOT NULL DEFAULT ARRAY['#2563EB', '#7C3AED'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bio TEXT DEFAULT '',
  avatar_id TEXT,
  cover_id TEXT,
  card JSONB,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  country TEXT NOT NULL DEFAULT 'ES',
  currency TEXT NOT NULL DEFAULT 'EUR'
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Los usuarios pueden ver todos los perfiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden insertar su propio perfil"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Tabla de publicaciones
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  media_id TEXT,
  media_kind TEXT CHECK (media_kind IN ('image', 'video')),
  price_cents INTEGER,
  likes TEXT[] DEFAULT ARRAY[]::TEXT[],
  unlocks TEXT[] DEFAULT ARRAY[]::TEXT[],
  comments JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Políticas para posts
CREATE POLICY "Todos pueden ver publicaciones"
  ON posts FOR SELECT
  USING (true);

CREATE POLICY "Los usuarios pueden crear sus propias publicaciones"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Los usuarios pueden actualizar sus propias publicaciones"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Los usuarios pueden eliminar sus propias publicaciones"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);

-- Tabla de calificaciones
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- Un usuario solo puede calificar una vez por post
);

-- Habilitar RLS
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Políticas para ratings
CREATE POLICY "Todos pueden ver las calificaciones"
  ON ratings FOR SELECT
  USING (true);

CREATE POLICY "Los usuarios pueden crear sus propias calificaciones"
  ON ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden actualizar sus propias calificaciones"
  ON ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden eliminar sus propias calificaciones"
  ON ratings FOR DELETE
  USING (auth.uid() = user_id);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_post ON ratings(post_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);

-- Función para calcular el promedio de calificaciones
CREATE OR REPLACE FUNCTION get_average_rating(post_id UUID)
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT COALESCE(AVG(stars), 0)
    FROM ratings
    WHERE post_id = $1
  );
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar automáticamente el promedio (opcional)
-- Puedes usar la función get_average_rating() directamente en tus queries
