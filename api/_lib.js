// Helper bersama untuk semua endpoint API (file berawalan _ tidak menjadi endpoint)
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Database (Neon Postgres) ---------- */
let ready = null;
export async function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new HttpError(500, 'Database belum terhubung. Hubungkan Neon lewat Vercel > Storage, lalu deploy ulang.');
  const sql = neon(url);
  // Tabel dibuat otomatis saat pertama kali dipakai
  ready ??= sql.transaction([
    sql`create table if not exists users(
      id serial primary key, nama text not null, wa text unique not null,
      pw_hash text not null, created_at timestamptz default now())`,
    sql`create table if not exists profile(id int primary key check (id = 1), data jsonb not null)`,
    sql`create table if not exists bookings(
      id text primary key, user_wa text not null, nama text not null, wa text not null,
      tgl date not null, court int not null check (court in (1,2,3)), mulai int not null,
      dur int not null check (dur between 1 and 4), status text not null default 'Aktif',
      bayar int not null default 0, harga int not null, klaim jsonb, created_at timestamptz default now())`,
    sql`create table if not exists payments(
      id serial primary key, booking_id text not null references bookings(id),
      jenis text not null, nominal int not null, created_at timestamptz default now())`,
    sql`create table if not exists proofs(
      id serial primary key, booking_id text not null references bookings(id),
      data text not null, created_at timestamptz default now())`,
    // Satu baris = satu jam terpakai. Primary key mencegah booking ganda.
    // booking_id kosong = slot ditutup admin.
    sql`create table if not exists slots(
      tgl date not null, court int not null, jam int not null,
      booking_id text references bookings(id) on delete cascade,
      primary key (tgl, court, jam))`,
  ]).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}

const DEFAULT_PROFILE = {
  nama: 'Blessing Futsal Purwakarta',
  alamat: 'Purwakarta, Jawa Barat (ubah alamat lengkap lewat Dashboard Admin)',
  wa: '08xxxxxxxxxx', buka: '08.00 - 23.00 WIB', harga: 100000,
  rek: 'DANA +62 898-6422-425',
  desk: 'Futsal indoor dengan 3 lapangan, nyaman untuk latihan, turnamen kecil, maupun main bareng teman.',
};
export async function getProfile(sql) {
  const rows = await sql`select data from profile where id = 1`;
  return { ...DEFAULT_PROFILE, ...(rows[0]?.data || {}) };
}

/* ---------- Respons & error ---------- */
export const wrap = (fn) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
};
export const isConflict = (e) => e && (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message || ''));

/* ---------- Password & token ---------- */
export function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
export function checkPw(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new HttpError(500, 'AUTH_SECRET belum diatur di Vercel (minimal 16 karakter).');
  return s;
};
const sig = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
export function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  return body + '.' + sig(body);
}
export function auth(req, role) {
  const h = req.headers.authorization || '';
  const [body, s] = (h.startsWith('Bearer ') ? h.slice(7) : '').split('.');
  if (!body || !s || !safeEq(s, sig(body))) throw new HttpError(401, 'Sesi tidak valid. Silakan login kembali.');
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { throw new HttpError(401, 'Sesi tidak valid.'); }
  if (!p.exp || p.exp < Date.now()) throw new HttpError(401, 'Sesi berakhir. Silakan login kembali.');
  if (role && p.role !== role) throw new HttpError(403, 'Akses ditolak.');
  return p;
}

/* ---------- Validasi jadwal ---------- */
export const todayWIB = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
export const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
export function checkSlot(date, court, start, dur) {
  if (!validDate(date)) throw new HttpError(400, 'Tanggal tidak valid.');
  if (date < todayWIB()) throw new HttpError(400, 'Tanggal tidak boleh sudah lewat.');
  if (![1, 2, 3].includes(court)) throw new HttpError(400, 'Pilih Lapangan 1, 2, atau 3.');
  if (!Number.isInteger(start) || !Number.isInteger(dur) || start < 8 || dur < 1 || dur > 4 || start + dur > 23)
    throw new HttpError(400, 'Jam atau durasi di luar jam operasional (08.00 - 23.00).');
}
