// POST /api/auth  { action: 'register' | 'login' | 'admin', nama, wa, password }
import { db, wrap, HttpError, hashPw, checkPw, safeEq, signToken, isConflict } from './_lib.js';

export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Metode tidak didukung.');
  const { action, nama, wa, password } = req.body || {};
  const pw = String(password || '');

  if (action === 'admin') {
    const ap = process.env.ADMIN_PASSWORD;
    if (!ap) throw new HttpError(500, 'ADMIN_PASSWORD belum diatur di Vercel.');
    if (!safeEq(pw, ap)) throw new HttpError(401, 'Password admin salah.');
    return res.json({ token: signToken({ role: 'admin' }), role: 'admin' });
  }

  const w = String(wa || '').replace(/\D/g, '');
  if (w.length < 9 || w.length > 15) throw new HttpError(400, 'Nomor WhatsApp tidak valid.');
  if (pw.length < 4 || pw.length > 100) throw new HttpError(400, 'Password minimal 4 karakter.');
  const sql = await db();

  if (action === 'register') {
    const n = String(nama || '').trim();
    if (n.length < 2 || n.length > 60) throw new HttpError(400, 'Isi nama lengkap.');
    try {
      await sql`insert into users(nama, wa, pw_hash) values(${n}, ${w}, ${hashPw(pw)})`;
    } catch (e) {
      if (isConflict(e)) throw new HttpError(409, 'Nomor sudah terdaftar. Silakan masuk.');
      throw e;
    }
    return res.json({ token: signToken({ role: 'pelanggan', sub: w, nama: n }), role: 'pelanggan', user: { nama: n, wa: w } });
  }

  if (action === 'login') {
    const rows = await sql`select nama, wa, pw_hash from users where wa = ${w}`;
    if (!rows.length || !checkPw(pw, rows[0].pw_hash)) throw new HttpError(401, 'Nomor WhatsApp atau password salah.');
    const u = rows[0];
    return res.json({ token: signToken({ role: 'pelanggan', sub: u.wa, nama: u.nama }), role: 'pelanggan', user: { nama: u.nama, wa: u.wa } });
  }

  throw new HttpError(400, 'Aksi tidak dikenal.');
});
