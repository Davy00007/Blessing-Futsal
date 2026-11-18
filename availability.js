// GET /api/availability?date=YYYY-MM-DD (publik)  |  POST { date, court, hour } (admin: tutup/buka slot)
import { db, wrap, HttpError, auth, validDate } from './_lib.js';

export default wrap(async (req, res) => {
  const sql = await db();
  if (req.method === 'GET') {
    const date = String(req.query.date || '');
    if (!validDate(date)) throw new HttpError(400, 'Tanggal tidak valid.');
    const slots = await sql`select court, jam as hour, (booking_id is null) as blocked from slots where tgl = ${date}::date`;
    return res.json({ date, slots });
  }
  if (req.method === 'POST') {
    auth(req, 'admin');
    const { date } = req.body || {}, court = +req.body?.court, hour = +req.body?.hour;
    if (!validDate(date) || ![1, 2, 3].includes(court) || !Number.isInteger(hour) || hour < 8 || hour > 22)
      throw new HttpError(400, 'Data slot tidak valid.');
    const del = await sql`delete from slots where tgl = ${date}::date and court = ${court}::int and jam = ${hour}::int and booking_id is null returning jam`;
    if (del.length) return res.json({ blocked: false });
    const ins = await sql`insert into slots(tgl, court, jam) values(${date}::date, ${court}::int, ${hour}::int) on conflict do nothing returning jam`;
    if (!ins.length) throw new HttpError(409, 'Slot ini sudah terisi booking.');
    return res.json({ blocked: true });
  }
  throw new HttpError(405, 'Metode tidak didukung.');
});
