// GET  /api/bookings                       -> pelanggan: miliknya, admin: semua
// POST /api/bookings                       -> pelanggan buat booking (cek ketersediaan otomatis oleh database)
// PATCH /api/bookings { id, action, ... }  -> confirm (pelanggan) | pay, reschedule, cancel (admin)
import crypto from 'node:crypto';
import { db, wrap, HttpError, auth, getProfile, checkSlot, isConflict } from './_lib.js';

const slotRows = (sql, id, date, court, start, dur) =>
  sql`insert into slots(tgl, court, jam, booking_id)
      select ${date}::date, ${court}::int, g.h, ${id} from generate_series(${start}::int, ${start + dur - 1}::int) as g(h)`;

export default wrap(async (req, res) => {
  const p = auth(req);
  const sql = await db();

  if (req.method === 'GET') {
    const bookings = p.role === 'admin'
      ? await sql`select id, nama, wa, to_char(tgl,'YYYY-MM-DD') as "date", court, mulai as "start", dur, status, bayar, harga, klaim,
                         (select count(*)::int from proofs p where p.booking_id = bookings.id) as bukti
                  from bookings order by tgl desc, mulai limit 500`
      : await sql`select id, nama, wa, to_char(tgl,'YYYY-MM-DD') as "date", court, mulai as "start", dur, status, bayar, harga, klaim,
                         (select count(*)::int from proofs p where p.booking_id = bookings.id) as bukti
                  from bookings where user_wa = ${p.sub} order by tgl desc, mulai limit 200`;
    return res.json({ bookings });
  }

  if (req.method === 'POST') {
    if (p.role !== 'pelanggan') throw new HttpError(403, 'Hanya pelanggan yang dapat membuat booking.');
    const { date } = req.body || {}, court = +req.body?.court, start = +req.body?.start, dur = +req.body?.dur;
    checkSlot(date, court, start, dur);
    const nama = String(req.body?.nama || '').trim().slice(0, 60);
    const wa = String(req.body?.wa || '').replace(/\D/g, '');
    if (nama.length < 2 || wa.length < 9 || wa.length > 15) throw new HttpError(400, 'Lengkapi nama dan nomor WhatsApp dengan benar.');
    const { harga } = await getProfile(sql);
    const id = 'BF' + crypto.randomBytes(4).toString('hex').toUpperCase();
    try {
      await sql.transaction([
        sql`insert into bookings(id, user_wa, nama, wa, tgl, court, mulai, dur, harga)
            values(${id}, ${p.sub}, ${nama}, ${wa}, ${date}::date, ${court}::int, ${start}::int, ${dur}::int, ${harga}::int)`,
        slotRows(sql, id, date, court, start, dur),
      ]);
    } catch (e) {
      if (isConflict(e)) throw new HttpError(409, 'Jadwal bentrok atau ditutup. Pilih jam/lapangan lain di menu Jadwal.');
      throw e;
    }
    return res.status(201).json({ id });
  }

  if (req.method === 'PATCH') {
    const { id, action } = req.body || {};
    const rows = await sql`select id, user_wa, to_char(tgl,'YYYY-MM-DD') as tgl, court, mulai, dur, status, bayar, harga from bookings where id = ${String(id || '')}`;
    const b = rows[0];
    if (!b) throw new HttpError(404, 'Booking tidak ditemukan.');
    if (b.status !== 'Aktif') throw new HttpError(400, 'Booking sudah dibatalkan.');
    const sisa = b.dur * b.harga - b.bayar;

    if (action === 'confirm') { // pelanggan mengirim konfirmasi transfer
      if (p.role !== 'pelanggan' || p.sub !== b.user_wa) throw new HttpError(403, 'Akses ditolak.');
      const jenis = req.body.jenis === 'lunas' ? 'lunas' : 'dp';
      const n = Math.round(+req.body.nominal);
      if (!(n >= 1 && n <= sisa)) throw new HttpError(400, 'Nominal harus antara Rp 1 dan sisa tagihan.');
      const bukti = String(req.body.bukti || '');
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(bukti) || bukti.length > 900000)
        throw new HttpError(400, 'Bukti transfer wajib diunggah berupa foto JPG/PNG (maksimal sekitar 600 KB).');
      const klaim = { jenis, nominal: n, pengirim: String(req.body.pengirim || '').trim().slice(0, 60), at: new Date().toISOString() };
      await sql.transaction([
        sql`insert into proofs(booking_id, data) values(${b.id}, ${bukti})`,
        sql`update bookings set klaim = ${JSON.stringify(klaim)}::jsonb where id = ${b.id}`,
      ]);
      return res.json({ ok: true });
    }

    auth(req, 'admin');

    if (action === 'pay') { // admin mencatat pembayaran
      const jenis = req.body.jenis === 'lunas' ? 'lunas' : 'dp';
      const n = Math.round(+req.body.nominal);
      if (!(n >= 1 && n <= sisa)) throw new HttpError(400, 'Nominal harus antara Rp 1 dan sisa tagihan.');
      await sql.transaction([
        sql`update bookings set bayar = bayar + ${n}::int, klaim = null where id = ${b.id}`,
        sql`insert into payments(booking_id, jenis, nominal) values(${b.id}, ${jenis}, ${n}::int)`,
      ]);
      return res.json({ ok: true });
    }

    if (action === 'reschedule') { // admin: cek bentrok otomatis lewat primary key slots
      const { date } = req.body, court = +req.body.court, start = +req.body.start;
      checkSlot(date, court, start, b.dur);
      try {
        await sql.transaction([
          sql`delete from slots where booking_id = ${b.id}`,
          slotRows(sql, b.id, date, court, start, b.dur),
          sql`update bookings set tgl = ${date}::date, court = ${court}::int, mulai = ${start}::int where id = ${b.id}`,
        ]);
      } catch (e) {
        if (isConflict(e)) throw new HttpError(409, 'Waktu pengganti bentrok / ditutup. Pilih waktu lain.');
        throw e;
      }
      return res.json({ ok: true });
    }

    if (action === 'cancel') {
      await sql.transaction([
        sql`delete from slots where booking_id = ${b.id}`,
        sql`update bookings set status = 'Batal', klaim = null where id = ${b.id}`,
      ]);
      return res.json({ ok: true });
    }

    throw new HttpError(400, 'Aksi tidak dikenal.');
  }

  throw new HttpError(405, 'Metode tidak didukung.');
});
