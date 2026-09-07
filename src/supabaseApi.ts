import { supabase } from './supabaseClient';

// Tipos de datos
export interface Profile {
  id: string;
  name: string;
  handle: string;
  email: string;
  birth_date: string;
  status: 'pending' | 'approved';
  premium_until: string | null;
  sub_price_cents: number;
  balance_cents: number;
  hue: [string, string];
  created_at: string;
  bio: string;
  avatar_id: string | null;
  cover_id: string | null;
  card: { brand: string; last4: string; holder: string } | null;
  role: 'user' | 'admin';
  country: string;
  currency: string;
}

export interface Rating {
  id: string;
  post_id: string;
  user_id: string;
  stars: number; // 1-5
  comment: string | null;
  created_at: string;
  user?: Profile;
}

export interface Post {
  id: string;
  author_id: string;
  text: string;
  media_id: string | null;
  media_kind: 'image' | 'video' | null;
  price_cents: number | null;
  likes: string[];
  unlocks: string[];
  comments: Array<{
    id: string;
    userId: string;
    text: string;
    at: number;
    replyTo?: { userId: string; text: string };
  }>;
  created_at: string;
  ratings?: Rating[];
  average_rating?: number;
  author?: Profile;
}

// ==================== AUTENTICACIÓN ====================

export async function signUp(
  email: string,
  password: string,
  profileData: {
    name: string;
    handle: string;
    birth_date: string;
    country: string;
    currency: string;
  }
): Promise<{ error: string | null; user: Profile | null }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return { error: authError.message, user: null };
  }

  if (!authData.user) {
    return { error: 'No se pudo crear el usuario', user: null };
  }

  const { data: profileData2, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      name: profileData.name,
      handle: profileData.handle,
      email: email,
      birth_date: profileData.birth_date,
      status: 'pending',
      premium_until: null,
      sub_price_cents: 499,
      balance_cents: 0,
      hue: generateHue(profileData.handle),
      bio: '',
      avatar_id: null,
      cover_id: null,
      card: null,
      role: email === 'pickpayempresa@astermail.org' ? 'admin' : 'user',
      country: profileData.country,
      currency: profileData.currency,
    })
    .select()
    .single();

  if (profileError) {
    return { error: profileError.message, user: null };
  }

  return { error: null, user: profileData2 as Profile };
}

export async function signIn(
  email: string,
  password: string
): Promise<{ error: string | null; user: Profile | null }> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return { error: authError.message, user: null };
  }

  if (!authData.user) {
    return { error: 'No se pudo iniciar sesión', user: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError) {
    return { error: profileError.message, user: null };
  }

  return { error: null, user: profile as Profile };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile as Profile;
}

// ==================== POSTS ====================

export async function createPost(
  authorId: string,
  text: string,
  mediaId: string | null,
  mediaKind: 'image' | 'video' | null,
  priceCents: number | null
): Promise<{ error: string | null; post: Post | null }> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: authorId,
      text,
      media_id: mediaId,
      media_kind: mediaKind,
      price_cents: priceCents,
      likes: [],
      unlocks: [],
      comments: [],
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, post: null };
  }

  return { error: null, post: data as Post };
}

export async function getPosts(): Promise<{ error: string | null; posts: Post[] }> {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!author_id(*),
      ratings:ratings(*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, posts: [] };
  }

  // Calcular promedio de calificaciones
  const postsWithRatings = (data as any[]).map(post => {
    const ratings = post.ratings || [];
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum: number, r: Rating) => sum + r.stars, 0) / ratings.length
      : 0;
    
    return {
      ...post,
      average_rating: avgRating,
      ratings: ratings
    };
  });

  return { error: null, posts: postsWithRatings as Post[] };
}

export async function updatePost(
  postId: string,
  updates: Partial<Post>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId);

  return { error: error?.message || null };
}

export async function deletePost(postId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  return { error: error?.message || null };
}

// ==================== RATINGS ====================

export async function createRating(
  postId: string,
  userId: string,
  stars: number,
  comment: string | null
): Promise<{ error: string | null; rating: Rating | null }> {
  const { data, error } = await supabase
    .from('ratings')
    .insert({
      post_id: postId,
      user_id: userId,
      stars,
      comment,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, rating: null };
  }

  return { error: null, rating: data as Rating };
}

export async function getRatingsByPost(postId: string): Promise<{ error: string | null; ratings: Rating[] }> {
  const { data, error } = await supabase
    .from('ratings')
    .select(`
      *,
      user:profiles!user_id(*)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, ratings: [] };
  }

  return { error: null, ratings: data as Rating[] };
}

export async function getUserRatingForPost(
  postId: string,
  userId: string
): Promise<{ error: string | null; rating: Rating | null }> {
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    return { error: error.message, rating: null };
  }

  return { error: null, rating: data as Rating | null };
}

export async function updateRating(
  ratingId: string,
  stars: number,
  comment: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('ratings')
    .update({ stars, comment })
    .eq('id', ratingId);

  return { error: error?.message || null };
}

export async function deleteRating(ratingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('ratings')
    .delete()
    .eq('id', ratingId);

  return { error: error?.message || null };
}

// ==================== PROFILES ====================

export async function getAllProfiles(): Promise<{ error: string | null; profiles: Profile[] }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, profiles: [] };
  }

  return { error: null, profiles: data as Profile[] };
}

export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  return { error: error?.message || null };
}

// ==================== UTILIDADES ====================

function generateHue(handle: string): [string, string] {
  const hues = [
    ['#2563EB', '#7C3AED'],
    ['#EC4899', '#F59E0B'],
    ['#10B981', '#2563EB'],
    ['#7C3AED', '#EC4899'],
    ['#F59E0B', '#10B981'],
  ];
  const index = handle.length % hues.length;
  return hues[index] as [string, string];
}
