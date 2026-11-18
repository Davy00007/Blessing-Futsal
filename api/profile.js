// GET /api/profile (publik)  |  PUT /api/profile (admin)
import { db, wrap, HttpError, auth, getProfile } from './_lib.js';

const TEXT = ['nama', 'alamat', 'wa', 'buka', 'rek', 'desk'];

export default wrap(async (req, res) => {
  const sql = await db();
  if (req.method === 'GET') return res.json(await getProfile(sql));
  if (req.method === 'PUT') {
    auth(req, 'admin');
    const b = req.body || {}, d = {};
    for (const k of TEXT) d[k] = String(b[k] ?? '').trim().slice(0, 300);
    d.harga = Math.round(+b.harga);
    if (!d.nama || !(d.harga >= 0 && d.harga <= 10000000)) throw new HttpError(400, 'Nama dan harga per jam wajib diisi dengan benar.');
    await sql`insert into profile(id, data) values(1, ${JSON.stringify(d)}::jsonb)
              on conflict (id) do update set data = excluded.data`;
    return res.json(await getProfile(sql));
  }
  throw new HttpError(405, 'Metode tidak didukung.');
});
