// GET /api/proof?booking=ID -> daftar bukti transfer (admin, atau pemilik booking)
import { db, wrap, HttpError, auth } from './_lib.js';

export default wrap(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Metode tidak didukung.');
  const p = auth(req);
  const id = String(req.query.booking || '');
  const sql = await db();
  const b = (await sql`select user_wa from bookings where id = ${id}`)[0];
  if (!b) throw new HttpError(404, 'Booking tidak ditemukan.');
  if (p.role !== 'admin' && p.sub !== b.user_wa) throw new HttpError(403, 'Akses ditolak.');
  const proofs = await sql`select id, data, to_char(created_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') as at
                           from proofs where booking_id = ${id} order by id desc`;
  res.json({ proofs });
});
