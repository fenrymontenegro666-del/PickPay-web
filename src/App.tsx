import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  getPosts,
  createPost,
  updatePost,
  createRating,
  getRatingsByPost,
  getUserRatingForPost,
  updateRating,
  deleteRating,
  getAllProfiles,
  updateProfile,
  type Profile,
  type Post,
  type Rating,
} from './supabaseApi';
import { Star, Send, MessageCircle, User, LogOut, Moon, Sun, Upload, Lock, Unlock, Heart } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [view, setView] = useState<'feed' | 'profile' | 'chat'>('feed');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  useEffect(() => {
    checkUser();
    loadPosts();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  async function checkUser() {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    setLoading(false);
  }

  async function loadPosts() {
    const { posts } = await getPosts();
    setPosts(posts);
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">Cargando...</div>;
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  async function handleLogin(email: string, password: string) {
    const { error, user: loggedInUser } = await signIn(email, password);
    if (error) {
      alert(error);
      return;
    }
    setUser(loggedInUser);
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
  }

  async function handleCreatePost(text: string, price: number | null) {
    if (!user) return;
    const { error } = await createPost(user.id, text, null, null, price);
    if (error) {
      alert(error);
      return;
    }
    await loadPosts();
  }

  async function handleUnlock(postId: string) {
    if (!user) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    // Simular desbloqueo (en producción, esto debería procesar el pago)
    const updatedUnlocks = [...(post.unlocks || []), user.id];
    const { error } = await updatePost(postId, { unlocks: updatedUnlocks });
    if (error) {
      alert(error);
      return;
    }
    await loadPosts();
  }

  async function handleRate(postId: string, stars: number, comment: string | null) {
    if (!user) return;

    const { rating: existingRating } = await getUserRatingForPost(postId, user.id);
    
    if (existingRating) {
      const { error } = await updateRating(existingRating.id, stars, comment);
      if (error) {
        alert(error);
        return;
      }
    } else {
      const { error } = await createRating(postId, user.id, stars, comment);
      if (error) {
        alert(error);
        return;
      }
    }

    setShowRatingModal(false);
    await loadPosts();
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            PickPay
          </h1>
          
          <nav className="flex items-center gap-4">
            <button
              onClick={() => setView('feed')}
              className={`px-4 py-2 rounded-lg transition ${view === 'feed' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}
            >
              Feed
            </button>
            <button
              onClick={() => setView('profile')}
              className={`px-4 py-2 rounded-lg transition ${view === 'profile' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}
            >
              Perfil
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-slate-700 transition"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-slate-700 transition"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {view === 'feed' && (
          <FeedView
            user={user}
            posts={posts}
            onCreatePost={handleCreatePost}
            onUnlock={handleUnlock}
            onRate={(post) => {
              setSelectedPost(post);
              setShowRatingModal(true);
            }}
            onSelectPost={setSelectedPost}
          />
        )}
        {view === 'profile' && <ProfileView user={user} onUpdate={checkUser} />}
      </main>

      {/* Rating Modal */}
      {showRatingModal && selectedPost && (
        <RatingModal
          post={selectedPost}
          user={user}
          onSubmit={handleRate}
          onClose={() => setShowRatingModal(false)}
        />
      )}
    </div>
  );
}

// ==================== AUTH SCREEN ====================

function AuthScreen({ onLogin }: { onLogin: (email: string, password: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [country, setCountry] = useState('ES');
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { error, user } = await signIn(email, password);
      if (error) {
        setError(error);
      } else if (user) {
        onLogin(email, password);
      }
    } else {
      const { error, user } = await signUp(email, password, {
        name,
        handle,
        birth_date: birthDate,
        country,
        currency,
      });
      if (error) {
        setError(error);
      } else if (user) {
        onLogin(email, password);
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent mb-2">
            PickPay
          </h1>
          <p className="text-slate-400">Elige lo que quieres. Paga solo por eso.</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                mode === 'login' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                mode === 'register' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <input
                  type="text"
                  placeholder="Nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  required
                />
                <input
                  type="text"
                  placeholder="Usuario (@)"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  required
                />
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ES">España</option>
                    <option value="MX">México</option>
                    <option value="AR">Argentina</option>
                    <option value="CO">Colombia</option>
                    <option value="US">Estados Unidos</option>
                  </select>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="MXN">MXN ($)</option>
                    <option value="ARS">ARS ($)</option>
                    <option value="COP">COP ($)</option>
                  </select>
                </div>
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
              required
              minLength={8}
            />

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear Cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ==================== FEED VIEW ====================

function FeedView({
  user,
  posts,
  onCreatePost,
  onUnlock,
  onRate,
  onSelectPost,
}: {
  user: Profile;
  posts: Post[];
  onCreatePost: (text: string, price: number | null) => void;
  onUnlock: (postId: string) => void;
  onRate: (post: Post) => void;
  onSelectPost: (post: Post) => void;
}) {
  const [newPostText, setNewPostText] = useState('');
  const [newPostPrice, setNewPostPrice] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function handleCreatePost() {
    if (!newPostText.trim()) return;
    
    // Si monetiza, usar el precio. Si no, es gratis (null)
    const price = monetizeContent && newPostPrice ? parseInt(newPostPrice) * 100 : null;
    
    await onCreatePost(newPostText, price);
    setNewPostText('');
    setNewPostPrice('');
    setShowCreateForm(false);
    setMonetizeContent(false);
  }

  const isPremium = user.premium_until && new Date(user.premium_until) > new Date();
  const [monetizeContent, setMonetizeContent] = useState(false);

  function handleCreatePostClick() {
    if (monetizeContent && !isPremium) {
      alert('Para publicar contenido monetizable necesitas activar Premium');
      return;
    }
    handleCreatePost();
  }

  return (
    <div className="space-y-6">
      {/* Create Post - Disponible para todos */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-left"
          >
            ¿Qué quieres compartir?
          </button>
        ) : (
          <div className="space-y-4">
            <textarea
              value={newPostText}
              onChange={(e) => setNewPostText(e.target.value)}
              placeholder="Escribe tu contenido..."
              className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
              rows={4}
            />
            
            {/* Opción de monetizar */}
            <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-lg">
              <input
                type="checkbox"
                id="monetize"
                checked={monetizeContent}
                onChange={(e) => setMonetizeContent(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="monetize" className="flex-1 cursor-pointer">
                <p className="font-semibold text-white">Contenido monetizable</p>
                <p className="text-sm text-slate-400">Los usuarios pagarán para desbloquear este contenido</p>
              </label>
            </div>

            {/* Campo de precio solo si monetiza */}
            {monetizeContent && (
              <input
                type="number"
                placeholder="Precio (€)"
                value={newPostPrice}
                onChange={(e) => setNewPostPrice(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                min="1"
              />
            )}

            {/* Aviso si no tiene Premium y quiere monetizar */}
            {monetizeContent && !isPremium && (
              <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-lg">
                <p className="text-amber-200 text-sm">
                  ⚠️ Para publicar contenido monetizable necesitas activar Premium
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCreatePostClick}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
              >
                Publicar
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setMonetizeContent(false);
                  setNewPostPrice('');
                }}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Posts */}
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          user={user}
          onUnlock={onUnlock}
          onRate={onRate}
          onClick={() => onSelectPost(post)}
        />
      ))}
    </div>
  );
}

// ==================== POST CARD ====================

function PostCard({
  post,
  user,
  onUnlock,
  onRate,
  onClick,
}: {
  post: Post;
  user: Profile;
  onUnlock: (postId: string) => void;
  onRate: (post: Post) => void;
  onClick: () => void;
}) {
  const isUnlocked = post.unlocks?.includes(user.id) || !post.price_cents;
  const isAuthor = post.author_id === user.id;
  const hasRated = post.ratings?.some(r => r.user_id === user.id);
  const avgRating = post.average_rating || 0;
  const ratingCount = post.ratings?.length || 0;

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${post.author?.hue[0] || '#2563EB'}, ${post.author?.hue[1] || '#7C3AED'})`,
            }}
          >
            {post.author?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{post.author?.name || 'Usuario'}</p>
            <p className="text-sm text-slate-400">@{post.author?.handle}</p>
          </div>
          {post.price_cents && (
            <div className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm font-semibold">
              €{(post.price_cents / 100).toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-slate-200 whitespace-pre-wrap">{post.text}</p>

        {/* Rating Display */}
        {ratingCount > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={16}
                  className={star <= Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}
                />
              ))}
            </div>
            <span className="text-sm text-slate-400">
              {avgRating.toFixed(1)} ({ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'})
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-slate-700 flex items-center gap-2">
        {!isAuthor && post.price_cents && !isUnlocked && (
          <button
            onClick={() => onUnlock(post.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            <Lock size={18} />
            Desbloquear por €{(post.price_cents / 100).toFixed(2)}
          </button>
        )}

        {isUnlocked && !isAuthor && !hasRated && (
          <button
            onClick={() => onRate(post)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
          >
            <Star size={18} />
            Calificar
          </button>
        )}

        {hasRated && (
          <button
            onClick={() => onRate(post)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
          >
            <Star size={18} className="fill-yellow-400 text-yellow-400" />
            Editar calificación
          </button>
        )}
      </div>
    </div>
  );
}

// ==================== RATING MODAL ====================

function RatingModal({
  post,
  user,
  onSubmit,
  onClose,
}: {
  post: Post;
  user: Profile;
  onSubmit: (postId: string, stars: number, comment: string | null) => void;
  onClose: () => void;
}) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [existingRating, setExistingRating] = useState<Rating | null>(null);

  useEffect(() => {
    loadExistingRating();
  }, []);

  async function loadExistingRating() {
    const { rating } = await getUserRatingForPost(post.id, user.id);
    if (rating) {
      setExistingRating(rating);
      setStars(rating.stars);
      setComment(rating.comment || '');
    }
  }

  function handleSubmit() {
    onSubmit(post.id, stars, comment || null);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 border border-slate-700">
        <h2 className="text-xl font-bold mb-4">
          {existingRating ? 'Editar calificación' : 'Calificar contenido'}
        </h2>

        {/* Stars */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setStars(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                size={40}
                className={star <= stars ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}
              />
            </button>
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Deja un comentario (opcional)..."
          className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none mb-4"
          rows={3}
        />

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
          >
            {existingRating ? 'Actualizar' : 'Enviar'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== PROFILE VIEW ====================

function ProfileView({ user, onUpdate }: { user: Profile; onUpdate: () => void }) {
  const [bio, setBio] = useState(user.bio || '');
  const [saving, setSaving] = useState(false);

  async function handleSaveBio() {
    setSaving(true);
    const { error } = await updateProfile(user.id, { bio });
    if (error) {
      alert(error);
    } else {
      await onUpdate();
    }
    setSaving(false);
  }

  const isPremium = user.premium_until && new Date(user.premium_until) > new Date();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {/* Cover */}
        <div
          className="h-32"
          style={{
            background: `linear-gradient(135deg, ${user.hue[0]}, ${user.hue[1]})`,
          }}
        />

        {/* Profile Info */}
        <div className="px-6 pb-6 -mt-12">
          <div
            className="w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center text-3xl font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${user.hue[0]}, ${user.hue[1]})`,
            }}
          >
            {user.name[0]?.toUpperCase()}
          </div>

          <div className="mt-4">
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-slate-400">@{user.handle}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-sm text-slate-400">Estado</p>
              <p className="font-semibold">{isPremium ? 'Premium ✓' : 'Gratis'}</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-sm text-slate-400">Saldo</p>
              <p className="font-semibold">€{(user.balance_cents / 100).toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm text-slate-400 mb-2 block">Biografía</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Cuéntanos sobre ti..."
              className="w-full px-4 py-3 bg-slate-700 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
              rows={3}
            />
            <button
              onClick={handleSaveBio}
              disabled={saving}
              className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
