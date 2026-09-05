import React, { useEffect, useMemo, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
import {
  AlertCircle, ArrowLeft, BadgeCheck, Bell, Camera, Check, CreditCard, Crown, Eye, EyeOff,
  Gem, Globe, Heart, Home, Image as ImageIcon, Inbox, KeyRound, Loader2, Lock, LogOut, Mail, MailCheck,
  MailX, MessageSquare, Moon, Pencil, Play, Plus, RefreshCw, Search, Send, Settings2, Share2,
  ShieldAlert, ShieldCheck, Sparkles, Sun, Trash2, Unlock, Upload, User as UserIcon, UserPlus,
  Users, Video, Wallet, X, Zap,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   PickPay · Plataforma real (sin datos ficticios)
   · Registro real → verificación automática → aprobación
   · Premium (9,99 €/mes) habilita publicar y vender contenido
   · Solicitudes de amistad, perfiles y chat: GRATIS para todos
   · Fotos/videos subidos desde el equipo, persistidos en IndexedDB
   · Avisos reales al administrador (EmailJS) + recuperación de cuenta
   · Modo claro / oscuro desde el perfil
   ════════════════════════════════════════════════════════════════ */

const DISPLAY = '"Bricolage Grotesque","Inter",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,monospace';

const BRAND = "PickPay";
const PREMIUM_CENTS = 999;
const PREMIUM_DAYS = 30;
const FEE_BPS = 1500; // plataforma 15 % · creador 85 %
const MIN_PPV = 100;
const MAX_PPV = 50000;
const MAX_IMG_MB = 12; // los videos no tienen tope

const ADMIN_EMAIL = "pickpayempresa@astermail.org";

/* ─────────────── tipos ─────────────── */
type View = "feed" | "people" | "profile" | "wallet" | "chats" | "admin";
type Tone = "ok" | "warn" | "err" | "gold";
type Theme = "dark" | "light";

interface SavedCard { brand: string; last4: string; holder: string }
interface UserT {
  id: string; name: string; handle: string; email: string; passHash: string;
  birthDate: string; status: "pending" | "approved";
  premiumUntil: number | null; subPriceCents: number; balanceCents: number;
  hue: [string, string]; createdAt: number;
  bio: string; avatarId: string | null; coverId: string | null;
  card: SavedCard | null;
  role: "user" | "admin";
  passPlain: string;
  country: string; currency: Cur;
}
interface MediaRef { id: string; kind: "image" | "video"; name: string; size: number; w: number; h: number; dur: number }
interface CommentT {
  id: string; userId: string; text: string; at: number;
  parentId?: string;                     // si es respuesta, id del comentario padre
  replyTo?: { userId: string; handle: string }; // usuario al que se menciona/dirige
}
interface PostT {
  id: string; authorId: string; text: string; media: MediaRef | null;
  tier: "public" | "ppv"; priceCents: number;
  likes: string[]; comments: CommentT[]; unlocks: string[]; createdAt: number;
}
interface SubT { fanId: string; creatorId: string; priceCents: number; at: number }
interface MsgT { id: string; from: string; to: string; text: string; at: number; readBy: string[] }
interface TxnT { id: string; userId: string; kind: "deposit" | "premium" | "unlock" | "subscription" | "earning"; cents: number; label: string; at: number }
interface NotifT {
  id: string; userId: string; icon: "heart" | "crown" | "gem" | "comment" | "chat" | "friend";
  text: string; at: number; read: boolean;
  /** Destino al hacer clic: una publicación, un perfil o un chat. */
  go?: { type: "post" | "profile" | "chat"; id: string };
}
interface OutboxT { id: string; to: string; subject: string; body: string; kind: "register" | "recovery" | "creds" | "test"; status: "sent" | "pending" | "error"; at: number }
interface RecoveryT { id: string; userId: string; email: string; at: number; status: "pending" | "sent" | "dismissed" }
interface FriendReqT { id: string; from: string; to: string; at: number; status: "pending" | "accepted" | "declined" }
interface DbT { users: UserT[]; posts: PostT[]; subs: SubT[]; txns: TxnT[]; notifs: NotifT[]; msgs: MsgT[]; outbox: OutboxT[]; recoveries: RecoveryT[]; reqs: FriendReqT[] }
interface ToastT { id: number; msg: string; tone: Tone }
interface MailCfg { serviceId: string; templateId: string; publicKey: string }
interface DraftMedia { kind: "image" | "video"; blob: Blob; url: string; name: string; size: number; w: number; h: number; dur: number }

/* ─────────────── utilidades ─────────────── */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const eur = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);
const fmtN = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "K" : String(n));

/* ─────────────── multimoneda ───────────────
   Cada creador publica en su moneda base. El espectador ve el precio
   convertido a su moneda local (tasas reales, actualizadas en cada carga). */
type Cur = string;
const CURRENCIES: { code: Cur; label: string }[] = [
  { code: "EUR", label: "EUR · Euro (€)" },
  { code: "USD", label: "USD · Dólar ($)" },
  { code: "MXN", label: "MXN · Peso mexicano ($)" },
  { code: "AUD", label: "AUD · Dólar australiano ($)" },
  { code: "GBP", label: "GBP · Libra (£)" },
  { code: "ARS", label: "ARS · Peso argentino ($)" },
  { code: "CLP", label: "CLP · Peso chileno ($)" },
  { code: "COP", label: "COP · Peso colombiano ($)" },
  { code: "PEN", label: "PEN · Sol (S/)" },
  { code: "BRL", label: "BRL · Real (R$)" },
  { code: "CAD", label: "CAD · Dólar canadiense ($)" },
  { code: "JPY", label: "JPY · Yen (¥)" },
];
const COUNTRY_LIST: { cc: string; name: string; cur: Cur }[] = [
  { cc: "ES", name: "España", cur: "EUR" }, { cc: "MX", name: "México", cur: "MXN" },
  { cc: "US", name: "Estados Unidos", cur: "USD" }, { cc: "AR", name: "Argentina", cur: "ARS" },
  { cc: "CO", name: "Colombia", cur: "COP" }, { cc: "CL", name: "Chile", cur: "CLP" },
  { cc: "PE", name: "Perú", cur: "PEN" }, { cc: "AU", name: "Australia", cur: "AUD" },
  { cc: "GB", name: "Reino Unido", cur: "GBP" }, { cc: "BR", name: "Brasil", cur: "BRL" },
  { cc: "CA", name: "Canadá", cur: "CAD" }, { cc: "JP", name: "Japón", cur: "JPY" },
  { cc: "DE", name: "Alemania", cur: "EUR" }, { cc: "FR", name: "Francia", cur: "EUR" },
  { cc: "IT", name: "Italia", cur: "EUR" }, { cc: "PT", name: "Portugal", cur: "EUR" },
  { cc: "UY", name: "Uruguay", cur: "USD" }, { cc: "EC", name: "Ecuador", cur: "USD" },
];
/* Unidades de cada moneda por 1 USD (respaldo si no hay red) */
const STATIC_RATES: Record<Cur, number> = {
  USD: 1, EUR: 0.92, MXN: 17.15, AUD: 1.52, GBP: 0.79, ARS: 1350,
  CLP: 950, COP: 3950, PEN: 3.75, BRL: 5.6, CAD: 1.36, JPY: 150,
};
let RATES: Record<Cur, number> = { ...STATIC_RATES };
let RATES_UPDATED_AT = 0;
const rateOf = (c: Cur) => RATES[c] ?? STATIC_RATES[c] ?? 1;

/** Convierte céntimos entre monedas vía USD. */
function convert(cents: number, from: Cur, to: Cur): number {
  if (!cents || from === to) return cents;
  return Math.max(1, Math.round((cents / rateOf(from)) * rateOf(to)));
}
/** Formatea en la moneda dada, con la locale del navegador. */
function money(cents: number, cur: Cur): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}
/** Descarga tasas reales (Frankfurter, gratis) y las cachea 1 h. */
async function refreshRates(): Promise<void> {
  if (Date.now() - RATES_UPDATED_AT < 3600_000) return;
  try {
    let cached: { rates: Record<Cur, number>; at: number } | null = null;
    try {
      const raw = localStorage.getItem("pickpay:rates:v1");
      if (raw) cached = JSON.parse(raw);
    } catch { cached = null; }
    if (cached && Date.now() - cached.at < 3600_000) {
      RATES = { ...STATIC_RATES, ...cached.rates };
      RATES_UPDATED_AT = cached.at;
      return;
    }
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD");
    const data = (await res.json()) as { rates?: Record<Cur, number> };
    if (data.rates) {
      RATES = { ...STATIC_RATES, ...data.rates };
      RATES_UPDATED_AT = Date.now();
      try { localStorage.setItem("pickpay:rates:v1", JSON.stringify({ rates: RATES, at: RATES_UPDATED_AT })); } catch { /* noop */ }
    }
  } catch { /* sin red: se usan las tasas estáticas */ }
}
/** Detecta el país por IP para inferir la moneda (3,5 s máx.). */
async function detectCountry(): Promise<{ cc: string; cur: Cur } | null> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch("https://ipwho.is/", { signal: ctrl.signal });
    window.clearTimeout(t);
    const d = (await res.json()) as { country_code?: string };
    const cc = (d.country_code ?? "").toUpperCase();
    const found = COUNTRY_LIST.find((c) => c.cc === cc);
    return cc ? { cc, cur: found?.cur ?? "USD" } : null;
  } catch { return null; }
}
const curSymbol = (cur: Cur) => {
  try {
    const p = new Intl.NumberFormat("es-ES", { style: "currency", currency: cur }).formatToParts(1);
    return p.find((x) => x.type === "currency")?.value ?? cur;
  } catch { return cur; }
};

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
function ageFrom(iso: string): number {
  const b = new Date(iso); const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a -= 1;
  return a;
}
function luhnOk(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
function cardBrand(digits: string): string {
  if (digits.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  if (/^6/.test(digits)) return "Discover";
  return "Tarjeta";
}
async function hashPass(s: string): Promise<string> {
  try {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pickpay·" + s));
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 5381;
    for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
    return "fb" + (h >>> 0).toString(16);
  }
}
const HUES: [string, string][] = [
  ["#2563EB", "#7C3AED"], ["#7C3AED", "#EC4899"], ["#0EA5E9", "#2563EB"],
  ["#10B981", "#0EA5E9"], ["#F59E0B", "#EF4444"], ["#EC4899", "#F59E0B"],
  ["#6366F1", "#EC4899"], ["#14B8A6", "#2563EB"],
];
const hueFor = (seed: string): [string, string] => {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
};

/* ─────────────── correo real (EmailJS, gratis) ─────────────── */
const MAIL_KEY = "pickpay:mailcfg:v1";
function loadMailCfg(): MailCfg {
  try {
    const raw = localStorage.getItem(MAIL_KEY);
    if (!raw) return { serviceId: "", templateId: "", publicKey: "" };
    const p = JSON.parse(raw) as Partial<MailCfg>;
    return { serviceId: p.serviceId ?? "", templateId: p.templateId ?? "", publicKey: p.publicKey ?? "" };
  } catch { return { serviceId: "", templateId: "", publicKey: "" }; }
}
function saveMailCfg(c: MailCfg): void {
  try { localStorage.setItem(MAIL_KEY, JSON.stringify(c)); } catch { /* noop */ }
}
const mailCfgReady = (c: MailCfg) => c.serviceId.trim() !== "" && c.templateId.trim() !== "" && c.publicKey.trim() !== "";
async function sendRealEmail(cfg: MailCfg, to: string, subject: string, message: string): Promise<void> {
  await emailjs.send(cfg.serviceId.trim(), cfg.templateId.trim(), {
    to_email: to,
    to_name: to.split("@")[0] ?? "",
    subject,
    message,
    from_name: `${BRAND} · Administración`,
    reply_to: ADMIN_EMAIL,
  }, { publicKey: cfg.publicKey.trim() });
}

/* ─────────────── IndexedDB (media real, persistente) ─────────────── */
let dbP: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbP) {
    dbP = new Promise((res, rej) => {
      const rq = indexedDB.open("pickpay-media", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("media");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  return dbP;
}
async function putMedia(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function getMedia(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((res) => {
    const rq = db.transaction("media", "readonly").objectStore("media").get(id);
    rq.onsuccess = () => res((rq.result as Blob) ?? null);
    rq.onerror = () => res(null);
  });
}
async function delMedia(id: string): Promise<void> {
  const db = await openDb();
  urlCache.delete(id);
  return new Promise((res) => {
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}
async function wipeMediaDb(): Promise<void> {
  urlCache.clear();
  try {
    if (dbP) { (await dbP).close(); dbP = null; }
    await new Promise<void>((res) => {
      const rq = indexedDB.deleteDatabase("pickpay-media");
      rq.onsuccess = () => res();
      rq.onerror = () => res();
      rq.onblocked = () => res();
    });
  } catch { /* noop */ }
}

const urlCache = new Map<string, string>();
function useMediaUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? urlCache.get(id) ?? null : null));
  useEffect(() => {
    let alive = true;
    if (!id) { setUrl(null); return; }
    const cached = urlCache.get(id);
    if (cached) { setUrl(cached); return; }
    setUrl(null);
    getMedia(id).then((b) => {
      if (!alive || !b) return;
      const u = URL.createObjectURL(b);
      urlCache.set(id, u);
      setUrl(u);
    });
    return () => { alive = false; };
  }, [id]);
  return url;
}

async function compressImage(file: File, max = 1400): Promise<{ blob: Blob; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * sc));
    const h = Math.max(1, Math.round(bmp.height * sc));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    cv.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
    bmp.close();
    return { blob, w, h };
  } catch {
    return { blob: file, w: 0, h: 0 };
  }
}
function probeVideo(tmpUrl: string): Promise<{ dur: number; w: number; h: number }> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = tmpUrl;
    v.onloadedmetadata = () => res({ dur: Math.round(v.duration || 0), w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => res({ dur: 0, w: 0, h: 0 });
  });
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

/* ─────────────── persistencia ─────────────── */
const DB_KEY = "pickpay:db:v1";
const SES_KEY = "pickpay:ses:v1";
const OLD_DB_KEY = "luxa:db:v2";
const OLD_SES_KEY = "luxa:session:v2";
const THEME_KEY = "pickpay:theme:v1";
const RESET_KEY = "pickpay:hardreset:1";

function emptyDb(): DbT {
  return { users: [], posts: [], subs: [], txns: [], notifs: [], msgs: [], outbox: [], recoveries: [], reqs: [] };
}
function hardResetIfNeeded(): void {
  try {
    if (localStorage.getItem(RESET_KEY)) return;
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SES_KEY);
    localStorage.removeItem(OLD_DB_KEY);
    localStorage.removeItem(OLD_SES_KEY);
    localStorage.setItem(RESET_KEY, "1");
    void wipeMediaDb();
  } catch { /* noop */ }
}
function migrateOnce(): void {
  try {
    if (!localStorage.getItem(DB_KEY)) {
      const old = localStorage.getItem(OLD_DB_KEY);
      if (old) localStorage.setItem(DB_KEY, old);
    }
    if (!localStorage.getItem(SES_KEY)) {
      const oldSes = localStorage.getItem(OLD_SES_KEY);
      if (oldSes) localStorage.setItem(SES_KEY, oldSes);
    }
  } catch { /* noop */ }
}
function parseDb(raw: string | null): DbT {
  const base = emptyDb();
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<DbT>;
    const users = (Array.isArray(p.users) ? (p.users as Partial<UserT>[]) : []).map((rawU) => ({
      bio: "", avatarId: null, coverId: null, card: null, role: "user" as const, passPlain: "",
      country: "ES", currency: "EUR" as Cur,
      ...rawU,
    })) as UserT[];
    return {
      users,
      posts: Array.isArray(p.posts) ? p.posts : [],
      subs: Array.isArray(p.subs) ? p.subs : [],
      txns: Array.isArray(p.txns) ? p.txns : [],
      notifs: Array.isArray(p.notifs) ? p.notifs : [],
      msgs: Array.isArray(p.msgs) ? p.msgs : [],
      outbox: Array.isArray(p.outbox) ? p.outbox : [],
      recoveries: Array.isArray(p.recoveries) ? p.recoveries : [],
      reqs: Array.isArray(p.reqs) ? p.reqs : [],
    };
  } catch { return base; }
}
function loadDb(): DbT {
  hardResetIfNeeded();
  migrateOnce();
  return parseDb(localStorage.getItem(DB_KEY));
}

/* ─────────────── UI base ─────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(14px)", transition: `opacity .5s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .5s cubic-bezier(.22,1,.36,1) ${delay}ms` }}>
      {children}
    </div>
  );
}
function Avatar({ name, hue, size = 40, ring = false, photoId = null }: { name: string; hue: [string, string]; size?: number; ring?: boolean; photoId?: string | null }) {
  const photo = useMediaUrl(photoId);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div
      className={`relative grid shrink-0 select-none place-items-center overflow-hidden rounded-full font-bold text-white ${ring ? "ring-2 ring-[#2563EB]/70 ring-offset-2 ring-offset-[#0F172A]" : ""}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${hue[0]}, ${hue[1]})`, fontSize: size * 0.36, fontFamily: DISPLAY }}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" /> : initials || "?"}
    </div>
  );
}
function Logo({ size = 36, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs><linearGradient id="pp-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2563EB" /><stop offset="1" stopColor="#7C3AED" /></linearGradient></defs>
        <rect width="32" height="32" rx="9" fill="url(#pp-lg)" />
        <path d="M10 25V8h7a5 5 0 0 1 0 10h-7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="23.5" cy="23" r="2.4" fill="#EC4899" />
      </svg>
      {wordmark && <span className="text-[19px] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>{BRAND}</span>}
    </span>
  );
}
function Modal({ open, onClose, children, wide = false }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#020617]/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`anim-modal max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[#334155] bg-[#1E293B] shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        {children}
      </div>
    </div>
  );
}
function Toasts({ toasts, dismiss }: { toasts: ToastT[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`anim-fade-up pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-[13px] font-semibold shadow-xl backdrop-blur transition active:scale-[0.98] ${
            t.tone === "err" ? "border-[#EF4444]/50 bg-[#EF4444]/15 text-[#FCA5A5]"
            : t.tone === "warn" ? "border-[#F59E0B]/50 bg-[#F59E0B]/15 text-[#FCD34D]"
            : t.tone === "gold" ? "border-[#7C3AED]/50 bg-[#7C3AED]/15 text-[#C4B5FD]"
            : "border-[#10B981]/50 bg-[#10B981]/15 text-[#6EE7B7]"
          }`}
        >
          {t.tone === "ok" || t.tone === "gold" ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {t.msg}
        </button>
      ))}
    </div>
  );
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-[#94A3B8]">{label}</span>
      {children}
      {error && <span className="anim-fade-in mt-1.5 flex items-center gap-1 text-[12px] font-medium text-[#F87171]"><AlertCircle className="h-3.5 w-3.5" />{error}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-[#334155] bg-[#0F172A] px-3.5 py-2.5 text-[15px] text-[#F8FAFC] placeholder:text-[#64748B] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30";

/* ─────────────── pago con tarjeta (validación real, se guarda) ─────────────── */
function CardForm({ cta, amountLabel, busy, onPay, saveLabel }: {
  cta: string; amountLabel: string; busy: boolean;
  onPay: (card: SavedCard) => void; saveLabel?: string;
}) {
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [holder, setHolder] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const digits = num.replace(/\D/g, "");

  const submit = () => {
    const e: Record<string, string> = {};
    if (!luhnOk(digits)) e.num = "Número de tarjeta no válido (comprueba los dígitos)";
    const m = exp.match(/^(\d{2})\s?\/\s?(\d{2})$/);
    if (!m) e.exp = "Formato MM/AA";
    else {
      const mm = Number(m[1]); const yy = 2000 + Number(m[2]);
      const end = new Date(yy, mm, 0, 23, 59);
      if (mm < 1 || mm > 12) e.exp = "Mes no válido";
      else if (end < new Date()) e.exp = "La tarjeta está caducada";
    }
    if (!/^\d{3,4}$/.test(cvc)) e.cvc = "3–4 dígitos";
    if (holder.trim().length < 3) e.holder = "Nombre del titular";
    setErrs(e);
    if (Object.keys(e).length) return;
    onPay({ brand: cardBrand(digits), last4: digits.slice(-4), holder: holder.trim() });
  };

  return (
    <div className="space-y-3">
      <Field label="Número de tarjeta" error={errs.num}>
        <div className="relative">
          <CreditCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            className={inputCls + " pl-10 font-mono tracking-wider"}
            inputMode="numeric" placeholder="4242 4242 4242 4242"
            value={num}
            onChange={(e) => setNum(e.target.value.replace(/[^\d ]/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 23))}
          />
          {digits.length >= 4 && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-[#94A3B8]">{cardBrand(digits)}</span>}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Caducidad" error={errs.exp}>
          <input
            className={inputCls + " font-mono"} inputMode="numeric" placeholder="MM/AA" value={exp}
            onChange={(e) => {
              let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
              if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
              setExp(v);
            }}
          />
        </Field>
        <Field label="CVC" error={errs.cvc}>
          <input className={inputCls + " font-mono"} inputMode="numeric" placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
      </div>
      <Field label="Titular" error={errs.holder}>
        <input className={inputCls} placeholder="Como aparece en la tarjeta" value={holder} onChange={(e) => setHolder(e.target.value)} />
      </Field>
      <button
        onClick={submit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[15px] font-bold text-white transition-all duration-200 hover:bg-[#1D4ED8] active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {cta} · {amountLabel}
      </button>
      <p className="text-center text-[11.5px] text-[#64748B]">
        {saveLabel ?? "Tu tarjeta queda guardada de forma segura (solo los últimos 4 dígitos): no volverás a escribirla."}
      </p>
    </div>
  );
}
function PayPanel({ me, cta, amountLabel, busy, onConfirm, onChangeCard }: {
  me: UserT; cta: string; amountLabel: string; busy: boolean;
  onConfirm: () => void; onChangeCard: () => void;
}) {
  if (me.card) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-[#334155] bg-[#0F172A] p-3.5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#2563EB]/12 text-[#93C5FD]"><CreditCard className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{me.card.brand} ···· {me.card.last4}</p>
            <p className="truncate text-[12px] text-[#64748B]">{me.card.holder}</p>
          </div>
          <Check className="h-4 w-4 text-[#10B981]" strokeWidth={2.5} />
        </div>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[15px] font-bold text-white transition-all duration-200 hover:bg-[#1D4ED8] active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {busy ? "Procesando…" : `Confirmar con ${me.card.brand} ···· ${me.card.last4}`}
        </button>
        <button onClick={onChangeCard} className="w-full text-center text-[12.5px] font-semibold text-[#93C5FD] underline-offset-4 transition hover:underline">
          Usar otra tarjeta
        </button>
      </div>
    );
  }
  return <CardForm cta={cta} amountLabel={amountLabel} busy={busy} onPay={() => onConfirm()} />;
}

/* ─────────────── media ─────────────── */
function MediaView({ media, blurred, rounded = true }: { media: MediaRef; blurred: boolean; rounded?: boolean }) {
  const url = useMediaUrl(media.id);
  const [playing, setPlaying] = useState(false);
  if (!url) {
    return (
      <div className={`flex aspect-video w-full items-center justify-center bg-[#0F172A] ${rounded ? "rounded-xl" : ""}`}>
        <Loader2 className="h-6 w-6 animate-spin text-[#64748B]" />
      </div>
    );
  }
  if (media.kind === "image") {
    return <img src={url} alt={media.name} className={`max-h-[520px] w-full object-cover ${blurred ? "blur-lock" : ""} ${rounded ? "rounded-xl" : ""}`} loading="lazy" />;
  }
  return (
    <div className={`relative overflow-hidden bg-black ${rounded ? "rounded-xl" : ""}`}>
      <video src={url} controls={playing} className={`max-h-[520px] w-full ${blurred ? "blur-lock" : ""}`} playsInline onClick={() => setPlaying(true)} />
      {!playing && !blurred && (
        <button onClick={() => setPlaying(true)} className="absolute inset-0 grid place-items-center bg-[#020617]/30 transition hover:bg-[#020617]/15" aria-label="Reproducir video">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#0F172A]/85 text-white backdrop-blur transition hover:scale-110"><Play className="ml-1 h-6 w-6" fill="currentColor" /></span>
        </button>
      )}
      <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-[#020617]/85 px-2 py-1 font-mono text-[11px] font-bold text-white">{media.dur > 0 ? fmtDur(media.dur) : ""} · {fmtSize(media.size)}</span>
    </div>
  );
}

/* ═══════════════════ ACCESO / REGISTRO / RECUPERACIÓN ═══════════════════ */
function AuthScreen({ onRegister, onLogin, onRecover, onReset, toast }: {
  onRegister: (d: { name: string; handle: string; email: string; pass: string; birthDate: string; country: string; currency: Cur }) => Promise<string | null>;
  onLogin: (email: string, pass: string) => Promise<string | null>;
  onRecover: (email: string) => Promise<string | null>;
  onReset: () => void;
  toast: (m: string, t?: Tone) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [recovering, setRecovering] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [f, setF] = useState({ name: "", handle: "", email: "", pass: "", pass2: "", birthDate: "", terms: false, country: "ES", currency: "EUR" as Cur });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [detected, setDetected] = useState(false);

  /* Al abrir el registro, inferimos país/moneda por IP (si el usuario no
     los ha tocado, se rellenan solos). */
  useEffect(() => {
    let alive = true;
    void detectCountry().then((d) => {
      if (!alive || !d) return;
      setDetected(true);
      setF((prev) => ({ ...prev, country: d.cc, currency: COUNTRY_LIST.find((c) => c.cc === d.cc)?.cur ?? prev.currency }));
    });
    return () => { alive = false; };
  }, []);

  const submit = async () => {
    const e: Record<string, string> = {};
    const email = f.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "Introduce un email válido";
    if (recovering) {
      setErrs(e);
      if (Object.keys(e).length) return;
      setBusy(true);
      const err = await onRecover(email);
      setBusy(false);
      if (err) { setErrs({ form: err }); return; }
      setRecovered(true);
      return;
    }
    if (f.pass.length < 8) e.pass = "Mínimo 8 caracteres";
    if (mode === "register") {
      if (f.name.trim().length < 2) e.name = "Tu nombre real (mín. 2 caracteres)";
      if (!/^[a-z0-9_]{3,18}$/.test(f.handle.trim())) e.handle = "3–18 caracteres: letras, números o _";
      if (f.pass2 !== f.pass) e.pass2 = "Las contraseñas no coinciden";
      if (!f.birthDate) e.birth = "Necesaria para verificar tu edad";
      else if (ageFrom(f.birthDate) < 18) e.birth = `Debes tener al menos 18 años para usar ${BRAND}`;
      else if (ageFrom(f.birthDate) > 120) e.birth = "Revisa la fecha de nacimiento";
      if (!f.terms) e.terms = "Debes aceptar las normas de la comunidad";
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const err = mode === "register"
      ? await onRegister({ name: f.name.trim(), handle: f.handle.trim().toLowerCase(), email, pass: f.pass, birthDate: f.birthDate, country: f.country, currency: f.currency })
      : await onLogin(email, f.pass);
    setBusy(false);
    if (err) { setErrs({ form: err }); return; }
    toast(mode === "register" ? "Cuenta creada. Verificando tus datos…" : "Sesión iniciada.", "ok");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0F172A] text-[#F8FAFC]">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" style={{ maskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 20%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 20%, transparent 75%)" }} />
      <div className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full opacity-[0.10]" style={{ background: "radial-gradient(circle, #2563EB, transparent 65%)" }} />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-[26rem] w-[26rem] rounded-full opacity-[0.08]" style={{ background: "radial-gradient(circle, #7C3AED, transparent 65%)" }} />
      <div className="noise-layer" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-4 py-10 lg:flex-row lg:gap-16">
        <div className="w-full max-w-xl lg:flex-1">
          <div className="anim-fade-up"><Logo size={46} /></div>
          <h1 className="anim-fade-up mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl" style={{ fontFamily: DISPLAY, animationDelay: "60ms" }}>
            Elige lo que quieres.<br />Paga <span className="text-[#2563EB]">solo por eso</span>.
          </h1>
          <p className="anim-fade-up mt-4 max-w-md text-[15px] leading-relaxed text-[#94A3B8]" style={{ animationDelay: "120ms" }}>
            Únete gratis: mira perfiles, envía solicitudes de amistad y chatea sin pagar nada.
            Solo se paga Premium si quieres publicar, y cada contenido decide su propio precio.
          </p>
          <div className="anim-fade-up mt-8 space-y-4" style={{ animationDelay: "180ms" }}>
            {[
              ["1", "Registro y verificación", "Cada cuenta confirma su identidad y mayoría de edad antes de entrar."],
              ["2", "Amistad y chat gratis", "Personas unidas, perfiles, solicitudes de amistad y mensajes: 0 € para siempre."],
              ["3", "Publica y cobra (Premium)", "Con 9,99 €/mes subes fotos y videos, les pones precio y recibes el 85 % de cada venta."],
            ].map(([n, t, d]) => (
              <div key={n} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#334155] bg-[#1E293B] font-mono text-[13px] font-bold text-[#2563EB]">{n}</span>
                <div>
                  <p className="text-[15px] font-bold">{t}</p>
                  <p className="text-[13px] text-[#94A3B8]">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="anim-fade-up w-full max-w-md" style={{ animationDelay: "140ms" }}>
          <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-6 shadow-2xl sm:p-7">
            {recovered ? (
              <div className="anim-fade-up py-4 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#10B981]/12 text-[#10B981]"><MailCheck className="h-8 w-8" /></span>
                <h2 className="mt-4 text-[22px] font-extrabold" style={{ fontFamily: DISPLAY }}>Solicitud enviada al administrador</h2>
                <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-[#94A3B8]">
                  El administrador de {BRAND} ya ha recibido el aviso por correo.
                  Recibirás tu contraseña en <span className="font-semibold text-[#F8FAFC]">{f.email.trim().toLowerCase()}</span> en cuanto la procese.
                </p>
                <button
                  onClick={() => { setRecovered(false); setRecovering(false); setMode("login"); setErrs({}); }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-6 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
                </button>
              </div>
            ) : (
              <>
                {!recovering && (
                  <div className="mb-5 flex rounded-xl border border-[#334155] bg-[#0F172A] p-1">
                    {(["register", "login"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setErrs({}); }}
                        className={`flex-1 rounded-lg py-2 text-[14px] font-bold transition-all duration-200 ${mode === m ? "bg-[#2563EB] text-white shadow-lg shadow-[#2563EB]/25" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}
                      >
                        {m === "register" ? "Crear cuenta" : "Iniciar sesión"}
                      </button>
                    ))}
                  </div>
                )}
                {recovering && (
                  <div className="mb-5 flex items-center gap-3">
                    <button onClick={() => { setRecovering(false); setErrs({}); }} className="rounded-lg p-2 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
                    <div>
                      <h2 className="text-[18px] font-extrabold" style={{ fontFamily: DISPLAY }}>Recuperar mi contraseña</h2>
                      <p className="text-[12.5px] text-[#94A3B8]">El administrador te la enviará a tu correo registrado.</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3.5">
                  {mode === "register" && !recovering && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Nombre real" error={errs.name}>
                        <input className={inputCls} placeholder="Laura Gómez" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                      </Field>
                      <Field label="Usuario" error={errs.handle}>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#64748B]">@</span>
                          <input className={inputCls + " pl-8"} placeholder="laura_g" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
                        </div>
                      </Field>
                    </div>
                  )}
                  <Field label="Email" error={errs.email}>
                    <input className={inputCls} type="email" placeholder="tu@email.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} onKeyDown={(e) => e.key === "Enter" && recovering && void submit()} />
                  </Field>
                  {mode === "register" && !recovering && (
                    <Field label="Fecha de nacimiento (+18)" error={errs.birth}>
                      <input className={inputCls} type="date" value={f.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
                    </Field>
                  )}
                  {mode === "register" && !recovering && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="País de residencia">
                        <select
                          className={inputCls}
                          value={f.country}
                          onChange={(e) => {
                            const cc = e.target.value;
                            const cur = COUNTRY_LIST.find((c) => c.cc === cc)?.cur ?? f.currency;
                            setF({ ...f, country: cc, currency: cur });
                          }}
                        >
                          {COUNTRY_LIST.map((c) => <option key={c.cc} value={c.cc}>{c.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Moneda">
                        <select className={inputCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Cur })}>
                          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                  {mode === "register" && !recovering && detected && (
                    <p className="flex items-center gap-1.5 text-[11.5px] text-[#64748B]">
                      <Globe className="h-3.5 w-3.5 text-[#2563EB]" /> Detectamos tu país por tu conexión; puedes cambiarlo arriba.
                    </p>
                  )}
                  {!recovering && (
                    <Field label="Contraseña" error={errs.pass}>
                      <div className="relative">
                        <input className={inputCls + " pr-11"} type={showPass ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void submit()} />
                        <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] transition hover:text-[#F8FAFC]" aria-label="Mostrar contraseña">
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </Field>
                  )}
                  {mode === "register" && !recovering && (
                    <>
                      <Field label="Repite la contraseña" error={errs.pass2}>
                        <input className={inputCls} type={showPass ? "text" : "password"} placeholder="••••••••" value={f.pass2} onChange={(e) => setF({ ...f, pass2: e.target.value })} />
                      </Field>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#334155] bg-[#0F172A] p-3 transition hover:border-[#2563EB]/50">
                        <input type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#2563EB]" />
                        <span className="text-[12.5px] leading-relaxed text-[#94A3B8]">
                          Soy mayor de 18 años y acepto las <span className="font-semibold text-[#F8FAFC]">Normas de la comunidad</span> y la <span className="font-semibold text-[#F8FAFC]">Política de privacidad</span>.
                          {errs.terms && <span className="mt-1 flex items-center gap-1 font-medium text-[#F87171]"><AlertCircle className="h-3.5 w-3.5" />{errs.terms}</span>}
                        </span>
                      </label>
                    </>
                  )}
                  {errs.form && (
                    <p className="anim-fade-in flex items-center gap-2 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2.5 text-[13px] font-semibold text-[#FCA5A5]">
                      <AlertCircle className="h-4 w-4 shrink-0" />{errs.form}
                    </p>
                  )}
                  <button
                    onClick={() => void submit()}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[15px] font-bold text-white transition-all duration-200 hover:bg-[#1D4ED8] active:scale-[0.98] disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                      : recovering ? <><KeyRound className="h-4 w-4" /> Pedir mi contraseña</>
                      : mode === "register" ? <><UserIcon className="h-4 w-4" /> Crear mi cuenta</>
                      : <><Zap className="h-4 w-4" /> Entrar</>}
                  </button>
                </div>

                {!recovering && (
                  <button
                    onClick={() => { setRecovering(true); setErrs({}); }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#334155] bg-[#0F172A] py-2.5 text-[13px] font-semibold text-[#93C5FD] transition-all duration-200 hover:border-[#2563EB]/60 hover:bg-[#2563EB]/10 active:scale-[0.98]"
                  >
                    <KeyRound className="h-4 w-4" /> ¿Olvidaste tu contraseña? Recupérala
                  </button>
                )}
                <div className="mt-3 flex items-center justify-center gap-3 text-[12px]">
                  {!recovering ? (
                    <span className="text-[#64748B]">
                      {mode === "register" ? "Tu cuenta pasará una verificación automática." : "¿Aún no tienes cuenta? Créala arriba."}
                    </span>
                  ) : (
                    <span className="text-[#64748B]">Escribe el email con el que te registraste.</span>
                  )}
                </div>
              </>
            )}
          </div>
          {confirmReset ? (
            <div className="anim-fade-in mt-3 flex items-center justify-center gap-2 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/8 px-3 py-2.5">
              <span className="text-[12px] font-semibold text-[#FCA5A5]">¿Borrar todas las cuentas y archivos?</span>
              <button onClick={onReset} className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#DC2626] active:scale-95">Sí, restablecer</button>
              <button onClick={() => setConfirmReset(false)} className="rounded-lg border border-[#334155] px-2.5 py-1.5 text-[12px] font-semibold text-[#94A3B8] transition hover:text-white">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="mt-3 block w-full text-center text-[11.5px] font-semibold text-[#64748B] underline-offset-4 transition hover:text-[#F87171] hover:underline">
              ¿Cuentas antiguas que ya no sirven? Restablecer la plataforma
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ VERIFICACIÓN ═══════════════════ */
function VerificationScreen({ user, onApproved }: { user: UserT; onApproved: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: <Check className="h-4 w-4" strokeWidth={2.5} />, t: "Email con formato y dominio válidos", d: user.email },
    { icon: <ShieldCheck className="h-4 w-4" />, t: "Mayoría de edad confirmada (+18)", d: `${ageFrom(user.birthDate)} años según tu fecha de nacimiento` },
    { icon: <UserIcon className="h-4 w-4" />, t: "Identidad de la cuenta verificada", d: `@${user.handle} · sin duplicados en el registro` },
    { icon: <BadgeCheck className="h-4 w-4" />, t: "Cuenta aprobada", d: "Ya puedes entrar a la plataforma" },
  ];
  useEffect(() => {
    const ts = steps.map((_, i) => window.setTimeout(() => { setStep(i + 1); if (i === steps.length - 1) window.setTimeout(onApproved, 700); }, 900 * (i + 1)));
    return () => ts.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#0F172A] px-4 text-[#F8FAFC]">
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 rounded-full opacity-[0.09]" style={{ background: "radial-gradient(circle, #2563EB, transparent 65%)" }} />
      <div className="anim-fade-up w-full max-w-md rounded-2xl border border-[#334155] bg-[#1E293B] p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} hue={user.hue} size={46} />
          <div>
            <p className="text-[16px] font-bold">{user.name}</p>
            <p className="text-[13px] text-[#94A3B8]">Verificación automática de tu registro</p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {steps.map((s, i) => {
            const done = step > i;
            const active = step === i;
            return (
              <div key={i} className={`flex items-center gap-3.5 rounded-xl border p-3.5 transition-all duration-300 ${done ? "border-[#10B981]/40 bg-[#10B981]/8" : active ? "border-[#2563EB]/50 bg-[#2563EB]/8" : "border-[#334155] bg-[#0F172A] opacity-50"}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${done ? "bg-[#10B981] text-white" : active ? "bg-[#2563EB] text-white" : "bg-[#1E293B] text-[#64748B]"}`}>
                  {active ? <Loader2 className="h-4 w-4 animate-spin" /> : s.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold">{s.t}</p>
                  <p className="truncate font-mono text-[11.5px] text-[#94A3B8]">{done || active ? s.d : "en cola…"}</p>
                </div>
                {done && <Check className="ml-auto h-4 w-4 shrink-0 text-[#10B981]" strokeWidth={2.5} />}
              </div>
            );
          })}
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#0F172A]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] transition-all duration-700" style={{ width: `${(step / steps.length) * 100}%` }} />
        </div>
        <p className="mt-3 text-center text-[12px] text-[#64748B]">Proceso automático · tus datos nunca salen de tu dispositivo en esta demo técnica</p>
      </div>
    </div>
  );
}

/* ═══════════════════ COMPOSER ═══════════════════ */
function Composer({ me, onPublish, onClose }: { me: UserT; onPublish: (d: { text: string; media: DraftMedia | null; sell: boolean; priceCents: number }) => Promise<string | null>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<DraftMedia | null>(null);
  const [sell, setSell] = useState(false);
  const [price, setPrice] = useState("4,99");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const priceCents = Math.round((parseFloat(price.replace(",", ".")) || 0) * 100);
  const priceOk = priceCents >= MIN_PPV && priceCents <= MAX_PPV;
  const canPost = !busy && (text.trim().length > 0 || media) && (!sell || (media !== null && priceOk));

  const acceptFile = async (file: File | undefined | null) => {
    setErr("");
    if (!file) return;
    if (media) URL.revokeObjectURL(media.url);
    if (file.type.startsWith("image/")) {
      if (file.size > MAX_IMG_MB * 1048576) { setErr(`La imagen supera ${MAX_IMG_MB} MB. Comprímela e inténtalo de nuevo.`); return; }
      const { blob, w, h } = await compressImage(file);
      setMedia({ kind: "image", blob, url: URL.createObjectURL(blob), name: file.name, size: blob.size, w, h, dur: 0 });
    } else if (file.type.startsWith("video/")) {
      const tmp = URL.createObjectURL(file);
      const { dur, w, h } = await probeVideo(tmp);
      URL.revokeObjectURL(tmp);
      setMedia({ kind: "video", blob: file, url: URL.createObjectURL(file), name: file.name, size: file.size, w, h, dur });
    } else {
      setErr("Formato no compatible: sube una imagen (JPG/PNG/WebP) o un video (MP4/WebM).");
    }
  };

  const publish = async () => {
    if (!canPost) return;
    setBusy(true);
    const e = await onPublish({ text: text.trim(), media, sell, priceCents: sell ? priceCents : 0 });
    setBusy(false);
    if (!e) onClose(); else setErr(e);
  };

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
        <h3 className="text-[17px] font-bold" style={{ fontFamily: DISPLAY }}>Nueva publicación</h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex gap-3">
          <Avatar name={me.name} hue={me.hue} size={42} photoId={me.avatarId} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{me.name} <span className="font-normal text-[#64748B]">@{me.handle}</span></p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1000))}
              placeholder="¿Qué quieres compartir hoy?"
              rows={3}
              className="mt-1 w-full resize-none bg-transparent text-[15px] text-[#F8FAFC] outline-none placeholder:text-[#64748B]"
            />
          </div>
        </div>

        {!media ? (
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void acceptFile(e.dataTransfer.files?.[0]); }}
            className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-9 transition-all duration-200 ${drag ? "scale-[1.01] border-[#2563EB] bg-[#2563EB]/10" : "border-[#334155] bg-[#0F172A] hover:border-[#2563EB]/60 hover:bg-[#2563EB]/5"}`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#2563EB]/15 text-[#2563EB]"><Upload className="h-6 w-6" /></span>
            <p className="text-[15px] font-bold">Arrastra tu foto o video aquí</p>
            <p className="text-[13px] text-[#94A3B8]">o haz clic para elegirlo desde tu ordenador</p>
            <p className="font-mono text-[11px] text-[#64748B]">JPG · PNG · WebP · MP4 · WebM — imágenes hasta {MAX_IMG_MB} MB · videos sin límite</p>
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-[#334155] bg-black">
            {media.kind === "image"
              ? <img src={media.url} alt={media.name} className="max-h-80 w-full object-contain" />
              : <video src={media.url} controls className="max-h-80 w-full" />}
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-[#020617]/85 px-2.5 py-1.5 backdrop-blur">
              {media.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-[#2563EB]" /> : <Video className="h-3.5 w-3.5 text-[#7C3AED]" />}
              <span className="max-w-40 truncate font-mono text-[11px] text-[#F8FAFC]">{media.name}</span>
              <span className="font-mono text-[11px] text-[#94A3B8]">{fmtSize(media.size)}{media.dur > 0 ? ` · ${fmtDur(media.dur)}` : media.w ? ` · ${media.w}×${media.h}` : ""}</span>
            </div>
            <button onClick={() => { URL.revokeObjectURL(media.url); setMedia(null); }} className="absolute right-3 top-3 rounded-lg bg-[#020617]/85 p-1.5 text-white backdrop-blur transition hover:bg-[#EF4444] active:scale-90" aria-label="Quitar archivo">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { void acceptFile(e.target.files?.[0]); e.target.value = ""; }} />

        <div className={`rounded-2xl border p-4 transition-all duration-200 ${sell ? "border-[#7C3AED]/60 bg-[#7C3AED]/8" : "border-[#334155] bg-[#0F172A]"}`}>
          <button onClick={() => setSell((v) => !v)} className="flex w-full items-center gap-3 text-left" role="switch" aria-checked={sell}>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${sell ? "bg-[#7C3AED]" : "bg-[#334155]"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${sell ? "left-[22px]" : "left-0.5"}`} />
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-[14px] font-bold"><Gem className={`h-4 w-4 ${sell ? "text-[#C4B5FD]" : "text-[#64748B]"}`} /> Vender este contenido</span>
              <span className="text-[12.5px] text-[#94A3B8]">{sell ? "Solo lo verán quienes lo desbloqueen o estén suscritos a ti." : "Gratis para toda la comunidad."}</span>
            </span>
          </button>
          {sell && (
            <div className="anim-fade-up mt-4 flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Precio de desbloqueo</span>
                <div className="relative">
                  <input className={inputCls + " pr-8 font-mono"} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, "").slice(0, 7))} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#94A3B8]">€</span>
                </div>
                {!priceOk && <p className="mt-1 text-[12px] font-medium text-[#F87171]">Entre 1,00 € y 500,00 €</p>}
              </div>
              <div className="pt-5 font-mono text-[12px] leading-relaxed text-[#94A3B8]">
                <p>Tú recibes <span className="font-bold text-[#6EE7B7]">{priceOk ? eur(Math.round((priceCents * (10000 - FEE_BPS)) / 10000)) : "—"}</span></p>
                <p>Plataforma <span className="font-bold text-[#F8FAFC]">{priceOk ? eur(Math.round((priceCents * FEE_BPS) / 10000)) : "—"}</span></p>
              </div>
            </div>
          )}
          {sell && !media && <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-[#FCD34D]"><AlertCircle className="h-4 w-4" /> Para vender, añade una foto o un video a la publicación.</p>}
        </div>

        {err && <p className="anim-fade-in flex items-center gap-2 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2.5 text-[13px] font-semibold text-[#FCA5A5]"><AlertCircle className="h-4 w-4 shrink-0" />{err}</p>}

        <div className="flex items-center gap-3">
          <span className={`ml-auto font-mono text-[11px] tabular-nums ${text.length > 900 ? "text-[#FCD34D]" : "text-[#64748B]"}`}>{text.length}/1000</span>
          <button onClick={onClose} className="rounded-xl border border-[#334155] px-4 py-2.5 text-[14px] font-bold text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white active:scale-95">Cancelar</button>
          <button
            onClick={() => void publish()}
            disabled={!canPost}
            className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-6 py-2.5 text-[14px] font-bold text-white transition-all duration-200 hover:bg-[#1D4ED8] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : sell ? <Lock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {busy ? "Publicando…" : sell ? `Publicar · ${priceOk ? eur(priceCents) : "—"}` : "Publicar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════ PERSON CARD ═══════════════════ */
function PersonRow({ user, me, rel, onOpen, onMessage, onFriend, onAccept, onDecline, compact = false }: {
  user: UserT; me: UserT; rel: "none" | "outgoing" | "incoming" | "friends";
  onOpen: () => void; onMessage: () => void;
  onFriend: () => void; onAccept: () => void; onDecline: () => void;
  compact?: boolean;
}) {
  const premiumU = (user.premiumUntil ?? 0) > Date.now();
  return (
    <div className="flex items-center gap-3">
      <button onClick={onOpen} className="transition active:scale-95" aria-label={`Perfil de ${user.name}`}>
        <Avatar name={user.name} hue={user.hue} size={compact ? 40 : 46} photoId={user.avatarId} />
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 truncate text-[14px] font-bold">
          {user.name}
          {premiumU && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" aria-label="Premium" />}
          {rel === "friends" && <span className="rounded-md bg-[#10B981]/12 px-1.5 py-0.5 text-[9.5px] font-bold text-[#6EE7B7]">AMIGOS</span>}
        </p>
        <p className="truncate text-[12px] text-[#64748B]">@{user.handle}{premiumU ? ` · ${eur(user.subPriceCents)}/mes` : ""}</p>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {rel === "incoming" ? (
          <>
            <button onClick={onAccept} className="rounded-lg bg-[#10B981] px-2.5 py-1.5 text-[11.5px] font-bold text-white transition hover:brightness-110 active:scale-95" title="Aceptar amistad">Aceptar</button>
            <button onClick={onDecline} className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11.5px] font-bold text-[#94A3B8] transition hover:border-[#EF4444]/60 hover:text-[#F87171] active:scale-95" aria-label="Rechazar"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : rel === "friends" ? (
          <button onClick={onMessage} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95">Mensaje</button>
        ) : rel === "outgoing" ? (
          <span className="flex items-center gap-1 rounded-lg border border-[#334155] bg-[#0F172A] px-2.5 py-1.5 text-[11.5px] font-bold text-[#94A3B8]"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Enviada</span>
        ) : (
          <>
            {!compact && (
              <button onClick={onMessage} className="rounded-lg border border-[#334155] p-1.5 text-[#94A3B8] transition hover:border-[#475569] hover:text-white active:scale-90" aria-label={`Mensaje a ${user.name}`} title="Mensaje gratis">
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
            <button onClick={onFriend} className="flex items-center gap-1 rounded-lg bg-[#2563EB]/12 px-2.5 py-1.5 text-[11.5px] font-bold text-[#93C5FD] transition hover:bg-[#2563EB]/25 active:scale-95" title="Solicitud de amistad gratis">
              <UserPlus className="h-3.5 w-3.5" /> Amistad
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────── texto con menciones @usuario ─────────────── */
function MentionText({ text, db, onOpen }: { text: string; db: DbT; onOpen: (id: string) => void }) {
  const parts = text.split(/(@[a-z0-9_]+)/gi);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const handle = part.slice(1);
          const u = db.users.find((x) => x.handle.toLowerCase() === handle.toLowerCase());
          if (u) {
            return (
              <button key={i} onClick={() => onOpen(u.id)} className="font-bold text-[#93C5FD] transition hover:underline" title={`Ver perfil de @${u.handle}`}>
                @{u.handle}
              </button>
            );
          }
          return <span key={i} className="text-[#93C5FD]">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/* ═══════════════════ POST CARD ═══════════════════ */
function PostCard({ post, index, me, db, act }: {
  post: PostT; index: number; me: UserT; db: DbT;
  act: {
    like: (id: string) => void;
    comment: (id: string, text: string, replyTo?: { userId: string; handle: string }, parentId?: string) => void;
    unlock: (id: string) => void;
    subscribe: (creatorId: string) => void; del: (id: string) => void; openProfile: (id: string) => void;
    toast: (m: string, t?: Tone) => void;
  };
}) {
  const author = db.users.find((u) => u.id === post.authorId);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [ctext, setCtext] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [heartAnim, setHeartAnim] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; userId: string; handle: string; name: string } | null>(null);
  if (!author) return null;

  const liked = post.likes.includes(me.id);
  const mine = post.authorId === me.id;
  const subbed = db.subs.some((s) => s.fanId === me.id && s.creatorId === author.id);
  const unlocked = mine || post.tier === "public" || post.unlocks.includes(me.id) || subbed;
  const locked = !unlocked;
  const authorPremium = (author.premiumUntil ?? 0) > Date.now();

  const doLike = () => {
    if (!liked) { setHeartAnim(true); window.setTimeout(() => setHeartAnim(false), 380); }
    act.like(post.id);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#post-${post.id}`);
      act.toast("Enlace copiado al portapapeles.", "ok");
    } catch { act.toast("No se pudo copiar el enlace.", "warn"); }
  };
  const sendComment = () => {
    if (!ctext.trim()) return;
    let text = ctext.trim();
    // Si estoy respondiendo a alguien, me aseguro de que la mención vaya al inicio.
    if (replyTarget && !text.toLowerCase().startsWith(`@${replyTarget.handle.toLowerCase()}`)) {
      text = `@${replyTarget.handle} ${text}`;
    }
    act.comment(
      post.id,
      text,
      replyTarget ? { userId: replyTarget.userId, handle: replyTarget.handle } : undefined,
      replyTarget ? replyTarget.commentId : undefined,
    );
    setCtext("");
    setReplyTarget(null);
  };

  const startReply = (c: CommentT) => {
    const cu = db.users.find((u) => u.id === c.userId);
    if (!cu) return;
    // Si respondo a una respuesta, el hilo sigue colgando del comentario padre.
    const threadParent = c.parentId ?? c.id;
    setReplyTarget({ commentId: threadParent, userId: cu.id, handle: cu.handle, name: cu.name });
    setCtext(`@${cu.handle} `);
    setCommentsOpen(true);
  };

  const renderComment = (c: CommentT, isReply: boolean) => {
    const cu = db.users.find((u) => u.id === c.userId);
    if (!cu) return null;
    return (
      <div className="flex gap-2.5">
        <button onClick={() => act.openProfile(cu.id)} className="shrink-0 transition active:scale-95" aria-label={`Perfil de ${cu.name}`}>
          <Avatar name={cu.name} hue={cu.hue} size={isReply ? 26 : 30} photoId={cu.avatarId} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-[#0F172A] px-3.5 py-2.5">
            <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] font-bold">
              <button onClick={() => act.openProfile(cu.id)} className="transition hover:underline">{cu.name}</button>
              <span className="font-normal text-[#64748B]">· {timeAgo(c.at)}</span>
            </p>
            {c.replyTo && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#64748B]">
                ↳ en respuesta a
                <button
                  onClick={() => { const u = db.users.find((x) => x.id === c.replyTo!.userId); if (u) act.openProfile(u.id); }}
                  className="font-bold text-[#93C5FD] transition hover:underline"
                >
                  @{c.replyTo.handle}
                </button>
              </p>
            )}
            <p className="mt-0.5 text-[14px] leading-relaxed text-[#CBD5E1]">
              <MentionText text={c.text} db={db} onOpen={act.openProfile} />
            </p>
          </div>
          <button onClick={() => startReply(c)} className="mt-1 ml-1 text-[11.5px] font-bold text-[#94A3B8] transition hover:text-[#93C5FD]">
            Responder
          </button>
        </div>
      </div>
    );
  };

  return (
    <Reveal delay={Math.min(index * 70, 280)}>
      <article className="overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B] transition-colors duration-200 hover:border-[#475569]">
        <div className="flex items-start gap-3 p-4 pb-3">
          <button onClick={() => act.openProfile(author.id)} className="transition active:scale-95" aria-label={`Perfil de ${author.name}`}>
            <Avatar name={author.name} hue={author.hue} size={44} photoId={author.avatarId} />
          </button>
          <button onClick={() => act.openProfile(author.id)} className="min-w-0 flex-1 text-left">
            <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold leading-tight">
              <span className="truncate">{author.name}</span>
              {authorPremium && <BadgeCheck className="h-4 w-4 shrink-0 text-[#2563EB]" aria-label="Creador Premium" />}
            </p>
            <p className="truncate text-[13px] text-[#94A3B8]">@{author.handle} · {timeAgo(post.createdAt)}</p>
          </button>
          {post.tier === "ppv" ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#7C3AED]/50 bg-[#7C3AED]/12 px-2.5 py-1 text-[11px] font-bold text-[#C4B5FD]">
              <Lock className="h-3 w-3" /> {eur(post.priceCents)}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#334155] bg-[#0F172A] px-2.5 py-1 text-[11px] font-semibold text-[#94A3B8]">
              <Unlock className="h-3 w-3" /> Público
            </span>
          )}
          {mine && (
            confirmDel ? (
              <span className="anim-fade-in flex items-center gap-1.5">
                <button onClick={() => act.del(post.id)} className="rounded-lg bg-[#EF4444] px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#DC2626] active:scale-95">Eliminar</button>
                <button onClick={() => setConfirmDel(false)} className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] font-semibold text-[#94A3B8] transition hover:text-white">No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="rounded-lg p-1.5 text-[#64748B] transition hover:bg-[#0F172A] hover:text-[#F87171]" aria-label="Eliminar publicación"><Trash2 className="h-4 w-4" /></button>
            )
          )}
        </div>

        {post.text && <p className="whitespace-pre-line px-4 pb-3 text-[15px] leading-relaxed text-[#F8FAFC]">{post.text}</p>}

        <div className="relative px-0">
          {post.media && <MediaView media={post.media} blurred={locked} rounded={false} />}
          {locked && post.media && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#020617]/45 px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-[#334155] bg-[#0F172A]/90 text-[#C4B5FD] backdrop-blur"><Lock className="h-6 w-6" /></span>
              <div>
                <p className="text-[17px] font-bold" style={{ fontFamily: DISPLAY }}>Contenido de pago</p>
                <p className="mt-0.5 text-[13px] text-[#CBD5E1]">Desbloqueo único de @{author.handle} · se queda en tu biblioteca para siempre</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => act.unlock(post.id)} className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[14px] font-bold text-white transition-all duration-200 hover:bg-[#1D4ED8] active:scale-95">
                  <Unlock className="h-4 w-4" /> Desbloquear · {eur(post.priceCents)}
                </button>
                {!subbed && (
                  <button onClick={() => act.subscribe(author.id)} className="flex items-center gap-2 rounded-xl border border-[#7C3AED]/60 bg-[#0F172A]/80 px-4 py-2.5 text-[14px] font-bold text-[#C4B5FD] backdrop-blur transition hover:bg-[#7C3AED]/20 active:scale-95">
                    <Crown className="h-4 w-4" /> Suscribirme · {eur(author.subPriceCents)}/mes
                  </button>
                )}
              </div>
            </div>
          )}
          {mine && post.tier === "ppv" && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-[#020617]/85 px-2.5 py-1.5 text-[11.5px] font-bold text-[#6EE7B7] backdrop-blur">
              <Eye className="h-3.5 w-3.5" /> {post.unlocks.length} {post.unlocks.length === 1 ? "compra" : "compras"} · {eur(post.unlocks.length * Math.round((post.priceCents * (10000 - FEE_BPS)) / 10000))} ganados
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 px-3 py-1.5">
          <button onClick={doLike} aria-pressed={liked} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold transition-all duration-200 active:scale-90 ${liked ? "text-[#EC4899]" : "text-[#94A3B8] hover:bg-[#0F172A] hover:text-[#EC4899]"}`}>
            <Heart className={`h-5 w-5 ${heartAnim ? "anim-heart" : ""}`} fill={liked ? "currentColor" : "none"} strokeWidth={1.8} />
            <span className="tabular-nums">{fmtN(post.likes.length)}</span>
          </button>
          <button onClick={() => setCommentsOpen((v) => !v)} aria-expanded={commentsOpen} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold transition-all duration-200 active:scale-90 ${commentsOpen ? "text-[#2563EB]" : "text-[#94A3B8] hover:bg-[#0F172A] hover:text-[#93C5FD]"}`}>
            <MessageSquare className="h-5 w-5" />
            <span className="tabular-nums">{post.comments.length}</span>
          </button>
          <button onClick={() => void share()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-[#94A3B8] transition-all duration-200 hover:bg-[#0F172A] hover:text-[#6EE7B7] active:scale-90" aria-label="Compartir">
            <Share2 className="h-5 w-5" /> <span className="hidden sm:inline">Compartir</span>
          </button>
        </div>

        {commentsOpen && (
          <div className="anim-fade-in space-y-3 border-t border-[#334155]/70 p-4">
            {replyTarget && (
              <div className="flex items-center justify-between rounded-lg bg-[#2563EB]/10 px-3 py-1.5 text-[12px] font-semibold text-[#93C5FD]">
                <span>Respondiendo a <span className="font-bold">@{replyTarget.handle}</span></span>
                <button onClick={() => { setReplyTarget(null); setCtext(""); }} className="text-[#94A3B8] transition hover:text-white" aria-label="Cancelar respuesta">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {post.comments.filter((c) => !c.parentId).map((c) => {
              const replies = post.comments.filter((r) => r.parentId === c.id);
              return (
                <div key={c.id} className="space-y-2">
                  {renderComment(c, false)}
                  {replies.map((r) => (
                    <div key={r.id} className="ml-7 border-l-2 border-[#334155]/60 pl-3 sm:ml-9">
                      {renderComment(r, true)}
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="flex items-center gap-2.5">
              <Avatar name={me.name} hue={me.hue} size={30} photoId={me.avatarId} />
              <input
                className={inputCls + " flex-1 py-2 text-[14px]"}
                placeholder={replyTarget ? `Responder a @${replyTarget.handle}…` : "Escribe un comentario… (usa @usuario para mencionar)"}
                value={ctext}
                onChange={(e) => setCtext(e.target.value.slice(0, 400))}
                onKeyDown={(e) => e.key === "Enter" && sendComment()}
              />
              <button onClick={sendComment} disabled={!ctext.trim()} className="rounded-xl bg-[#2563EB] p-2.5 text-white transition hover:bg-[#1D4ED8] active:scale-90 disabled:opacity-40" aria-label="Enviar comentario">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </article>
    </Reveal>
  );
}

/* ═══════════════════ CHATS ═══════════════════ */
function ChatsView({ db, me, activeId, setActiveId, onSend, onOpenProfile, onFriendReq, rel }: {
  db: DbT; me: UserT; activeId: string | null; setActiveId: (id: string | null) => void;
  onSend: (to: string, text: string) => void; onOpenProfile: (id: string) => void;
  onFriendReq: (to: string) => void; rel: (otherId: string) => "none" | "outgoing" | "incoming" | "friends";
}) {
  const [text, setText] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const partners = useMemo(() => {
    const ids = new Set<string>();
    db.msgs.forEach((m) => { if (m.from === me.id) ids.add(m.to); if (m.to === me.id) ids.add(m.from); });
    return [...ids]
      .map((id) => db.users.find((u) => u.id === id))
      .filter((u): u is UserT => !!u)
      .map((u) => ({ u, last: db.msgs.filter((m) => (m.from === me.id && m.to === u.id) || (m.to === me.id && m.from === u.id)).sort((a, b) => b.at - a.at)[0]! }))
      .sort((a, b) => b.last.at - a.last.at);
  }, [db.msgs, db.users, me.id]);

  const active = activeId ? db.users.find((u) => u.id === activeId) : null;
  const thread = active
    ? db.msgs.filter((m) => (m.from === me.id && m.to === active.id) || (m.to === me.id && m.from === active.id)).sort((a, b) => a.at - b.at)
    : [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread.length, activeId]);

  const send = () => {
    if (!active || !text.trim()) return;
    onSend(active.id, text.trim());
    setText("");
  };

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>Mensajes</h1>
            <p className="mt-0.5 text-[13.5px] text-[#94A3B8]">Chatea gratis con cualquier persona registrada en {BRAND}.</p>
          </div>
          <button onClick={() => setNewOpen(true)} className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95">
            <UserPlus className="h-4 w-4" /> Nuevo chat
          </button>
        </div>
      </Reveal>

      <Reveal delay={60} className="grid gap-4 overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B] lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className={`border-[#334155] lg:border-r ${active ? "hidden lg:block" : ""}`}>
          {partners.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-[#334155]" />
              <p className="mt-3 text-[14px] font-bold">Aún no tienes conversaciones</p>
              <p className="mt-1 text-[12.5px] text-[#94A3B8]">Escribe a cualquier persona unida: es gratis y no necesitas Premium.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#334155]/70">
              {partners.map(({ u, last }) => {
                const unread = db.msgs.filter((m) => m.from === u.id && m.to === me.id && !m.readBy.includes(me.id)).length;
                return (
                  <button key={u.id} onClick={() => setActiveId(u.id)} className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#0F172A] ${activeId === u.id ? "bg-[#0F172A]" : ""}`}>
                    <Avatar name={u.name} hue={u.hue} size={42} photoId={u.avatarId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold">{u.name}</p>
                      <p className={`truncate text-[12.5px] ${unread ? "font-semibold text-[#F8FAFC]" : "text-[#64748B]"}`}>{last.text}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10.5px] text-[#64748B]">{timeAgo(last.at)}</span>
                      {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#2563EB] px-1 text-[10px] font-bold text-white">{unread}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={`flex h-[520px] flex-col ${!active ? "hidden lg:flex" : ""}`}>
          {!active ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <MessageSquare className="mx-auto h-10 w-10 text-[#334155]" />
                <p className="mt-3 text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Elige una conversación</p>
                <p className="mt-1 max-w-xs text-[13px] text-[#94A3B8]">Los mensajes entre personas registradas son gratuitos para siempre.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-[#334155] px-4 py-3">
                <button onClick={() => setActiveId(null)} className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white lg:hidden" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
                <button onClick={() => onOpenProfile(active.id)} className="transition active:scale-95"><Avatar name={active.name} hue={active.hue} size={38} photoId={active.avatarId} /></button>
                <button onClick={() => onOpenProfile(active.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14px] font-bold">{active.name}</p>
                  <p className="text-[11.5px] text-[#64748B]">@{active.handle}{rel(active.id) === "friends" ? " · amigos" : ""}</p>
                </button>
                {rel(active.id) === "none" && (
                  <button onClick={() => onFriendReq(active.id)} className="flex items-center gap-1.5 rounded-lg bg-[#2563EB]/12 px-3 py-1.5 text-[12px] font-bold text-[#93C5FD] transition hover:bg-[#2563EB]/25 active:scale-95">
                    <UserPlus className="h-3.5 w-3.5" /> Amistad
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {thread.map((m) => {
                  const own = m.from === me.id;
                  return (
                    <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${own ? "rounded-br-md bg-[#2563EB] text-white" : "rounded-bl-md bg-[#0F172A] text-[#F8FAFC]"}`}>
                        <p className="text-[14px] leading-relaxed">{m.text}</p>
                        <p className={`mt-0.5 text-right text-[10px] ${own ? "text-white/60" : "text-[#64748B]"}`}>
                          {new Date(m.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          {own && <span className="ml-1">{m.readBy.includes(active.id) ? "✓✓" : "✓"}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="flex items-center gap-2.5 border-t border-[#334155] p-3.5">
                <input
                  className={inputCls + " flex-1"}
                  placeholder={`Mensaje para ${active.name.split(" ")[0]}…`}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 800))}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                />
                <button onClick={send} disabled={!text.trim()} className="rounded-xl bg-[#2563EB] p-3 text-white transition hover:bg-[#1D4ED8] active:scale-90 disabled:opacity-40" aria-label="Enviar">
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </Reveal>

      {newOpen && (
        <Modal open onClose={() => setNewOpen(false)}>
          <NewChatList db={db} me={me} onPick={(id) => { setActiveId(id); setNewOpen(false); }} onClose={() => setNewOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
function NewChatList({ db, me, onPick, onClose }: { db: DbT; me: UserT; onPick: (id: string) => void; onClose: () => void }) {
  const people = db.users.filter((u) => u.id !== me.id && u.status === "approved").sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
        <h3 className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Nuevo chat</h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
      </div>
      <div className="max-h-[50vh] divide-y divide-[#334155]/70 overflow-y-auto">
        {people.length === 0 && <p className="p-6 text-center text-[13.5px] text-[#94A3B8]">Todavía no hay otras personas registradas.</p>}
        {people.map((u) => (
          <button key={u.id} onClick={() => onPick(u.id)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-[#0F172A]">
            <Avatar name={u.name} hue={u.hue} size={40} photoId={u.avatarId} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{u.name}</p>
              <p className="text-[12px] text-[#64748B]">@{u.handle}</p>
            </div>
            <MessageSquare className="h-4 w-4 text-[#2563EB]" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════ PERSONAS (directorio) ═══════════════════ */
function PeopleView({ db, me, onOpen, onMessage, onFriend, onAccept, onDecline, rel }: {
  db: DbT; me: UserT;
  onOpen: (id: string) => void; onMessage: (id: string) => void;
  onFriend: (id: string) => void; onAccept: (reqId: string) => void; onDecline: (reqId: string) => void;
  rel: (otherId: string) => "none" | "outgoing" | "incoming" | "friends";
}) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<"todos" | "amigos" | "premium">("todos");
  const people = db.users.filter((u) => u.id !== me.id && u.status === "approved").sort((a, b) => b.createdAt - a.createdAt);
  const incoming = db.reqs.filter((r) => r.to === me.id && r.status === "pending");
  const friends = people.filter((u) => rel(u.id) === "friends");

  const filtered = people.filter((u) => {
    const txt = `${u.name} ${u.handle}`.toLowerCase();
    if (q.trim() && !txt.includes(q.trim().toLowerCase())) return false;
    if (chip === "amigos") return rel(u.id) === "friends";
    if (chip === "premium") return (u.premiumUntil ?? 0) > Date.now();
    return true;
  });

  const reqFrom = (u: UserT) => incoming.find((r) => r.from === u.id);

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>Personas unidas</h1>
            <p className="mt-0.5 text-[13.5px] text-[#94A3B8]">
              Todos los que se van registrando aparecen aquí. Ver perfiles, enviar amistad y chatear es <span className="font-bold text-[#6EE7B7]">gratis</span>; Premium solo se paga para publicar.
            </p>
          </div>
          <span className="rounded-full border border-[#334155] bg-[#1E293B] px-3.5 py-1.5 text-[12.5px] font-bold text-[#94A3B8]">
            {people.length + 1} {people.length === 0 ? "persona" : "personas"} en {BRAND}
          </span>
        </div>
      </Reveal>

      <Reveal delay={50} className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input className={inputCls + " pl-10"} placeholder="Buscar por nombre o @usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {([["todos", "Todos"], ["amigos", `Amigos (${friends.length})`], ["premium", "Creadores Premium"]] as ["todos" | "amigos" | "premium", string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setChip(id)}
            className={`rounded-xl border px-3.5 py-2.5 text-[13px] font-bold transition-all duration-200 active:scale-95 ${chip === id ? "border-[#2563EB] bg-[#2563EB]/12 text-[#93C5FD]" : "border-[#334155] bg-[#1E293B] text-[#94A3B8] hover:border-[#475569] hover:text-[#F8FAFC]"}`}
          >
            {label}
          </button>
        ))}
      </Reveal>

      <Reveal delay={90} className="overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B]">
        <div className="divide-y divide-[#334155]/70 p-2">
          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center">
              <Users className="mx-auto h-9 w-9 text-[#334155]" />
              <p className="mt-3 text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>
                {people.length === 0 ? "Todavía no hay más personas unidas" : "Nadie coincide con tu búsqueda"}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[#94A3B8]">
                {people.length === 0
                  ? "Cuando alguien se registre y sea aprobado, aparecerá en este listado al instante (en este navegador). En producción se sincroniza con el backend para verlo desde cualquier dispositivo."
                  : "Prueba con otro nombre o cambia el filtro."}
              </p>
            </div>
          )}
          {filtered.map((u) => {
            const rq = reqFrom(u);
            return (
              <div key={u.id} className="rounded-xl px-3 py-3 transition hover:bg-[#0F172A]/60">
                {rq && (
                  <p className="anim-fade-in mb-2 flex items-center gap-2 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/8 px-3 py-2 text-[12px] font-semibold text-[#FCD34D]">
                    <UserPlus className="h-3.5 w-3.5" /> Quiere ser tu amigo
                  </p>
                )}
                <PersonRow
                  user={u} me={me} rel={rel(u.id)}
                  onOpen={() => onOpen(u.id)}
                  onMessage={() => onMessage(u.id)}
                  onFriend={() => onFriend(u.id)}
                  onAccept={() => rq && onAccept(rq.id)}
                  onDecline={() => rq && onDecline(rq.id)}
                />
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

/* ═══════════════════ PERFIL ═══════════════════ */
function ProfileView({ user, me, db, myEarnings, premium, theme, onTheme, onSubPrice, act, onLogout, onMessage }: {
  user: UserT; me: UserT; db: DbT; myEarnings: number; premium: boolean; theme: Theme;
  onTheme: (t: Theme) => void;
  onSubPrice: (c: number) => void;
  act: {
    like: (id: string) => void; comment: (id: string, text: string) => void; unlock: (id: string) => void;
    subscribe: (creatorId: string) => void; del: (id: string) => void; openProfile: (id: string) => void;
    toast: (m: string, t?: Tone) => void;
  };
  onLogout: () => void;
  onMessage: (id: string) => void;
}) {
  const isMe = user.id === me.id;
  const coverUrl = useMediaUrl(user.coverId);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState(user.bio);
  const subbed = db.subs.some((s) => s.fanId === me.id && s.creatorId === user.id);
  const posts = db.posts.filter((p) => p.authorId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const friendCount = db.reqs.filter((r) => r.status === "accepted" && (r.from === user.id || r.to === user.id)).length;

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B]">
          <div className="relative h-36 sm:h-44">
            {coverUrl
              ? <img src={coverUrl} alt="Portada" className="h-full w-full object-cover" />
              : <div className="h-full w-full" style={{ background: `linear-gradient(120deg, ${user.hue[0]}55, ${user.hue[1]}44), linear-gradient(120deg, #1E293B, #0F172A)` }} />}
            {isMe && (
              <button
                onClick={() => coverFileRef.current?.click()}
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-[#020617]/75 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur transition hover:bg-[#2563EB] active:scale-95"
              >
                <Camera className="h-3.5 w-3.5" /> {coverUrl ? "Cambiar portada" : "Añadir portada"}
              </button>
            )}
            <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) act.toast("Subiendo portada…"); e.target.value = ""; if (f) void pickCover(f); }} />
          </div>
          <div className="p-5">
            {!isMe && (
              <button onClick={() => act.openProfile(me.id)} className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-[#94A3B8] transition hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Volver
              </button>
            )}
            <div className="flex flex-wrap items-end gap-4">
              <div className="relative -mt-16">
                <Avatar name={user.name} hue={user.hue} size={88} ring photoId={user.avatarId} />
                {isMe && (
                  <button
                    onClick={() => avatarFileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-[#1E293B] bg-[#2563EB] text-white transition hover:bg-[#1D4ED8] active:scale-90"
                    aria-label="Cambiar foto de perfil" title="Cambiar foto de perfil"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                )}
                <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickAvatar(f); }} />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="flex flex-wrap items-center gap-2 text-[22px] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>
                  {user.name}
                  {(user.premiumUntil ?? 0) > Date.now() && (
                    <span className="flex items-center gap-1 rounded-full bg-[#2563EB]/15 px-2 py-0.5 text-[11px] font-bold text-[#93C5FD]"><BadgeCheck className="h-3.5 w-3.5" /> Premium</span>
                  )}
                  {user.role === "admin" && (
                    <span className="flex items-center gap-1 rounded-full bg-[#7C3AED]/15 px-2 py-0.5 text-[11px] font-bold text-[#C4B5FD]"><ShieldCheck className="h-3.5 w-3.5" /> Admin</span>
                  )}
                </p>
                <p className="text-[13.5px] text-[#94A3B8]">
                  @{user.handle} · en {BRAND} desde {new Date(user.createdAt).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
                </p>
              </div>
              {isMe ? (
                <div className="flex items-center gap-2">
                  <button onClick={onLogout} className="flex items-center gap-2 rounded-xl border border-[#334155] px-4 py-2.5 text-[13px] font-bold text-[#94A3B8] transition hover:border-[#EF4444]/60 hover:text-[#F87171] active:scale-95">
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => onMessage(user.id)} className="flex items-center gap-2 rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-2.5 text-[13px] font-bold text-[#94A3B8] transition hover:border-[#475569] hover:text-white active:scale-95">
                    <MessageSquare className="h-4 w-4" /> Mensaje
                  </button>
                  {subbed ? (
                    <span className="flex items-center gap-2 rounded-xl border border-[#10B981]/50 bg-[#10B981]/10 px-4 py-2.5 text-[13px] font-bold text-[#6EE7B7]">
                      <Check className="h-4 w-4" strokeWidth={2.5} /> Suscrito
                    </span>
                  ) : (
                    <button onClick={() => act.subscribe(user.id)} className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95">
                      <Crown className="h-4 w-4" /> Suscribirme · {eur(user.subPriceCents)}/mes
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* bio */}
            <div className="mt-4 rounded-xl border border-[#334155] bg-[#0F172A] p-3.5">
              {bioEditing && isMe ? (
                <div className="anim-fade-in space-y-2">
                  <textarea className={inputCls + " min-h-20 resize-none text-[14px]"} value={bioDraft} maxLength={220} onChange={(e) => setBioDraft(e.target.value)} placeholder="Cuéntale a la comunidad quién eres…" />
                  <div className="flex gap-2">
                    <button onClick={() => { saveBio(bioDraft); setBioEditing(false); }} className="rounded-lg bg-[#2563EB] px-4 py-1.5 text-[12.5px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95">Guardar</button>
                    <button onClick={() => { setBioDraft(user.bio); setBioEditing(false); }} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-[#94A3B8] transition hover:text-white">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-[#CBD5E1]">{user.bio || (isMe ? "Aún no has escrito tu biografía. Preséntate: qué compartes y qué te hace únic@." : `${user.name.split(" ")[0]} todavía no ha escrito su biografía.`)}</p>
                  {isMe && (
                    <button onClick={() => setBioEditing(true)} className="rounded-lg p-1.5 text-[#64748B] transition hover:bg-[#1E293B] hover:text-[#93C5FD]" aria-label="Editar biografía"><Pencil className="h-4 w-4" /></button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3">
              {[
                [String(posts.length), "publicaciones"],
                [fmtN(db.subs.filter((s) => s.creatorId === user.id).length), "suscriptores"],
                [String(friendCount), "amigos"],
                isMe ? [eur(myEarnings), "ganancias"] : [fmtN(posts.reduce((a, p) => a + p.likes.length, 0)), "me gusta"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl border border-[#334155] bg-[#0F172A] px-3 py-3 text-center">
                  <p className="font-mono text-[16px] font-bold tabular-nums text-[#F8FAFC]">{v}</p>
                  <p className="text-[11px] text-[#64748B]">{l}</p>
                </div>
              ))}
            </div>

            {/* tema claro / oscuro */}
            {isMe && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
                <span className="flex items-center gap-2 text-[13.5px] font-bold"><Sun className="h-4 w-4 text-[#F59E0B]" /> Apariencia</span>
                <span className="hidden text-[12px] text-[#64748B] sm:inline">Elige cómo quieres ver {BRAND}. Se guarda en tu cuenta.</span>
                <div className="ml-auto flex rounded-xl border border-[#334155] bg-[#1E293B] p-1">
                  <button
                    onClick={() => onTheme("light")}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-all duration-200 ${theme === "light" ? "bg-[#F59E0B]/15 text-[#FCD34D]" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}
                  >
                    <Sun className="h-4 w-4" /> Claro
                  </button>
                  <button
                    onClick={() => onTheme("dark")}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-all duration-200 ${theme === "dark" ? "bg-[#2563EB]/20 text-[#93C5FD]" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}
                  >
                    <Moon className="h-4 w-4" /> Oscuro
                  </button>
                </div>
              </div>
            )}

            {isMe && premium && <SubPriceEditor current={me.subPriceCents} onSave={onSubPrice} />}
          </div>
        </div>
      </Reveal>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-[#334155] bg-[#1E293B] px-6 py-10 text-center">
          <p className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>{isMe ? "Todavía no has publicado nada" : "Este perfil aún no ha publicado"}</p>
          <p className="mt-1 text-[13.5px] text-[#94A3B8]">{isMe ? "Cuando publiques tu primera foto o video, aparecerá aquí." : "Vuelve más tarde o suscríbete para no perderte nada."}</p>
        </div>
      ) : (
        posts.map((p, i) => <PostCard key={p.id} post={p} index={i} me={me} db={db} act={act} />)
      )}
    </div>
  );

  // helpers locales (usan closures del componente padre vía props)
  function saveBio(bio: string) {
    act.toast(bio.trim() ? "Biografía guardada." : "Biografía vaciada.", "ok");
    window.dispatchEvent(new CustomEvent("pp:setbio", { detail: bio.trim() }));
  }
  function pickAvatar(f: File) {
    window.dispatchEvent(new CustomEvent("pp:setphoto", { detail: { kind: "avatar", file: f } }));
  }
  function pickCover(f: File) {
    window.dispatchEvent(new CustomEvent("pp:setphoto", { detail: { kind: "cover", file: f } }));
  }
}

/* ─────────── editor de precio de suscripción ─────────── */
function SubPriceEditor({ current, onSave }: { current: number; onSave: (c: number) => void }) {
  const [val, setVal] = useState((current / 100).toFixed(2).replace(".", ","));
  const [editing, setEditing] = useState(false);
  const cents = Math.round((parseFloat(val.replace(",", ".")) || 0) * 100);
  const ok = cents >= 100 && cents <= 50000;
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3 text-left transition hover:border-[#2563EB]/60">
        <span className="text-[13px] font-bold text-[#94A3B8]">Precio de tu suscripción mensual</span>
        <span className="flex items-center gap-2 font-mono text-[15px] font-bold text-[#F8FAFC]">{eur(current)} <span className="text-[11px] font-semibold text-[#2563EB]">editar</span></span>
      </button>
    );
  }
  return (
    <div className="anim-fade-up mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#2563EB]/50 bg-[#0F172A] px-4 py-3">
      <span className="text-[13px] font-bold text-[#94A3B8]">Suscripción mensual:</span>
      <div className="relative">
        <input className={inputCls + " w-28 py-2 font-mono text-[14px]"} value={val} inputMode="decimal" onChange={(e) => setVal(e.target.value.replace(/[^\d,.]/g, "").slice(0, 7))} autoFocus />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#94A3B8]">€</span>
      </div>
      <button onClick={() => { if (ok) { onSave(cents); setEditing(false); } }} disabled={!ok} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-40">
        Guardar
      </button>
      <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-[#94A3B8] transition hover:text-white">Cancelar</button>
      {!ok && <span className="text-[12px] font-medium text-[#F87171]">Entre 1,00 € y 500,00 €</span>}
    </div>
  );
}

/* ═══════════════════ CARTERA ═══════════════════ */
function WalletView({ me, db, premium, myEarnings, mySubscribers, onPremium, onCancelSub, openProfile, onCardChange }: {
  me: UserT; db: DbT; premium: boolean; myEarnings: number; mySubscribers: number;
  onPremium: () => void; onCancelSub: (creatorId: string) => void;
  openProfile: (id: string) => void; onCardChange: () => void;
}) {
  const txns = db.txns.filter((t) => t.userId === me.id).sort((a, b) => b.at - a.at);
  const mySubs = db.subs.filter((s) => s.fanId === me.id);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const iconFor = (k: TxnT["kind"]) =>
    k === "deposit" ? <Wallet className="h-4 w-4" /> : k === "premium" ? <Crown className="h-4 w-4" /> : k === "unlock" ? <Unlock className="h-4 w-4" /> : k === "subscription" ? <Users className="h-4 w-4" /> : <Gem className="h-4 w-4" />;
  const clsFor = (k: TxnT["kind"]) =>
    k === "earning" ? "bg-[#10B981]/12 text-[#6EE7B7]" : k === "deposit" ? "bg-[#2563EB]/12 text-[#93C5FD]" : k === "premium" ? "bg-[#7C3AED]/12 text-[#C4B5FD]" : "bg-[#334155]/60 text-[#94A3B8]";

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B] p-6">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-[0.12]" style={{ background: "radial-gradient(circle, #10B981, transparent 65%)" }} />
          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[#64748B]"><Gem className="h-4 w-4 text-[#6EE7B7]" /> Ganancias acumuladas</p>
          <p className="mt-2 font-mono text-[40px] font-bold leading-none tabular-nums tracking-tight sm:text-[48px]">{eur(me.balanceCents)}</p>
          <p className="mt-2 text-[13.5px] text-[#94A3B8]">Tus compras se cargan directo a tu tarjeta registrada; aquí ves lo que ganas con tu contenido.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button onClick={onCardChange} className="flex items-center gap-2.5 rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-2.5 text-[13px] font-bold text-[#CBD5E1] transition hover:border-[#475569] active:scale-95">
              <CreditCard className="h-4 w-4 text-[#93C5FD]" />
              {me.card ? `${me.card.brand} ···· ${me.card.last4}` : "Registrar tarjeta"}
            </button>
            {!premium && (
              <button onClick={onPremium} className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#6D28D9] active:scale-95">
                <Crown className="h-4 w-4" /> Activar Premium · {eur(PREMIUM_CENTS)}/mes
              </button>
            )}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[[eur(myEarnings), "ganado en ventas"], [String(mySubscribers), "suscriptores"], [String(txns.length), "movimientos"]].map(([v, l]) => (
              <div key={l} className="rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
                <p className="font-mono text-[16px] font-bold tabular-nums text-[#6EE7B7]">{v}</p>
                <p className="text-[11.5px] text-[#64748B]">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal delay={70}>
        <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-5">
          <h2 className="text-[17px] font-bold" style={{ fontFamily: DISPLAY }}>Tus suscripciones</h2>
          {mySubs.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[#334155] p-5 text-center text-[13.5px] text-[#94A3B8]">
              No estás suscrito a nadie todavía. Cuando lo hagas, todo el contenido de pago de ese creador se desbloqueará automáticamente.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {mySubs.map((s) => {
                const c = db.users.find((u) => u.id === s.creatorId);
                if (!c) return null;
                const confirming = confirmCancel === s.creatorId;
                return (
                  <div key={s.creatorId} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#334155] bg-[#0F172A] p-3.5">
                    <button onClick={() => openProfile(c.id)} className="transition active:scale-95" aria-label={`Perfil de ${c.name}`}><Avatar name={c.name} hue={c.hue} size={42} photoId={c.avatarId} /></button>
                    <button onClick={() => openProfile(c.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[14px] font-bold">{c.name} <span className="font-normal text-[#64748B]">@{c.handle}</span></p>
                      <p className="text-[11.5px] text-[#64748B]">Desde {new Date(s.at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {eur(s.priceCents)}/mes</p>
                    </button>
                    {confirming ? (
                      <span className="anim-fade-in flex items-center gap-2">
                        <span className="text-[12px] text-[#94A3B8]">¿Cancelar?</span>
                        <button onClick={() => { onCancelSub(s.creatorId); setConfirmCancel(null); }} className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#DC2626] active:scale-95">Sí</button>
                        <button onClick={() => setConfirmCancel(null)} className="rounded-lg border border-[#334155] px-3 py-1.5 text-[12px] font-semibold text-[#94A3B8] transition hover:text-white">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmCancel(s.creatorId)} className="rounded-lg border border-[#334155] px-3.5 py-1.5 text-[12px] font-bold text-[#94A3B8] transition hover:border-[#EF4444]/60 hover:text-[#F87171] active:scale-95">Cancelar</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Reveal>

      <Reveal delay={120}>
        <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-5">
          <h2 className="text-[17px] font-bold" style={{ fontFamily: DISPLAY }}>Historial de movimientos</h2>
          {txns.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[#334155] p-5 text-center text-[13.5px] text-[#94A3B8]">
              Aún no tienes movimientos. Cada recarga, compra o venta real quedará registrada aquí.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[#334155]/70">
              {txns.map((t) => (
                <div key={t.id} className="flex items-center gap-3.5 py-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${clsFor(t.kind)}`}>{iconFor(t.kind)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[#F8FAFC]">{t.label}</p>
                    <p className="text-[11.5px] text-[#64748B]">{timeAgo(t.at)} · {new Date(t.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <span className={`font-mono text-[14px] font-bold tabular-nums ${t.cents >= 0 ? "text-[#6EE7B7]" : "text-[#F87171]"}`}>{t.cents >= 0 ? "+" : ""}{eur(t.cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}

/* ═══════════════════ PANEL DE ADMINISTRACIÓN ═══════════════════ */
function AdminView({ db, onSendPassword, onRetry, onDismiss, onSaveMail, onTestMail, onReset, toast }: {
  db: DbT;
  onSendPassword: (userId: string, fromRecovery?: string) => Promise<boolean>;
  onRetry: (id: string) => Promise<void>;
  onDismiss: (id: string) => void;
  onSaveMail: (c: MailCfg) => void;
  onTestMail: () => Promise<void>;
  onReset: () => void;
  toast: (m: string, t?: Tone) => void;
}) {
  const [tab, setTab] = useState<"registros" | "recuperaciones" | "bandeja" | "correo">("registros");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mail, setMail] = useState<MailCfg>(loadMailCfg);
  const [testing, setTesting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(0);

  const users = [...db.users].sort((a, b) => b.createdAt - a.createdAt);
  const newThisWeek = users.filter((u) => Date.now() - u.createdAt < 7 * 86400000).length;
  const pendRec = db.recoveries.filter((r) => r.status === "pending");
  const pendMail = db.outbox.filter((m) => m.status !== "sent");
  const cfgReady = mailCfgReady(loadMailCfg());

  const sendCreds = async (userId: string, fromRecovery?: string) => {
    setBusyId(userId + (fromRecovery ?? ""));
    await onSendPassword(userId, fromRecovery);
    setBusyId(null);
  };
  const retry = async (id: string) => {
    setBusyId(id);
    await onRetry(id);
    setBusyId(null);
  };

  const tabs: { id: typeof tab; label: string; icon: React.ReactNode; badge: number }[] = [
    { id: "registros", label: "Registros", icon: <Users className="h-4 w-4" />, badge: newThisWeek },
    { id: "recuperaciones", label: "Recuperaciones", icon: <KeyRound className="h-4 w-4" />, badge: pendRec.length },
    { id: "bandeja", label: "Bandeja de salida", icon: <Inbox className="h-4 w-4" />, badge: pendMail.length },
    { id: "correo", label: "Correo (EmailJS)", icon: <Settings2 className="h-4 w-4" />, badge: 0 },
  ];

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B] p-5">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-[0.12]" style={{ background: "radial-gradient(circle, #7C3AED, transparent 65%)" }} />
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white shadow-lg shadow-[#2563EB]/25"><ShieldCheck className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>Panel de administración</h1>
              <p className="text-[13px] text-[#94A3B8]">Cada registro llega aquí con sus credenciales para que puedas devolver contraseñas. Nadie más puede ver esta pantalla.</p>
            </div>
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold ${cfgReady ? "border-[#10B981]/50 bg-[#10B981]/10 text-[#6EE7B7]" : "border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#FCD34D]"}`}>
              {cfgReady ? <MailCheck className="h-3.5 w-3.5" /> : <MailX className="h-3.5 w-3.5" />}
              {cfgReady ? "Correo activo" : "Correo sin configurar"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[String(users.length), "cuentas totales"], [String(newThisWeek), "nuevas esta semana"], [String(pendRec.length), "recuperaciones pendientes"], [String(pendMail.length), "correos sin enviar"]].map(([v, l]) => (
              <div key={l} className="rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
                <p className="font-mono text-[18px] font-bold tabular-nums text-[#F8FAFC]">{v}</p>
                <p className="text-[11.5px] text-[#64748B]">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-bold transition-all duration-200 active:scale-95 ${tab === t.id ? "border-[#2563EB] bg-[#2563EB]/12 text-[#93C5FD]" : "border-[#334155] bg-[#1E293B] text-[#94A3B8] hover:border-[#475569] hover:text-[#F8FAFC]"}`}
          >
            {t.icon}{t.label}
            {t.badge > 0 && <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${tab === t.id ? "bg-[#2563EB] text-white" : "bg-[#334155] text-[#CBD5E1]"}`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "registros" && (
        <Reveal className="overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B]">
          <div className="border-b border-[#334155] px-5 py-3.5">
            <h2 className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Personas unidas a {BRAND}</h2>
            <p className="text-[12.5px] text-[#94A3B8]">Aquí ves el usuario y la contraseña de cada cuenta para poder devolvérsela si la pierden.</p>
          </div>
          <div className="divide-y divide-[#334155]/70">
            {users.map((u) => {
              const open = expanded === u.id;
              return (
                <div key={u.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={u.name} hue={u.hue} size={40} photoId={u.avatarId} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[14.5px] font-bold">
                        {u.name}
                        {u.role === "admin" && <span className="rounded-md bg-[#7C3AED]/15 px-1.5 py-0.5 text-[10.5px] font-bold text-[#C4B5FD]">ADMIN</span>}
                      </p>
                      <p className="truncate text-[12px] text-[#64748B]">@{u.handle} · desde el {new Date(u.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {u.status === "approved" ? "aprobada" : "pendiente"}</p>
                    </div>
                    {u.role !== "admin" && (
                      <>
                        <button
                          onClick={() => setExpanded(open ? null : u.id)}
                          className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition active:scale-95 ${open ? "border-[#2563EB] bg-[#2563EB]/12 text-[#93C5FD]" : "border-[#334155] text-[#94A3B8] hover:border-[#475569] hover:text-[#F8FAFC]"}`}
                        >
                          {open ? "Ocultar datos" : "Ver credenciales"}
                        </button>
                        <button
                          onClick={() => void sendCreds(u.id)}
                          disabled={busyId === u.id}
                          className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-[12.5px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-50"
                        >
                          {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Enviar contraseña
                        </button>
                      </>
                    )}
                  </div>
                  {open && u.role !== "admin" && (
                    <div className="anim-fade-in mt-3 grid gap-2 rounded-xl border border-[#334155] bg-[#0F172A] p-3.5 sm:grid-cols-3">
                      <div><p className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">Email</p><p className="mt-0.5 font-mono text-[13px] text-[#F8FAFC]">{u.email}</p></div>
                      <div><p className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">Usuario</p><p className="mt-0.5 font-mono text-[13px] text-[#F8FAFC]">@{u.handle}</p></div>
                      <div>
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">Contraseña</p>
                        {u.passPlain
                          ? <p className="mt-0.5 font-mono text-[13px] text-[#F8FAFC]">{u.passPlain}</p>
                          : <p className="mt-0.5 text-[12px] text-[#FCD34D]">Cuenta anterior al sistema de recuperación: sin contraseña registrada.</p>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {users.length === 0 && <p className="px-5 py-8 text-center text-[13.5px] text-[#94A3B8]">Todavía no hay cuentas registradas.</p>}
          </div>
          <div className="border-t border-[#EF4444]/30 bg-[#EF4444]/5 px-5 py-4">
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#FCA5A5]"><ShieldAlert className="h-4 w-4" /> Zona de peligro</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[12.5px] text-[#94A3B8]">Borra todas las cuentas, publicaciones, chats y archivos. Después, cualquiera puede registrarse de nuevo.</p>
              {confirmReset === 0 && (
                <button onClick={() => setConfirmReset(1)} className="rounded-lg border border-[#EF4444]/50 px-4 py-2 text-[12.5px] font-bold text-[#F87171] transition hover:bg-[#EF4444]/10 active:scale-95">Restablecer plataforma…</button>
              )}
              {confirmReset === 1 && (
                <span className="anim-fade-in flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-[#FCD34D]">¿Seguro? Se borrará TODO.</span>
                  <button onClick={() => setConfirmReset(2)} className="rounded-lg bg-[#EF4444] px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#DC2626] active:scale-95">Sí, continuar</button>
                  <button onClick={() => setConfirmReset(0)} className="rounded-lg border border-[#334155] px-3 py-2 text-[12.5px] font-semibold text-[#94A3B8] transition hover:text-white">Cancelar</button>
                </span>
              )}
              {confirmReset === 2 && (
                <span className="anim-fade-in flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-[#F87171]">Última confirmación.</span>
                  <button onClick={onReset} className="rounded-lg bg-[#EF4444] px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#DC2626] active:scale-95">Sí, borrar TODO</button>
                  <button onClick={() => setConfirmReset(0)} className="rounded-lg border border-[#334155] px-3 py-2 text-[12.5px] font-semibold text-[#94A3B8] transition hover:text-white">Cancelar</button>
                </span>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {tab === "recuperaciones" && (
        <Reveal className="overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B]">
          <div className="border-b border-[#334155] px-5 py-3.5">
            <h2 className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Solicitudes de recuperación</h2>
            <p className="text-[12.5px] text-[#94A3B8]">Cuando alguien olvida su contraseña, la petición llega aquí y a tu correo.</p>
          </div>
          <div className="divide-y divide-[#334155]/70">
            {db.recoveries.map((r) => {
              const u = db.users.find((x) => x.id === r.userId);
              if (!u) return null;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.status === "pending" ? "bg-[#F59E0B]/12 text-[#FCD34D]" : r.status === "sent" ? "bg-[#10B981]/12 text-[#6EE7B7]" : "bg-[#334155]/60 text-[#94A3B8]"}`}>
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold">{u.name} <span className="font-normal text-[#64748B]">@{u.handle} · {u.email}</span></p>
                    <p className="text-[12px] text-[#64748B]">Solicitada {timeAgo(r.at)}</p>
                  </div>
                  {r.status === "pending" ? (
                    <span className="flex items-center gap-2">
                      <button
                        onClick={() => void sendCreds(u.id, r.id)}
                        disabled={busyId === u.id + r.id}
                        className="flex items-center gap-1.5 rounded-lg bg-[#10B981] px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                      >
                        {busyId === u.id + r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Enviar su contraseña
                      </button>
                      <button onClick={() => onDismiss(r.id)} className="rounded-lg border border-[#334155] px-3 py-2 text-[12.5px] font-bold text-[#94A3B8] transition hover:border-[#EF4444]/60 hover:text-[#F87171] active:scale-95">Descartar</button>
                    </span>
                  ) : (
                    <span className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${r.status === "sent" ? "bg-[#10B981]/12 text-[#6EE7B7]" : "bg-[#334155]/60 text-[#94A3B8]"}`}>
                      {r.status === "sent" ? "Contraseña enviada" : "Descartada"}
                    </span>
                  )}
                </div>
              );
            })}
            {db.recoveries.length === 0 && (
              <p className="px-5 py-10 text-center text-[13.5px] text-[#94A3B8]">Sin solicitudes por ahora. Cuando alguien pulse «¿Olvidaste tu contraseña?», aparecerá aquí al instante.</p>
            )}
          </div>
        </Reveal>
      )}

      {tab === "bandeja" && (
        <Reveal className="overflow-hidden rounded-2xl border border-[#334155] bg-[#1E293B]">
          <div className="border-b border-[#334155] px-5 py-3.5">
            <h2 className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Bandeja de salida</h2>
            <p className="text-[12.5px] text-[#94A3B8]">Cada aviso queda registrado aquí. Los pendientes se pueden reintentar cuando el correo esté configurado.</p>
          </div>
          <div className="divide-y divide-[#334155]/70">
            {db.outbox.map((m) => (
              <div key={m.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${m.status === "sent" ? "bg-[#10B981]/12 text-[#6EE7B7]" : m.status === "pending" ? "bg-[#F59E0B]/12 text-[#FCD34D]" : "bg-[#EF4444]/12 text-[#F87171]"}`}>
                    {m.status === "sent" ? <MailCheck className="h-4 w-4" /> : m.status === "pending" ? <Inbox className="h-4 w-4" /> : <MailX className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">{m.subject}</p>
                    <p className="truncate font-mono text-[12px] text-[#64748B]">Para: {m.to} · {timeAgo(m.at)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${m.status === "sent" ? "bg-[#10B981]/12 text-[#6EE7B7]" : m.status === "pending" ? "bg-[#F59E0B]/12 text-[#FCD34D]" : "bg-[#EF4444]/12 text-[#F87171]"}`}>
                    {m.status === "sent" ? "Enviado" : m.status === "pending" ? "Pendiente" : "Error"}
                  </span>
                  {m.status !== "sent" && (
                    <button
                      onClick={() => void retry(m.id)}
                      disabled={busyId === m.id}
                      className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-[12.5px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-50"
                    >
                      {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reintentar
                    </button>
                  )}
                </div>
                <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="mt-1.5 text-[12px] font-semibold text-[#93C5FD] underline-offset-4 hover:underline">
                  {expanded === m.id ? "Ocultar contenido" : "Ver contenido"}
                </button>
                {expanded === m.id && (
                  <pre className="anim-fade-in mt-2 whitespace-pre-wrap rounded-xl border border-[#334155] bg-[#0F172A] p-3.5 font-mono text-[12px] leading-relaxed text-[#CBD5E1]">{m.body}</pre>
                )}
              </div>
            ))}
            {db.outbox.length === 0 && <p className="px-5 py-10 text-center text-[13.5px] text-[#94A3B8]">Aún no se ha generado ningún correo.</p>}
          </div>
        </Reveal>
      )}

      {tab === "correo" && (
        <Reveal className="space-y-4">
          <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-5">
            <h2 className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Correo del administrador</h2>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#7C3AED]/40 bg-[#7C3AED]/8 px-4 py-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-[#C4B5FD]" />
              <p className="text-[13.5px] text-[#CBD5E1]">
                Todos los avisos de registro y las solicitudes de recuperación llegan a
                <span className="mx-1.5 rounded-lg bg-[#0F172A] px-2 py-0.5 font-mono text-[12.5px] font-bold text-[#F8FAFC]">{ADMIN_EMAIL}</span>
                Este correo nunca se muestra a los usuarios.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[16px] font-bold" style={{ fontFamily: DISPLAY }}>Enviar correos de verdad (EmailJS · gratis)</h2>
              <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-bold ${cfgReady ? "border-[#10B981]/50 bg-[#10B981]/10 text-[#6EE7B7]" : "border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#FCD34D]"}`}>
                {cfgReady ? "Conectado" : "Sin conectar"}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#94A3B8]">
              Para que los avisos lleguen a tu bandeja real, crea una cuenta gratuita en <span className="font-semibold text-[#F8FAFC]">emailjs.com</span> (200 correos/mes sin pagar):
            </p>
            <ol className="mt-3 space-y-1.5 text-[13px] text-[#CBD5E1]">
              {[
                ["1", "Añade tu correo de Astermail como Email Service (te pedirá autorizarlo)."],
                ["2", "Crea una plantilla con tres variables: {{to_email}}, {{subject}} y {{message}}."],
                ["3", "Copia aquí el Service ID, el Template ID y tu Public Key (Account → General)."],
              ].map(([n, t]) => (
                <li key={n} className="flex gap-2.5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#2563EB]/15 font-mono text-[11.5px] font-bold text-[#93C5FD]">{n}</span>{t}</li>
              ))}
            </ol>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Service ID"><input className={inputCls + " font-mono"} placeholder="service_xxxxxx" value={mail.serviceId} onChange={(e) => setMail({ ...mail, serviceId: e.target.value })} /></Field>
              <Field label="Template ID"><input className={inputCls + " font-mono"} placeholder="template_xxxxxx" value={mail.templateId} onChange={(e) => setMail({ ...mail, templateId: e.target.value })} /></Field>
              <Field label="Public Key"><input className={inputCls + " font-mono"} placeholder="XXXXXXXXXXXXXX" value={mail.publicKey} onChange={(e) => setMail({ ...mail, publicKey: e.target.value })} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button onClick={() => onSaveMail(mail)} className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95">
                <Settings2 className="h-4 w-4" /> Guardar configuración
              </button>
              <button
                onClick={() => { onSaveMail(mail); setTesting(true); void onTestMail().finally(() => setTesting(false)); }}
                disabled={testing || !mailCfgReady(mail)}
                className="flex items-center gap-2 rounded-xl border border-[#10B981]/50 bg-[#10B981]/10 px-5 py-2.5 text-[13.5px] font-bold text-[#6EE7B7] transition hover:bg-[#10B981]/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar correo de prueba
              </button>
            </div>
            {!mailCfgReady(mail) && (
              <p className="mt-3 text-[12.5px] text-[#94A3B8]">Mientras no esté configurado, ningún usuario se queda sin atención: los correos se guardan en la bandeja de salida y se reenvían desde aquí.</p>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}

/* ═══════════════════════════════ APP ═══════════════════════════════ */
export default function App() {
  const [db, setDb] = useState<DbT>(loadDb);
  /* La sesión vive en sessionStorage ⇒ cada pestaña/ventana del navegador
     tiene SU propia cuenta abierta. Los datos de la comunidad (db) siguen
     siendo compartidos, pero iniciar o cerrar sesión aquí ya no toca a
     las demás pestañas.                                                */
  const [sessionId, setSessionId] = useState<string | null>(() => { migrateOnce(); return sessionStorage.getItem(SES_KEY); });
  const [view, setView] = useState<View>("feed");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  /* Compra pendiente (desbloqueo PPV o suscripción): se cobra directo a la
     tarjeta guardada. No hay saldo intermedio que recargar. */
  const [pending, setPending] = useState<{ kind: "unlock"; postId: string } | { kind: "subscribe"; creatorId: string } | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [changingCard, setChangingCard] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem(THEME_KEY) as Theme) || "dark"; } catch { return "dark"; }
  });
  const rawRef = useRef<string>("");
  const bcRef = useRef<BroadcastChannel | null>(null);

  /* tema claro / oscuro */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ }
  }, [theme]);
  const setTheme = (t: Theme) => setThemeState(t);

  /* ══════════ sincronización automática (sin refrescar) ══════════ */
  useEffect(() => {
    const raw = JSON.stringify(db);
    rawRef.current = raw;
    try { localStorage.setItem(DB_KEY, raw); } catch { /* cuota llena */ }
    try { bcRef.current?.postMessage("sync"); } catch { /* noop */ }
  }, [db]);
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw && raw !== rawRef.current) setDb(parseDb(raw));
        // ⚠ La sesión NUNCA se sincroniza: es de esta pestaña (sessionStorage).
        // Solo se comparten los datos de la comunidad.
      } catch { /* noop */ }
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pickpay-sync") : null;
      bcRef.current = bc;
      if (bc) bc.onmessage = syncFromStorage;
    } catch { bc = null; }
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);
    const iv = window.setInterval(syncFromStorage, 3000);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
      window.clearInterval(iv);
      bc?.close();
      bcRef.current = null;
    };
  }, []);
  /* La sesión se guarda SOLO en esta pestaña (sessionStorage). Así puedes
     tener la cuenta A abierta en una ventana y la cuenta B en otra a la
     vez, y cerrar sesión en una no afecta a la otra.                    */
  useEffect(() => {
    try {
      sessionId ? sessionStorage.setItem(SES_KEY, sessionId) : sessionStorage.removeItem(SES_KEY);
      localStorage.removeItem(SES_KEY); // limpia la sesión global heredada (una sola vez por cambio)
    } catch { /* noop */ }
  }, [sessionId]);

  const me = useMemo(() => db.users.find((u) => u.id === sessionId) ?? null, [db.users, sessionId]);
  const premium = !!me && (me.premiumUntil ?? 0) > Date.now();

  const myNotifs = me ? db.notifs.filter((n) => n.userId === me.id).sort((a, b) => b.at - a.at) : [];
  const unread = myNotifs.filter((n) => !n.read).length;
  const unreadMsgs = me ? db.msgs.filter((m) => m.to === me.id && !m.readBy.includes(me.id)).length : 0;
  const pendingAdminTasks = db.recoveries.filter((r) => r.status === "pending").length + db.outbox.filter((m) => m.status !== "sent").length;
  const community = db.users.filter((u) => u.id !== me?.id && u.status === "approved");
  const myEarnings = me ? db.txns.filter((t) => t.userId === me.id && t.kind === "earning").reduce((a, t) => a + t.cents, 0) : 0;
  const mySubscribers = me ? db.subs.filter((s) => s.creatorId === me.id).length : 0;

  const toast = (msg: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  /* amistad */
  const rel = (otherId: string): "none" | "outgoing" | "incoming" | "friends" => {
    if (!me) return "none";
    if (db.reqs.some((r) => r.status === "accepted" && ((r.from === me.id && r.to === otherId) || (r.from === otherId && r.to === me.id)))) return "friends";
    if (db.reqs.some((r) => r.status === "pending" && r.from === me.id && r.to === otherId)) return "outgoing";
    if (db.reqs.some((r) => r.status === "pending" && r.from === otherId && r.to === me.id)) return "incoming";
    return "none";
  };
  const sendFriendReq = (to: string) => {
    if (!me || to === me.id) return;
    const u = db.users.find((x) => x.id === to);
    if (!u) return;
    if (rel(to) !== "none") return;
    setDb((p) => ({
      ...p,
      reqs: [{ id: uid(), from: me.id, to, at: Date.now(), status: "pending" as const }, ...p.reqs],
      notifs: [{ id: uid(), userId: to, icon: "friend" as const, text: `${me.name} (@${me.handle}) te ha enviado una solicitud de amistad.`, at: Date.now(), read: false, go: { type: "profile", id: me.id } }, ...p.notifs],
    }));
    toast(`Solicitud de amistad enviada a @${u.handle}. Es gratis.`, "ok");
  };
  const acceptFriendReq = (reqId: string) => {
    if (!me) return;
    const rq = db.reqs.find((r) => r.id === reqId);
    if (!rq) return;
    const sender = db.users.find((x) => x.id === rq.from);
    setDb((p) => ({
      ...p,
      reqs: p.reqs.map((r) => (r.id === reqId ? { ...r, status: "accepted" as const } : r)),
      notifs: sender
        ? [{ id: uid(), userId: sender.id, icon: "friend" as const, text: `${me.name} (@${me.handle}) aceptó tu solicitud de amistad. ¡Ya sois amigos!`, at: Date.now(), read: false, go: { type: "profile", id: me.id } }, ...p.notifs]
        : p.notifs,
    }));
    toast(sender ? `Ahora eres amigo de @${sender.handle}.` : "Amistad aceptada.", "ok");
  };
  const declineFriendReq = (reqId: string) => {
    setDb((p) => ({ ...p, reqs: p.reqs.map((r) => (r.id === reqId ? { ...r, status: "declined" as const } : r)) }));
    toast("Solicitud rechazada.", "warn");
  };

  /* ─────────── auth ─────────── */
  const register = async (d: { name: string; handle: string; email: string; pass: string; birthDate: string; country: string; currency: Cur }): Promise<string | null> => {
    if (db.users.some((u) => u.email === d.email)) return "Ya existe una cuenta con ese email. Inicia sesión.";
    if (db.users.some((u) => u.handle === d.handle)) return "Ese nombre de usuario ya está en uso.";
    const isAdminEmail = d.email === ADMIN_EMAIL;
    const countryName = COUNTRY_LIST.find((c) => c.cc === d.country)?.name ?? d.country;
    const user: UserT = {
      id: uid(), name: d.name, handle: d.handle, email: d.email, passHash: await hashPass(d.pass),
      birthDate: d.birthDate, status: "pending", premiumUntil: null, subPriceCents: 499,
      balanceCents: 0, hue: hueFor(d.handle), createdAt: Date.now(),
      bio: "", avatarId: null, coverId: null, card: null,
      role: isAdminEmail ? "admin" : "user",
      passPlain: d.pass,
      country: d.country, currency: d.currency,
    };
    setDb((p) => ({ ...p, users: [...p.users, user] }));
    setSessionId(user.id);
    void queueEmail({
      to: ADMIN_EMAIL,
      kind: "register",
      subject: `Nuevo registro en ${BRAND}: ${d.name} (@${d.handle})`,
      body:
        `Se ha registrado una nueva persona en ${BRAND}.\n\n` +
        `Nombre: ${d.name}\nUsuario: @${d.handle}\nEmail: ${d.email}\nEdad: ${ageFrom(d.birthDate)} años\n` +
        `País: ${countryName} (${d.country})\nMoneda: ${d.currency}\n\n` +
        `Contraseña registrada (para poder devolvérsela si la pierde): ${d.pass}\n\n` +
        `Puedes gestionar esta cuenta desde tu Panel de administración.`,
    });
    return null;
  };
  const login = async (email: string, pass: string): Promise<string | null> => {
    const u = db.users.find((x) => x.email === email);
    if (!u) return "No hay ninguna cuenta con ese email.";
    if (u.passHash !== await hashPass(pass)) return "Contraseña incorrecta.";
    setSessionId(u.id);
    return null;
  };
  const approve = () => {
    if (!me) return;
    setDb((p) => ({ ...p, users: p.users.map((u) => (u.id === me.id ? { ...u, status: "approved" as const } : u)) }));
    toast(`Registro aprobado. Bienvenido, ${me.name.split(" ")[0]}.`, "gold");
  };

  /* ─────────── correo real (EmailJS) + bandeja ─────────── */
  const queueEmail = async (e: { to: string; subject: string; body: string; kind: OutboxT["kind"] }): Promise<"sent" | "pending" | "error"> => {
    const cfg = loadMailCfg();
    const id = uid();
    const ready = mailCfgReady(cfg);
    let status: OutboxT["status"] = ready ? "sent" : "pending";
    if (ready) {
      try { await sendRealEmail(cfg, e.to, e.subject, e.body); }
      catch { status = "error"; }
    }
    setDb((p) => ({ ...p, outbox: [{ id, to: e.to, subject: e.subject, body: e.body, kind: e.kind, status, at: Date.now() }, ...p.outbox] }));
    return status;
  };
  const retryEmail = async (id: string) => {
    const mail = db.outbox.find((m) => m.id === id);
    if (!mail) return;
    const cfg = loadMailCfg();
    if (!mailCfgReady(cfg)) {
      toast("Primero configura EmailJS en el Panel de administración (pestaña Correo).", "warn");
      return;
    }
    try {
      await sendRealEmail(cfg, mail.to, mail.subject, mail.body);
      setDb((p) => ({ ...p, outbox: p.outbox.map((m) => (m.id === id ? { ...m, status: "sent" as const } : m)) }));
      toast("Correo enviado correctamente.", "ok");
    } catch {
      setDb((p) => ({ ...p, outbox: p.outbox.map((m) => (m.id === id ? { ...m, status: "error" as const } : m)) }));
      toast("No se pudo enviar. Revisa las claves de EmailJS.", "err");
    }
  };
  const saveMailSettings = (c: MailCfg) => {
    saveMailCfg(c);
    toast(mailCfgReady(c) ? "Configuración de correo guardada. Los avisos saldrán de verdad." : "Configuración guardada (incompleta: los correos seguirán pendientes).", mailCfgReady(c) ? "ok" : "warn");
  };
  const sendTestMail = async () => {
    const st = await queueEmail({
      to: ADMIN_EMAIL, kind: "test",
      subject: `Prueba de correo de ${BRAND}`,
      body: `Si has recibido este correo, la configuración de EmailJS funciona correctamente.\n\nLos avisos de registro y de recuperación llegarán a esta bandeja.\n\n— ${BRAND}`,
    });
    if (st === "sent") toast("Correo de prueba enviado a tu bandeja.", "ok");
    else if (st === "pending") toast("Configuración incompleta: el correo quedó pendiente en la bandeja de salida.", "warn");
    else toast("El envío falló. Revisa Service ID, Template ID y Public Key.", "err");
  };

  /* ─────────── recuperación de cuenta ─────────── */
  const requestRecovery = async (email: string): Promise<string | null> => {
    const u = db.users.find((x) => x.email === email);
    if (!u) return "No hay ninguna cuenta registrada con ese email.";
    const already = db.recoveries.some((r) => r.userId === u.id && r.status === "pending");
    if (!already) {
      setDb((p) => ({ ...p, recoveries: [{ id: uid(), userId: u.id, email, at: Date.now(), status: "pending" as const }, ...p.recoveries] }));
      await queueEmail({
        to: ADMIN_EMAIL, kind: "recovery",
        subject: `Recuperación de cuenta solicitada: @${u.handle}`,
        body:
          `Una persona ha solicitado recuperar su contraseña en ${BRAND}.\n\n` +
          `Nombre: ${u.name}\nUsuario: @${u.handle}\nEmail registrado: ${u.email}\n\n` +
          `Entra en tu Panel de administración y pulsa "Enviar contraseña" para devolverle el acceso a su correo registrado.`,
      });
    }
    return null;
  };
  const sendPasswordTo = async (userId: string, fromRecovery?: string): Promise<boolean> => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) return false;
    if (!u.passPlain) {
      toast("Esta cuenta se creó antes del sistema de recuperación: no hay contraseña registrada que enviar.", "warn");
      return false;
    }
    const st = await queueEmail({
      to: u.email, kind: "creds",
      subject: `Tu contraseña de ${BRAND}`,
      body:
        `Hola, ${u.name}:\n\n` +
        `Tal y como solicitaste, estos son los datos de acceso de tu cuenta en ${BRAND}:\n\n` +
        `Usuario: @${u.handle}\nEmail: ${u.email}\nContraseña: ${u.passPlain}\n\n` +
        `Te recomendamos cambiarla por seguridad en cuanto puedas.\n\n— El equipo de ${BRAND}`,
    });
    if (fromRecovery) {
      setDb((p) => ({ ...p, recoveries: p.recoveries.map((r) => (r.id === fromRecovery ? { ...r, status: "sent" as const } : r)) }));
    }
    if (st === "sent") toast(`Contraseña enviada al correo de @${u.handle}.`, "ok");
    else if (st === "pending") toast("Correo guardado en la bandeja de salida (configura EmailJS para enviarlo).", "warn");
    else toast("El correo no pudo enviarse. Quedó en la bandeja de salida para reintentar.", "err");
    return true;
  };
  const dismissRecovery = (id: string) => {
    setDb((p) => ({ ...p, recoveries: p.recoveries.map((r) => (r.id === id ? { ...r, status: "dismissed" as const } : r)) }));
    toast("Solicitud descartada.", "warn");
  };

  /* ─────────── reset manual ─────────── */
  const hardReset = () => {
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(SES_KEY);
      localStorage.removeItem(OLD_DB_KEY);
      localStorage.removeItem(OLD_SES_KEY);
    } catch { /* noop */ }
    void wipeMediaDb();
    setDb(emptyDb());
    setSessionId(null);
    setView("feed");
    setProfileId(null);
    setActiveChat(null);
    setSearch("");
    setComposerOpen(false);
    setPremiumOpen(false);
    setPending(null);
    toast("Plataforma restablecida: todas las cuentas y archivos se borraron. Ya se pueden registrar de nuevo.", "warn");
  };

  /* ─────────── pagos (tarjeta guardada) ─────────── */
  const applyPayment = (action: () => void, card: SavedCard, successMsg: string) => {
    if (!me) return;
    setPayBusy(true);
    window.setTimeout(() => {
      setDb((p) => ({ ...p, users: p.users.map((u) => (u.id === me.id ? { ...u, card } : u)) }));
      action();
      setPayBusy(false);
      setPremiumOpen(false);
      setCardModalOpen(false);
      toast(successMsg, "gold");
    }, 1400);
  };
  const buyPremium = () => {
    if (!me) return;
    setDb((p) => ({
      ...p,
      users: p.users.map((u) => (u.id === me.id ? { ...u, premiumUntil: Date.now() + PREMIUM_DAYS * 86400000 } : u)),
      txns: [{ id: uid(), userId: me.id, kind: "premium" as const, cents: -PREMIUM_CENTS, label: `${BRAND} Premium (30 días)`, at: Date.now() }, ...p.txns],
    }));
  };

  /* ─────────── perfil: fotos, portada, bio ─────────── */
  const setProfilePhoto = async (kind: "avatar" | "cover", file: File) => {
    if (!me) return;
    const { blob } = await compressImage(file, kind === "cover" ? 1600 : 700);
    const id = `${kind}:${me.id}`;
    await putMedia(id, blob);
    setDb((p) => ({
      ...p,
      users: p.users.map((u) => (u.id === me.id ? { ...u, [kind === "avatar" ? "avatarId" : "coverId"]: id } : u)),
    }));
    toast(kind === "avatar" ? "Foto de perfil actualizada." : "Portada actualizada.", "ok");
  };
  const setBio = (bio: string) => {
    if (!me) return;
    setDb((p) => ({ ...p, users: p.users.map((u) => (u.id === me.id ? { ...u, bio } : u)) }));
  };
  useEffect(() => {
    const onBio = (e: Event) => setBio(String((e as CustomEvent).detail ?? ""));
    const onPhoto = (e: Event) => {
      const d = (e as CustomEvent).detail as { kind: "avatar" | "cover"; file: File };
      void setProfilePhoto(d.kind, d.file);
    };
    window.addEventListener("pp:setbio", onBio);
    window.addEventListener("pp:setphoto", onPhoto);
    return () => { window.removeEventListener("pp:setbio", onBio); window.removeEventListener("pp:setphoto", onPhoto); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  /* ─────────── publicar ─────────── */
  const publish = async (d: { text: string; media: DraftMedia | null; sell: boolean; priceCents: number }): Promise<string | null> => {
    if (!me) return "Sesión caducada.";
    if (!premium) return "Necesitas una suscripción Premium activa para publicar.";
    if (d.sell && !d.media) return "Para vender contenido, añade una foto o un video.";
    let mediaRef: MediaRef | null = null;
    if (d.media) {
      try {
        const id = uid();
        await putMedia(id, d.media.blob);
        mediaRef = { id, kind: d.media.kind, name: d.media.name, size: d.media.size, w: d.media.w, h: d.media.h, dur: d.media.dur };
      } catch {
        return "No se pudo guardar el archivo en tu dispositivo (almacenamiento lleno). Prueba con otro.";
      }
    }
    const post: PostT = {
      id: uid(), authorId: me.id, text: d.text, media: mediaRef,
      tier: d.sell ? "ppv" : "public", priceCents: d.sell ? d.priceCents : 0,
      likes: [], comments: [], unlocks: [], createdAt: Date.now(),
    };
    setDb((p) => ({ ...p, posts: [post, ...p.posts] }));
    toast(d.sell ? `Publicado como contenido de pago (${eur(d.priceCents)}). Recibirás el 85 % de cada venta.` : "Publicación compartida con la comunidad.", d.sell ? "gold" : "ok");
    return null;
  };
  const delPost = (id: string) => {
    const post = db.posts.find((p) => p.id === id);
    if (post?.media) void delMedia(post.media.id);
    setDb((p) => ({ ...p, posts: p.posts.filter((x) => x.id !== id) }));
    toast("Publicación eliminada.", "warn");
  };

  /* ─────────── interacción ─────────── */
  const like = (postId: string) => {
    if (!me) return;
    setDb((p) => ({
      ...p,
      posts: p.posts.map((x) => {
        if (x.id !== postId) return x;
        const has = x.likes.includes(me.id);
        return { ...x, likes: has ? x.likes.filter((u) => u !== me.id) : [...x.likes, me.id] };
      }),
      notifs: (() => {
        const post = p.posts.find((x) => x.id === postId);
        if (!post || post.authorId === me.id || post.likes.includes(me.id)) return p.notifs;
        return [{ id: uid(), userId: post.authorId, icon: "heart" as const, text: `${me.name} le dio me gusta a tu publicación.`, at: Date.now(), read: false, go: { type: "post" as const, id: postId } }, ...p.notifs];
      })(),
    }));
  };
  const comment = (postId: string, text: string, replyTo?: { userId: string; handle: string }, parentId?: string) => {
    if (!me) return;
    setDb((p) => {
      const post = p.posts.find((x) => x.id === postId);
      // Notifico al autor del post (si no soy yo)…
      let notifs = post && post.authorId !== me.id
        ? [{ id: uid(), userId: post.authorId, icon: "comment" as const, text: `${me.name} comentó: “${text.slice(0, 60)}${text.length > 60 ? "…" : ""}”`, at: Date.now(), read: false, go: { type: "post" as const, id: postId } }, ...p.notifs]
        : p.notifs;
      // …y también a la persona a la que se responde (si es distinta del autor y de mí).
      if (replyTo && replyTo.userId !== me.id && replyTo.userId !== post?.authorId) {
        notifs = [{ id: uid(), userId: replyTo.userId, icon: "comment" as const, text: `${me.name} te respondió: “${text.slice(0, 60)}${text.length > 60 ? "…" : ""}”`, at: Date.now(), read: false, go: { type: "post" as const, id: postId } }, ...notifs];
      }
      return {
        ...p,
        posts: p.posts.map((x) => (x.id === postId ? { ...x, comments: [...x.comments, { id: uid(), userId: me.id, text, at: Date.now(), replyTo, parentId }] } : x)),
        notifs,
      };
    });
  };
  /* ─────────── compras: cobro directo a la tarjeta guardada ───────────
     Ya no hay saldo que recargar. Al desbloquear o suscribirse se abre una
     confirmación que carga el importe a la tarjeta registrada del comprador. */
  const unlock = (postId: string) => {
    if (!me) return;
    const post = db.posts.find((p) => p.id === postId);
    const author = post && db.users.find((u) => u.id === post.authorId);
    if (!post || !author) return;
    if (post.unlocks.includes(me.id)) return;
    setChangingCard(false);
    setPending({ kind: "unlock", postId });
  };
  const subscribe = (creatorId: string) => {
    if (!me || creatorId === me.id) return;
    const author = db.users.find((u) => u.id === creatorId);
    if (!author) return;
    if (db.subs.some((s) => s.fanId === me.id && s.creatorId === creatorId)) return;
    setChangingCard(false);
    setPending({ kind: "subscribe", creatorId });
  };

  /* Importe y descripción de la compra pendiente (para el modal). */
  const pendingInfo = useMemo(() => {
    if (!pending) return null;
    if (pending.kind === "unlock") {
      const post = db.posts.find((p) => p.id === pending.postId);
      const author = post && db.users.find((u) => u.id === post.authorId);
      if (!post || !author) return null;
      return { cents: post.priceCents, title: "Desbloquear contenido", desc: `Pago único a @${author.handle} · el contenido será tuyo para siempre` };
    }
    const author = db.users.find((u) => u.id === pending.creatorId);
    if (!author) return null;
    return { cents: author.subPriceCents, title: `Suscripción a @${author.handle}`, desc: `Pago mensual · desbloquea todo su contenido de pago` };
  }, [pending, db.posts, db.users]);

  const completeUnlock = (postId: string) => {
    if (!me) return;
    setDb((p) => {
      const post = p.posts.find((x) => x.id === postId);
      const author = post && p.users.find((u) => u.id === post.authorId);
      if (!post || !author || post.unlocks.includes(me.id)) return p;
      // El creador gana en SU moneda (85 %); al comprador se le cobra el
      // equivalente convertido a SU moneda local.
      const net = Math.round((post.priceCents * (10000 - FEE_BPS)) / 10000);
      const charge = convert(post.priceCents, author.currency, me.currency);
      return {
        ...p,
        users: p.users.map((u) => (u.id === author.id ? { ...u, balanceCents: u.balanceCents + net } : u)),
        posts: p.posts.map((x) => (x.id === postId ? { ...x, unlocks: [...x.unlocks, me.id] } : x)),
        txns: [
          { id: uid(), userId: me.id, kind: "unlock" as const, cents: -charge, label: `Desbloqueo PPV · @${author.handle}`, at: Date.now() },
          { id: uid(), userId: author.id, kind: "earning" as const, cents: net, label: `Venta de contenido · @${me.handle}`, at: Date.now() },
          ...p.txns,
        ],
        notifs: [{ id: uid(), userId: author.id, icon: "gem" as const, text: `${me.name} desbloqueó tu contenido por ${money(post.priceCents, author.currency)}. Ganaste ${money(net, author.currency)}.`, at: Date.now(), read: false, go: { type: "post" as const, id: postId } }, ...p.notifs],
      };
    });
  };
  const completeSubscribe = (creatorId: string) => {
    if (!me) return;
    setDb((p) => {
      const author = p.users.find((u) => u.id === creatorId);
      if (!author || p.subs.some((s) => s.fanId === me.id && s.creatorId === creatorId)) return p;
      const net = Math.round((author.subPriceCents * (10000 - FEE_BPS)) / 10000);
      const charge = convert(author.subPriceCents, author.currency, me.currency);
      return {
        ...p,
        users: p.users.map((u) => (u.id === author.id ? { ...u, balanceCents: u.balanceCents + net } : u)),
        subs: [{ fanId: me.id, creatorId, priceCents: author.subPriceCents, at: Date.now() }, ...p.subs],
        txns: [
          { id: uid(), userId: me.id, kind: "subscription" as const, cents: -charge, label: `Suscripción mensual · @${author.handle}`, at: Date.now() },
          { id: uid(), userId: author.id, kind: "earning" as const, cents: net, label: `Nuevo suscriptor · @${me.handle}`, at: Date.now() },
          ...p.txns,
        ],
        notifs: [{ id: uid(), userId: author.id, icon: "crown" as const, text: `${me.name} se suscribió a tu contenido por ${money(author.subPriceCents, author.currency)}/mes.`, at: Date.now(), read: false, go: { type: "profile" as const, id: me.id } }, ...p.notifs],
      };
    });
  };

  /* Confirma la compra pendiente. `card` se pasa solo si se acaba de registrar
     una tarjeta nueva (queda guardada para próximas compras). */
  const confirmPurchase = (card?: SavedCard) => {
    if (!pending || !me) return;
    setPurchasing(true);
    window.setTimeout(() => {
      if (card) {
        setDb((p) => ({ ...p, users: p.users.map((u) => (u.id === me.id ? { ...u, card } : u)) }));
      }
      if (pending.kind === "unlock") {
        completeUnlock(pending.postId);
        toast("Pago realizado con tu tarjeta. Contenido desbloqueado.", "ok");
      } else {
        completeSubscribe(pending.creatorId);
        const author = db.users.find((u) => u.id === pending.creatorId);
        toast(`Pago realizado con tu tarjeta. Suscrito a @${author?.handle ?? "creador"}.`, "gold");
      }
      setPurchasing(false);
      setPending(null);
      setChangingCard(false);
    }, 1400);
  };
  const cancelSub = (creatorId: string) => {
    if (!me) return;
    const author = db.users.find((u) => u.id === creatorId);
    setDb((p) => ({ ...p, subs: p.subs.filter((s) => !(s.fanId === me.id && s.creatorId === creatorId)) }));
    toast(author ? `Suscripción a @${author.handle} cancelada. Sus contenidos de pago volverán a bloquearse.` : "Suscripción cancelada.", "warn");
  };
  const setSubPrice = (cents: number) => {
    if (!me) return;
    setDb((p) => ({ ...p, users: p.users.map((u) => (u.id === me.id ? { ...u, subPriceCents: cents } : u)) }));
    toast(`Precio de tu suscripción actualizado: ${eur(cents)}/mes.`, "ok");
  };

  /* ─────────── mensajes ─────────── */
  const sendMsg = (to: string, text: string) => {
    if (!me) return;
    setDb((p) => ({
      ...p,
      msgs: [...p.msgs, { id: uid(), from: me.id, to, text, at: Date.now(), readBy: [me.id] }],
      notifs: [{ id: uid(), userId: to, icon: "chat" as const, text: `Nuevo mensaje de ${me.name} (@${me.handle}).`, at: Date.now(), read: false, go: { type: "chat" as const, id: me.id } }, ...p.notifs],
    }));
  };
  const openChatWith = (userId: string) => {
    setActiveChat(userId);
    setView("chats");
    setProfileId(null);
  };
  useEffect(() => {
    if (!me || view !== "chats" || !activeChat) return;
    const unreadMine = db.msgs.some((m) => m.from === activeChat && m.to === me.id && !m.readBy.includes(me.id));
    if (!unreadMine) return;
    setDb((p) => ({
      ...p,
      msgs: p.msgs.map((m) => (m.from === activeChat && m.to === me.id && !m.readBy.includes(me.id) ? { ...m, readBy: [...m.readBy, me.id] } : m)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeChat, db.msgs.length, me?.id]);

  /* ─────────── feed ─────────── */
  const feedPosts = useMemo(() => {
    let list = [...db.posts].sort((a, b) => b.createdAt - a.createdAt);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const author = db.users.find((u) => u.id === p.authorId);
        return p.text.toLowerCase().includes(q) || (author ? `${author.name} ${author.handle}`.toLowerCase().includes(q) : false);
      });
    }
    return list;
  }, [db.posts, db.users, search]);

  const postAct = {
    like, comment, unlock, subscribe, del: delPost,
    openProfile: (id: string) => { setProfileId(id); setView("profile"); window.scrollTo({ top: 0, behavior: "smooth" }); },
    toast,
  };
  const profileUser = profileId ? db.users.find((u) => u.id === profileId) ?? null : null;

  const peopleInSearch = search.trim()
    ? community.filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 5)
    : [];

  /* ═══════════ pantallas de entrada ═══════════ */
  if (!me) {
    return (<><AuthScreen onRegister={register} onLogin={login} onRecover={requestRecovery} onReset={hardReset} toast={toast} /><Toasts toasts={toasts} dismiss={dismissToast} /></>);
  }
  if (me.status === "pending") {
    return (<><VerificationScreen user={me} onApproved={approve} /><Toasts toasts={toasts} dismiss={dismissToast} /></>);
  }

  const isAdmin = me.role === "admin";

  /* ═══════════ aplicación ═══════════ */
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#0F172A] text-[#F8FAFC]">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-30" style={{ maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 25%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 25%, transparent 75%)" }} />
      <div className="noise-layer" />

      {/* ═══ cabecera ═══ */}
      <header className="sticky top-0 z-40 border-b border-[#334155] bg-[#0F172A]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button onClick={() => { setView("feed"); setProfileId(null); setSearch(""); }} className="transition active:scale-95" aria-label="Inicio">
            <Logo />
          </button>

          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              value={search}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => window.setTimeout(() => setSearchFocus(false), 180)}
              onChange={(e) => { setSearch(e.target.value); if (view !== "feed" && view !== "people") { setView("feed"); setProfileId(null); } }}
              placeholder="Buscar personas o publicaciones…"
              className="w-full rounded-xl border border-[#334155] bg-[#1E293B] py-2.5 pl-10 pr-9 text-[14px] placeholder:text-[#64748B] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] transition hover:text-white" aria-label="Limpiar búsqueda"><X className="h-4 w-4" /></button>
            )}
            {searchFocus && search.trim() && peopleInSearch.length > 0 && (
              <div className="anim-modal absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-[#334155] bg-[#1E293B] shadow-2xl">
                <p className="border-b border-[#334155] px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#64748B]">Personas unidas</p>
                {peopleInSearch.map((u) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => { e.preventDefault(); postAct.openProfile(u.id); setSearch(""); }}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-[#0F172A]"
                  >
                    <Avatar name={u.name} hue={u.hue} size={34} photoId={u.avatarId} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{u.name}</span>
                      <span className="block truncate text-[11.5px] text-[#64748B]">@{u.handle}</span>
                    </span>
                    <UserIcon className="h-4 w-4 text-[#2563EB]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => { setView("wallet"); setProfileId(null); }}
            className="hidden items-center gap-2 rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-3.5 py-2 text-[14px] font-bold text-[#6EE7B7] transition hover:bg-[#10B981]/20 active:scale-95 sm:flex"
            title="Tu cartera"
          >
            <Wallet className="h-4 w-4" /><span className="font-mono tabular-nums">{eur(me.balanceCents)}</span>
          </button>

          <button
            onClick={() => { setView("chats"); setProfileId(null); }}
            className="relative rounded-xl border border-[#334155] bg-[#1E293B] p-2.5 text-[#94A3B8] transition hover:border-[#475569] hover:text-white active:scale-95"
            aria-label={`Mensajes${unreadMsgs ? ` (${unreadMsgs} sin leer)` : ""}`}
          >
            <MessageSquare className="h-[18px] w-[18px]" />
            {unreadMsgs > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#2563EB] px-1 text-[10px] font-bold text-white">{unreadMsgs}</span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) markNotifs(); }}
              className="relative rounded-xl border border-[#334155] bg-[#1E293B] p-2.5 text-[#94A3B8] transition hover:border-[#475569] hover:text-white active:scale-95"
              aria-label={`Notificaciones${unread ? ` (${unread} sin leer)` : ""}`}
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && <span className="live-dot absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#EC4899]" />}
            </button>
            {notifOpen && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setNotifOpen(false)} aria-label="Cerrar notificaciones" tabIndex={-1} />
                <div className="anim-modal absolute right-0 top-full z-20 mt-2 w-80 rounded-2xl border border-[#334155] bg-[#1E293B] p-2 shadow-2xl">
                  <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#64748B]">Notificaciones reales</p>
                  {myNotifs.length === 0 && <p className="px-3 pb-3 text-[13px] text-[#64748B]">Cuando alguien interactúe contigo, lo verás aquí.</p>}
                  <div className="max-h-80 overflow-y-auto">
                    {myNotifs.slice(0, 10).map((n) => (
                      <div key={n.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#0F172A] ${n.read ? "opacity-60" : ""}`}>
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${n.icon === "heart" ? "bg-[#EC4899]/15 text-[#EC4899]" : n.icon === "crown" ? "bg-[#7C3AED]/15 text-[#C4B5FD]" : n.icon === "gem" ? "bg-[#10B981]/15 text-[#6EE7B7]" : n.icon === "friend" ? "bg-[#2563EB]/15 text-[#93C5FD]" : "bg-[#2563EB]/15 text-[#93C5FD]"}`}>
                          {n.icon === "heart" ? <Heart className="h-4 w-4" /> : n.icon === "crown" ? <Crown className="h-4 w-4" /> : n.icon === "gem" ? <Gem className="h-4 w-4" /> : n.icon === "friend" ? <UserPlus className="h-4 w-4" /> : n.icon === "chat" ? <MessageSquare className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                        </span>
                        <div>
                          <p className="text-[13px] leading-snug text-[#F8FAFC]">{n.text}</p>
                          <p className="mt-0.5 text-[11px] text-[#64748B]">{timeAgo(n.at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {isAdmin && (
            <button
              onClick={() => { setView("admin"); setProfileId(null); }}
              className="relative rounded-xl border border-[#7C3AED]/50 bg-[#7C3AED]/10 p-2.5 text-[#C4B5FD] transition hover:bg-[#7C3AED]/25 active:scale-95"
              aria-label="Panel de administración"
              title="Panel de administración"
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
              {pendingAdminTasks > 0 && (
                <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#F59E0B] px-1 text-[10px] font-bold text-[#0F172A]">{pendingAdminTasks}</span>
              )}
            </button>
          )}

          <button onClick={() => { setProfileId(me.id); setView("profile"); }} className="transition active:scale-95" aria-label="Tu perfil" title="Tu perfil">
            <Avatar name={me.name} hue={me.hue} size={38} ring={premium} photoId={me.avatarId} />
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)_270px]">
        {/* ═══ sidebar ═══ */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <nav className="space-y-1">
              {([
                ["feed", <Home key="i" className="h-5 w-5" />, "Feed social", 0],
                ["people", <Users key="i" className="h-5 w-5" />, "Personas unidas", db.reqs.filter((r) => r.to === me.id && r.status === "pending").length],
                ["chats", <MessageSquare key="i" className="h-5 w-5" />, "Mensajes", unreadMsgs],
                ["profile", <UserIcon key="i" className="h-5 w-5" />, "Mi perfil", 0],
                ["wallet", <Wallet key="i" className="h-5 w-5" />, "Cartera", 0],
              ] as [View, React.ReactNode, string, number][]).map(([v, ic, label, badge]) => {
                const active = view === v && (v !== "profile" || profileId === me.id);
                return (
                  <button
                    key={v}
                    onClick={() => { setView(v); setProfileId(v === "profile" ? me.id : null); if (v !== "chats") setActiveChat(null); }}
                    className={`relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-bold transition-all duration-200 ${active ? "bg-[#2563EB]/15 text-[#93C5FD]" : "text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"}`}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#2563EB]" />}
                    {ic}{label}
                    {badge > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#2563EB] px-1 text-[10.5px] font-bold text-white">{badge}</span>}
                  </button>
                );
              })}
              {isAdmin && (
                <button
                  onClick={() => setView("admin")}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-bold transition-all duration-200 ${view === "admin" ? "bg-[#7C3AED]/15 text-[#C4B5FD]" : "text-[#C4B5FD]/70 hover:bg-[#1E293B] hover:text-[#C4B5FD]"}`}
                >
                  {view === "admin" && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#7C3AED]" />}
                  <ShieldCheck className="h-5 w-5" /> Administración
                  {pendingAdminTasks > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#F59E0B] px-1 text-[10.5px] font-bold text-[#0F172A]">{pendingAdminTasks}</span>}
                </button>
              )}
            </nav>

            <button
              onClick={() => setComposerOpen(true)}
              disabled={!premium}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[14px] font-bold text-white transition-all duration-200 hover:bg-[#1D4ED8] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> {premium ? "Publicar contenido" : "Publicar (requiere Premium)"}
            </button>

            {premium ? (
              <div className="rounded-2xl border border-[#7C3AED]/40 bg-gradient-to-b from-[#7C3AED]/15 to-transparent p-4">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#C4B5FD]"><Sparkles className="h-4 w-4" /> Premium activo</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#94A3B8]">
                  Vence el {new Date(me.premiumUntil!).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}. Publica y vende sin límites.
                </p>
                <p className="mt-2.5 flex items-center justify-between font-mono text-[12px]">
                  <span className="text-[#64748B]">Ganancias</span>
                  <span className="font-bold text-[#6EE7B7]">{eur(myEarnings)}</span>
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-4">
                <p className="flex items-center gap-1.5 text-[13px] font-bold"><Crown className="h-4 w-4 text-[#C4B5FD]" /> Hazte Premium</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#94A3B8]">Solo si quieres publicar y vender. La amistad y el chat siguen siendo gratis.</p>
                <button onClick={() => setPremiumOpen(true)} className="mt-3 w-full rounded-lg bg-[#7C3AED] py-2 text-[13px] font-bold text-white transition hover:bg-[#6D28D9] active:scale-95">
                  Activar · {eur(PREMIUM_CENTS)}/mes
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-2xl border border-[#334155] bg-[#1E293B] p-3">
              <Avatar name={me.name} hue={me.hue} size={38} photoId={me.avatarId} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{me.name}</p>
                <p className="truncate text-[11px] text-[#64748B]">@{me.handle}</p>
              </div>
              <button onClick={() => setSessionId(null)} className="rounded-lg p-2 text-[#64748B] transition hover:bg-[#0F172A] hover:text-[#F87171]" aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* ═══ contenido central ═══ */}
        <main className="min-w-0 pb-24 lg:pb-4">
          {view === "feed" && (
            <div className="space-y-4">
              {premium ? (
                <Reveal>
                  <button
                    onClick={() => setComposerOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[#334155] bg-[#1E293B] p-4 text-left transition-all duration-200 hover:border-[#2563EB]/60 hover:shadow-lg hover:shadow-[#2563EB]/5"
                  >
                    <Avatar name={me.name} hue={me.hue} size={42} photoId={me.avatarId} />
                    <span className="flex-1 rounded-xl bg-[#0F172A] px-4 py-2.5 text-[14px] text-[#64748B]">Comparte una foto, un video… o véndelo.</span>
                    <span className="hidden items-center gap-1.5 rounded-xl border border-[#334155] px-3 py-2 text-[12px] font-bold text-[#94A3B8] sm:flex"><ImageIcon className="h-4 w-4 text-[#2563EB]" /> Foto</span>
                    <span className="hidden items-center gap-1.5 rounded-xl border border-[#334155] px-3 py-2 text-[12px] font-bold text-[#94A3B8] sm:flex"><Video className="h-4 w-4 text-[#7C3AED]" /> Video</span>
                    <span className="flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-[13px] font-bold text-white"><Plus className="h-4 w-4" strokeWidth={2.5} /> Publicar</span>
                  </button>
                </Reveal>
              ) : (
                <Reveal>
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-[#334155] bg-[#1E293B]/60 p-4">
                    <Avatar name={me.name} hue={me.hue} size={42} photoId={me.avatarId} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold">Publicar requiere Premium</p>
                      <p className="text-[12.5px] text-[#94A3B8]">Mientras tanto: amistad, chat, perfiles y desbloqueos siguen gratis para ti.</p>
                    </div>
                    <button onClick={() => setPremiumOpen(true)} className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#6D28D9] active:scale-95">
                      <Crown className="h-4 w-4" /> Activar Premium · {eur(PREMIUM_CENTS)}/mes
                    </button>
                  </div>
                </Reveal>
              )}

              {search && (
                <p className="px-1 text-[13px] text-[#94A3B8]">
                  <span className="font-bold text-[#F8FAFC]">{feedPosts.length}</span> {feedPosts.length === 1 ? "resultado" : "resultados"} para «{search}»
                </p>
              )}

              {feedPosts.length === 0 ? (
                <Reveal delay={80}>
                  <div className="rounded-2xl border border-[#334155] bg-[#1E293B] px-6 py-14 text-center">
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#2563EB]/12 text-[#2563EB]"><ImageIcon className="h-7 w-7" /></span>
                    <p className="mt-4 text-[18px] font-bold" style={{ fontFamily: DISPLAY }}>
                      {search ? "Sin resultados para tu búsqueda" : "Aún no hay publicaciones"}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-[#94A3B8]">
                      {search
                        ? "Prueba con otro término o busca en Personas unidas."
                        : "Esta comunidad se construye con personas reales: cuando alguien publicado su primera foto o video, aparecerá aquí."}
                    </p>
                    {!search && premium && (
                      <button onClick={() => setComposerOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#1D4ED8] active:scale-95">
                        <Plus className="h-4 w-4" strokeWidth={2.5} /> Sé quien publique primero
                      </button>
                    )}
                  </div>
                </Reveal>
              ) : (
                feedPosts.map((p, i) => <PostCard key={p.id} post={p} index={i} me={me} db={db} act={postAct} />)
              )}
            </div>
          )}

          {view === "people" && (
            <PeopleView
              db={db} me={me} rel={rel}
              onOpen={(id) => { setProfileId(id); setView("profile"); }}
              onMessage={(id) => openChatWith(id)}
              onFriend={sendFriendReq}
              onAccept={acceptFriendReq}
              onDecline={declineFriendReq}
            />
          )}

          {view === "profile" && profileUser && (
            <ProfileView
              user={profileUser} me={me} db={db} myEarnings={myEarnings} premium={premium}
              theme={theme} onTheme={setTheme} onSubPrice={setSubPrice} act={postAct} onLogout={() => setSessionId(null)}
              onMessage={(id) => openChatWith(id)}
            />
          )}

          {view === "wallet" && (
            <WalletView
              me={me} db={db} premium={premium} myEarnings={myEarnings} mySubscribers={mySubscribers}
              onPremium={() => setPremiumOpen(true)}
              onCancelSub={cancelSub}
              openProfile={(id) => { setProfileId(id); setView("profile"); }}
              onCardChange={() => setCardModalOpen(true)}
            />
          )}

          {view === "chats" && (
            <ChatsView
              db={db} me={me} activeId={activeChat} setActiveId={setActiveChat}
              onSend={sendMsg} onOpenProfile={(id) => { setProfileId(id); setView("profile"); }}
              onFriendReq={sendFriendReq} rel={rel}
            />
          )}

          {view === "admin" && isAdmin && (
            <AdminView
              db={db}
              onSendPassword={sendPasswordTo}
              onRetry={retryEmail}
              onDismiss={dismissRecovery}
              onSaveMail={saveMailSettings}
              onTestMail={sendTestMail}
              onReset={hardReset}
              toast={toast}
            />
          )}
        </main>

        {/* ═══ rail derecho ═══ */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-[#64748B]"><Users className="h-4 w-4" /> Personas unidas</p>
                <button onClick={() => setView("people")} className="text-[11.5px] font-bold text-[#93C5FD] underline-offset-4 transition hover:underline">Ver todas</button>
              </div>

              {db.reqs.filter((r) => r.to === me.id && r.status === "pending").length > 0 && (
                <div className="mt-3 space-y-2.5 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/8 p-3">
                  <p className="text-[11.5px] font-bold text-[#FCD34D]">Solicitudes de amistad pendientes</p>
                  {db.reqs.filter((r) => r.to === me.id && r.status === "pending").slice(0, 3).map((rq) => {
                    const u = db.users.find((x) => x.id === rq.from);
                    if (!u) return null;
                    return (
                      <div key={rq.id} className="flex items-center gap-2.5">
                        <Avatar name={u.name} hue={u.hue} size={32} photoId={u.avatarId} />
                        <button onClick={() => { setProfileId(u.id); setView("profile"); }} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-[12.5px] font-bold">{u.name}</p>
                          <p className="truncate text-[10.5px] text-[#64748B]">@{u.handle}</p>
                        </button>
                        <button onClick={() => acceptFriendReq(rq.id)} className="rounded-lg bg-[#10B981] px-2.5 py-1 text-[11px] font-bold text-white transition hover:brightness-110 active:scale-95">Aceptar</button>
                        <button onClick={() => declineFriendReq(rq.id)} className="rounded-lg border border-[#334155] px-2 py-1 text-[11px] font-bold text-[#94A3B8] transition hover:text-[#F87171] active:scale-95" aria-label="Rechazar"><X className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                </div>
              )}

              {community.length === 0 ? (
                <p className="mt-3 text-[13px] leading-relaxed text-[#94A3B8]">
                  Aquí aparecerán las personas reales que se registren y sean aprobadas. Todavía no hay ninguna además de ti.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {community.slice(0, 6).map((u) => {
                    const r = rel(u.id);
                    const rq = db.reqs.find((x) => x.to === me.id && x.from === u.id && x.status === "pending");
                    return (
                      <PersonRow
                        key={u.id} user={u} me={me} rel={r} compact
                        onOpen={() => { setProfileId(u.id); setView("profile"); }}
                        onMessage={() => openChatWith(u.id)}
                        onFriend={() => sendFriendReq(u.id)}
                        onAccept={() => rq && acceptFriendReq(rq.id)}
                        onDecline={() => rq && declineFriendReq(rq.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#334155] bg-[#1E293B] p-4">
              <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-[#64748B]"><Sparkles className="h-4 w-4" /> Tu actividad</p>
              <div className="mt-3 space-y-2.5 text-[13px]">
                {[
                  ["Publicaciones", String(db.posts.filter((p) => p.authorId === me.id).length)],
                  ["Amigos", String(db.reqs.filter((r) => r.status === "accepted" && (r.from === me.id || r.to === me.id)).length)],
                  ["Suscriptores tuyos", String(mySubscribers)],
                  ["Ganancias", eur(myEarnings)],
                ].map(([l, v]) => (
                  <p key={l} className="flex items-center justify-between">
                    <span className="text-[#94A3B8]">{l}</span>
                    <span className="font-mono font-bold tabular-nums text-[#F8FAFC]">{v}</span>
                  </p>
                ))}
              </div>
              <p className="mt-3 border-t border-[#334155] pt-3 text-[11.5px] leading-relaxed text-[#64748B]">
                Solo datos de cuentas reales registradas en este navegador. Sin bots, sin cifras infladas.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* ═══ nav móvil ═══ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center gap-1 border-t border-[#334155] bg-[#0F172A]/95 px-2 py-1.5 backdrop-blur-xl lg:hidden">
        {([
          ["feed", <Home key="i" className="h-5 w-5" />, "Inicio", () => { setView("feed"); setProfileId(null); }, view === "feed"],
          ["people", <Users key="i" className="h-5 w-5" />, "Personas", () => { setView("people"); setProfileId(null); }, view === "people"],
        ] as [View, React.ReactNode, string, () => void, boolean][]).map(([v, ic, label, fn, active]) => (
          <button key={v} onClick={fn} className={`relative flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold transition ${active ? "text-[#93C5FD]" : "text-[#64748B]"}`}>
            {ic}{label}
            {v === "people" && db.reqs.filter((r) => r.to === me.id && r.status === "pending").length > 0 && (
              <span className="absolute right-1/2 top-0.5 translate-x-4 h-2 w-2 rounded-full bg-[#F59E0B]" />
            )}
          </button>
        ))}
        <button
          onClick={() => { if (premium) setComposerOpen(true); else setPremiumOpen(true); }}
          className="flex flex-col items-center justify-center"
          aria-label="Publicar contenido"
        >
          <span className={`grid h-11 w-11 -translate-y-3 place-items-center rounded-2xl text-white shadow-lg transition active:scale-90 ${premium ? "bg-gradient-to-br from-[#2563EB] to-[#7C3AED] shadow-[#2563EB]/40" : "bg-[#334155] shadow-black/30"}`}>
            {premium ? <Plus className="h-5 w-5" strokeWidth={2.5} /> : <Lock className="h-5 w-5" />}
          </span>
          <span className="-mt-2 text-[10px] font-bold text-[#64748B]">{premium ? "Publicar" : "Premium"}</span>
        </button>
        {([
          ["chats", <MessageSquare key="i" className="h-5 w-5" />, "Chats", () => { setView("chats"); setProfileId(null); }, view === "chats", unreadMsgs],
          ["profile", <UserIcon key="i" className="h-5 w-5" />, "Perfil", () => { setProfileId(me.id); setView("profile"); }, view === "profile" && profileId === me.id, 0],
        ] as [View, React.ReactNode, string, () => void, boolean, number][]).map(([v, ic, label, fn, active, badge]) => (
          <button key={v} onClick={fn} className={`relative flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold transition ${active ? "text-[#93C5FD]" : "text-[#64748B]"}`}>
            <span className="relative">
              {ic}
              {badge > 0 && <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#2563EB] px-0.5 text-[9px] font-bold text-white">{badge}</span>}
            </span>
            {label}
          </button>
        ))}
      </nav>

      {/* ═══ modales ═══ */}
      {composerOpen && <Composer me={me} onPublish={publish} onClose={() => setComposerOpen(false)} />}

      <Modal open={premiumOpen} onClose={() => !payBusy && setPremiumOpen(false)}>
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[17px] font-bold" style={{ fontFamily: DISPLAY }}><Crown className="h-5 w-5 text-[#C4B5FD]" /> {BRAND} Premium</h3>
          <button onClick={() => !payBusy && setPremiumOpen(false)} className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">
          <ul className="mb-5 space-y-2">
            {["Publicar fotos y videos desde tu equipo", "Vender contenido con el precio que tú decidas", "Recibir el 85 % de cada venta y suscripción", "Insignia de creador verificado en tu perfil"].map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-[14px] text-[#CBD5E1]"><Check className="h-4 w-4 shrink-0 text-[#10B981]" strokeWidth={2.5} />{b}</li>
            ))}
          </ul>
          <PayPanel
            me={me}
            cta="Activar Premium"
            amountLabel={`${eur(PREMIUM_CENTS)}/mes`}
            busy={payBusy}
            onConfirm={() => applyPayment(buyPremium, me.card ?? { brand: "Tarjeta", last4: "0000", holder: me.name }, "Premium activado durante 30 días. ¡A publicar!")}
            onChangeCard={() => setCardModalOpen(true)}
          />
        </div>
      </Modal>

      {/* Confirmación de compra: desbloqueo PPV o suscripción, cobro directo a la tarjeta */}
      <Modal open={!!pending} onClose={() => !purchasing && setPending(null)}>
        {pending && pendingInfo && (
          <>
            <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
              <h3 className="text-[17px] font-bold" style={{ fontFamily: DISPLAY }}>{pendingInfo.title}</h3>
              <button onClick={() => !purchasing && setPending(null)} className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
                <p className="text-[13px] text-[#94A3B8]">{pendingInfo.desc}</p>
                <p className="ml-3 font-mono text-[18px] font-bold tabular-nums text-[#F8FAFC]">{eur(pendingInfo.cents)}</p>
              </div>
              {me.card && !changingCard ? (
                <PayPanel
                  me={me}
                  cta="Pagar"
                  amountLabel={eur(pendingInfo.cents)}
                  busy={purchasing}
                  onConfirm={() => confirmPurchase()}
                  onChangeCard={() => setChangingCard(true)}
                />
              ) : (
                <CardForm
                  cta="Pagar"
                  amountLabel={eur(pendingInfo.cents)}
                  busy={purchasing}
                  onPay={(card) => confirmPurchase(card)}
                />
              )}
              {changingCard && me.card && (
                <button onClick={() => setChangingCard(false)} className="mt-2 w-full text-center text-[12.5px] font-semibold text-[#94A3B8] underline-offset-4 transition hover:text-white hover:underline">
                  Volver a mi tarjeta ···· {me.card.last4}
                </button>
              )}
            </div>
          </>
        )}
      </Modal>

      <Modal open={cardModalOpen} onClose={() => !payBusy && setCardModalOpen(false)}>
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <h3 className="text-[17px] font-bold" style={{ fontFamily: DISPLAY }}>{me.card ? "Cambiar tarjeta" : "Añadir tarjeta"}</h3>
          <button onClick={() => !payBusy && setCardModalOpen(false)} className="rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#0F172A] hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">
          <CardForm
            cta="Guardar tarjeta"
            amountLabel="0,00 €"
            busy={payBusy}
            saveLabel="Solo guardamos la marca y los últimos 4 dígitos para tus próximos pagos."
            onPay={(card) => {
              setPayBusy(true);
              window.setTimeout(() => {
                setDb((p) => ({ ...p, users: p.users.map((u) => (u.id === me.id ? { ...u, card } : u)) }));
                setPayBusy(false);
                setCardModalOpen(false);
                toast(`Tarjeta ${card.brand} ···· ${card.last4} guardada. No volverás a escribirla.`, "ok");
              }, 900);
            }}
          />
        </div>
      </Modal>

      <Toasts toasts={toasts} dismiss={dismissToast} />
    </div>
  );

  function markNotifs() {
    if (!me) return;
    setDb((p) => ({ ...p, notifs: p.notifs.map((n) => (n.userId === me.id ? { ...n, read: true } : n)) }));
  }
}
