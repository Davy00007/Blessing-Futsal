/* ===== Frontend Blessing Futsal =====
   Semua data (booking, akun, jadwal, profil) disimpan di database lewat endpoint /api (folder api/).
   Browser hanya menyimpan token login. */
const HOURS=[...Array(15)].map((_,i)=>8+i); // 08:00 - 22:00 (jam mulai)
const COURTS=[1,2,3];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const hh=h=>String(h).padStart(2,'0')+':00';
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const fmtD=d=>new Date(d+'T00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function ld(k,def){try{const v=localStorage.getItem(k);return v?JSON.parse(v):def}catch(e){return def}}
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
const SESS=ld('bf_session',{});
let S={
  profile:{nama:'Blessing Futsal Purwakarta',alamat:'Purwakarta, Jawa Barat',wa:'',buka:'08.00 - 23.00 WIB',harga:100000,rek:'DANA +62 898-6422-425',desk:''},
  bookings:[],av:{},token:SESS.token||null,user:SESS.role==='pelanggan'?SESS.user:null,admin:SESS.role==='admin',
  authMode:'login',role:'pelanggan',page:'home',pre:{},adminTab:'booking',jd:today(),q:'',busy:false
};
const save=()=>sv('bf_session',{token:S.token,role:S.admin?'admin':S.user?'pelanggan':null,user:S.user});

/* ===== Komunikasi dengan backend ===== */
async function api(path,opt={}){
  const h={'Content-Type':'application/json'};if(S.token)h.Authorization='Bearer '+S.token;
  let r;try{r=await fetch('/api/'+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined})}
  catch(e){throw new Error('Tidak dapat terhubung ke server.')}
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&S.token){S.token=null;S.user=null;S.admin=false;S.bookings=[];save();render()}
  if(!r.ok)throw new Error(d.error||'Terjadi kesalahan pada server.');
  return d;
}
async function loadProfile(){try{S.profile=await api('profile')}catch(e){}}
async function loadBookings(){if(!S.token)return;try{S.bookings=(await api('bookings')).bookings}catch(e){}}
async function loadAv(d){try{S.av[d]=(await api('availability?date='+d)).slots}catch(e){S.av[d]=[]}}
function need(){ // ambil jadwal tanggal yang sedang ditampilkan dari database
  const d=S.page==='home'?today():(S.page==='jadwal'||(S.page==='admin'&&S.adminTab==='jadwal'))?S.jd:null;
  if(d&&S.av[d]===undefined){S.av[d]=null;loadAv(d).then(render)}
}
const lbl=s=>s==='free'?'Kosong':s==='full'?'Terisi':s==='ld'?'...':'Tutup';

/* ===== Logika inti ===== */
// FR-4 & FR-9: cek ketersediaan sebelum simpan / ubah jadwal
function cellState(date,court,h){
  const a=S.av[date];if(!a)return 'ld';
  const x=a.find(v=>v.court===court&&v.hour===h);
  return x?(x.blocked?'blk':'full'):'free';
}
const total=b=>b.dur*(b.harga??S.profile.harga);
const payTag=b=>b.status==='Batal'?'Batal':b.bayar>=total(b)?'Lunas':b.bayar>0?'DP':'Belum';
const payLbl={Belum:'Belum Bayar',DP:'DP',Lunas:'Lunas',Batal:'Dibatalkan'};

/* ===== Navigasi ===== */
function go(p,pre){S.page=p;S.pre=pre||{};render();scrollTo(0,0);if(S.token&&(p==='riwayat'||p==='admin'))loadBookings().then(render)}
function render(){
  if(S.admin)S.page='admin';
  $('who').innerHTML=S.admin?'<span>Admin</span><a onclick="logout()">KELUAR</a>':S.user?'<span class="lnk">'+esc(S.user.nama)+'</span><a onclick="logout()">KELUAR</a>':'<a onclick="S.authMode=\'login\';S.role=\'pelanggan\';go(\'auth\')">⇥ MASUK</a><button class="sm" onclick="S.authMode=\'daftar\';go(\'auth\')">DAFTAR</button>';
  const items=S.admin?[['admin','📊','Dashboard Admin']]:[['home','🏠','Beranda'],['jadwal','📅','Jadwal'],['booking','📝','Booking'],['riwayat','🧾','Pesanan']];
  $('tnav').innerHTML=items.map(i=>`<a class="${S.page===i[0]?'on':''}" onclick="go('${i[0]}')">${i[2]==='Jadwal'?'Cari Lapangan':i[2]==='Pesanan'?'Pesanan Saya':i[2]==='Admin'?'Untuk Admin':i[2]}</a>`).join('');
  $('nav').innerHTML=items.map(i=>`<a class="${S.page===i[0]?'on':''}" onclick="go('${i[0]}')"><b>${i[1]}</b>${i[2]}</a>`).join('');
  $('app').innerHTML=({home,profil,jadwal,booking,riwayat,admin,auth:loginForm})[S.page]();
  need();
}
function logout(){S.token=null;S.user=null;S.admin=false;S.bookings=[];save();go('home')}
function openM(h){$('mbody').innerHTML=h;$('modal').style.display='flex'}
function closeM(){$('modal').style.display='none'}

/* ===== Beranda / Profil (FR-1) ===== */
function home(){
  const p=S.profile,t=today(),nowH=new Date().getHours();
  const free=c=>HOURS.filter(h=>h>nowH&&cellState(t,c,h)==='free').length;
  return `<div class="chip"><span class="dot"></span>${COURTS.length} LAPANGAN TERDAFTAR</div>
  <h1 class="big">MAIN FUTSAL <span class="ul">GAK PAKE RIBET.</span></h1>
  <p class="sub">Pilih jam, kirim booking, langsung main tanpa antre chat WhatsApp. Cek lapangan futsal ${esc(p.nama)} yang kosong hari ini.</p>
  <div class="feats"><span>⚡ Jadwal terkini</span><span>🏷️ Harga transparan</span><span>✅ Dikonfirmasi admin</span></div>
  <div class="two"><div class="card"><h2>LAPANGAN REKOMENDASI</h2><p class="muted" style="margin-bottom:12px">Pilih lapangan favoritmu dan booking langsung tanpa antre.</p>
  ${COURTS.map(c=>{const f=free(c);return `<div class="vi" onclick="go('booking',{date:'${t}',court:${c}})"><div class="vimg"><b>LAPANGAN</b></div><div style="flex:1"><h4>Lapangan ${c}</h4><div class="muted">📍 ${esc(p.alamat.split('(')[0])}</div><div class="ft"><span>Mulai ${rp(p.harga)}/jam</span><span class="${f||!S.av[t]?'ok2':'no2'}">${!S.av[t]?'...':f?'TERSEDIA':'PENUH'}</span></div></div></div>`}).join('')}</div>
  <div class="dark"><div class="chip">● JADWAL HARI INI</div><h3>KETERSEDIAAN HARI INI</h3><div class="mu">${fmtD(t)} | ${esc(p.buka)}</div>
  ${COURTS.map(c=>`<div class="cl">Lapangan ${c} <span style="opacity:.7;font-weight:400">(${free(c)} slot kosong)</span><div class="bar">${HOURS.map(h=>`<i class="${cellState(t,c,h)}" title="${hh(h)}"></i>`).join('')}</div></div>`).join('')}
  <div class="mu">Hijau: kosong, merah: terisi, abu-abu: ditutup. Jam ${hh(HOURS[0])} sampai ${hh(HOURS[HOURS.length-1])}.</div>
  <button onclick="go('jadwal')">Lihat Jadwal Lengkap</button></div></div>
  <div style="margin-top:18px">${profil()}</div>`;
}
function profil(){
  const p=S.profile;
  return `<div class="card"><h2>Profil ${esc(p.nama)}</h2><p>${esc(p.desk)}</p></div>
  <div class="card"><h3>📍 Alamat</h3><p>${esc(p.alamat)}</p>
  <a href="https://www.google.com/maps/search/${encodeURIComponent(p.nama+' '+p.alamat)}" target="_blank" rel="noopener"><button class="s sm" style="margin-top:8px">Buka di Google Maps</button></a></div>
  <div class="card"><h3>🕒 Informasi</h3><p class="muted">Jam operasional</p><p>${esc(p.buka)}</p>
  <p class="muted" style="margin-top:8px">Harga sewa</p><p>${rp(p.harga)} / jam (Lapangan 1, 2, dan 3)</p>
  <p class="muted" style="margin-top:8px">Kontak WhatsApp</p><p>${esc(p.wa)}</p></div>
  <div class="card"><h3>Cara Booking</h3><ol style="padding-left:18px;line-height:1.7;font-size:14px"><li>Daftar atau masuk dengan nomor WhatsApp</li><li>Lihat jadwal kosong</li><li>Isi formulir booking</li><li>Bayar DP atau lunas lewat transfer DANA, unggah bukti transfer, lalu lihat kwitansi di menu Pesanan</li></ol></div>`;
}

/* ===== Jadwal (FR-2) ===== */
function gridHTML(date,clickable){
  let h=`<div class="scroll"><table><tr><th>Jam</th>${COURTS.map(c=>`<th>Lap ${c}</th>`).join('')}</tr>`;
  HOURS.forEach(x=>{h+=`<tr><td>${hh(x)}</td>`+COURTS.map(c=>{const s=cellState(date,c,x);
    return `<td class="${s}" ${s==='free'&&clickable?`onclick="go('booking',{date:'${date}',court:${c},start:${x}})"`:''}>${lbl(s)}</td>`}).join('')+'</tr>'});
  return h+'</table></div>';
}
function jadwal(){
  return `<div class="card"><h2>Jadwal Ketersediaan</h2><label>Tanggal</label><input type="date" value="${S.jd}" min="${today()}" onchange="S.jd=this.value;render()">
  <p class="muted" style="margin:8px 0">${fmtD(S.jd)}. Ketuk sel hijau untuk booking.</p>${gridHTML(S.jd,true)}</div>`;
}

/* ===== Login Pelanggan + Booking (FR-3, FR-4) ===== */
function loginForm(){
  const m=S.authMode,r=S.role,lk=(t,v)=>`<a onclick="S.authMode='${v}';render()" style="color:var(--g);font-weight:700;cursor:pointer">${t}</a>`;
  return `<div class="card" style="max-width:440px;margin:24px auto"><h2>${m==='daftar'?'Daftar Akun Pelanggan':'Masuk'}</h2>
  ${m==='login'?`<div class="tabs"><button class="${r==='pelanggan'?'on':''}" onclick="S.role='pelanggan';render()">Pelanggan</button><button class="${r==='admin'?'on':''}" onclick="S.role='admin';render()">Admin</button></div>`:''}
  ${m==='daftar'?'<label>Nama</label><input id="ln" placeholder="Nama lengkap">':''}
  ${m==='daftar'||r==='pelanggan'?'<label>Nomor WhatsApp</label><input id="lw" type="tel" placeholder="08xxxxxxxxxx">':''}
  <label>Password</label><input id="lp" type="password" placeholder="Password">
  <div id="le"></div><button style="margin-top:12px;width:100%" onclick="doAuth()">${m==='daftar'?'Daftar':'Masuk'}</button>
  <p class="muted" style="margin-top:12px;text-align:center">${m==='login'?'Belum punya akun? '+lk('Daftar','daftar'):'Sudah punya akun? '+lk('Masuk','login')}</p></div>`;
}
async function doAuth(){
  if(S.busy)return;
  const m=S.authMode,r=S.role,err=t=>{$('le').innerHTML='<div class="msg er">'+esc(t)+'</div>'};
  const body=m==='login'&&r==='admin'?{action:'admin',password:$('lp').value}
    :{action:m==='daftar'?'register':'login',nama:m==='daftar'?$('ln').value:undefined,wa:$('lw').value,password:$('lp').value};
  S.busy=true;$('le').innerHTML='<div class="msg ok">Memproses...</div>';
  try{
    const d=await api('auth',{method:'POST',body});
    S.token=d.token;if(d.role==='admin'){S.admin=true;S.user=null}else{S.admin=false;S.user=d.user}
    S.authMode='login';save();await loadBookings();S.page==='auth'&&!S.admin?go('home'):render();
  }catch(e){err(e.message)}finally{S.busy=false}
}
function booking(){
  if(!S.user)return loginForm();
  const p=S.pre,d=p.date||today();
  return `<div class="card"><h2>Formulir Booking</h2>
  <label>Nama pelanggan</label><input id="bn" value="${esc(S.user.nama)}">
  <label>Nomor WhatsApp</label><input id="bw" type="tel" value="${esc(S.user.wa)}">
  <div class="row"><div><label>Tanggal bermain</label><input id="bd" type="date" min="${today()}" value="${d}"></div>
  <div><label>Pilihan lapangan</label><select id="bc">${COURTS.map(c=>`<option value="${c}" ${p.court==c?'selected':''}>Lapangan ${c}</option>`).join('')}</select></div></div>
  <div class="row"><div><label>Jam mulai</label><select id="bs">${HOURS.map(h=>`<option value="${h}" ${p.start==h?'selected':''}>${hh(h)}</option>`).join('')}</select></div>
  <div><label>Durasi</label><select id="bl" onchange="est()">${[1,2,3,4].map(x=>`<option value="${x}">${x} jam</option>`).join('')}</select></div></div>
  <p class="muted" style="margin-top:10px" id="est"></p><div id="be"></div>
  <button style="margin-top:10px;width:100%" onclick="doBook()">Cek & Simpan Booking</button></div>`;
}
function est(){const e=$('est');if(e)e.textContent='Estimasi biaya: '+rp(+$('bl').value*S.profile.harga)}
async function doBook(){
  if(S.busy)return;
  const e=$('be'),date=$('bd').value,court=+$('bc').value,start=+$('bs').value,dur=+$('bl').value,nama=$('bn').value.trim(),wa=$('bw').value.replace(/\D/g,'');
  if(nama.length<2||wa.length<9||!date){e.innerHTML='<div class="msg er">Lengkapi nama, nomor WhatsApp, dan tanggal.</div>';return}
  S.busy=true;e.innerHTML='<div class="msg ok">Memeriksa ketersediaan...</div>';
  try{
    const d=await api('bookings',{method:'POST',body:{date,court,start,dur,nama,wa}}); // server memeriksa ketersediaan sebelum menyimpan
    S.av={};await loadBookings();
    e.innerHTML=`<div class="msg ok">Booking berhasil! Kode: <b>${esc(d.id)}</b>. Lanjutkan pembayaran di menu Pesanan.</div>`;
    setTimeout(()=>{go('riwayat');payC(d.id)},1200);
  }catch(x){e.innerHTML='<div class="msg er">'+esc(x.message)+'</div>'}finally{S.busy=false}
}
setInterval(est,500);

/* ===== Pesanan & Pembayaran Pelanggan ===== */
function riwayat(){
  if(!S.user)return loginForm();
  const l=S.bookings.slice().sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="card"><h2>Pesanan Saya</h2><p class="muted">Transfer ke: ${esc(S.profile.rek)}</p></div>`+
  (l.length?l.map(b=>{const t=payTag(b);return `<div class="item"><div class="top"><div><b>${b.id}</b><div class="muted">${fmtD(b.date)}<br>Lap ${b.court}, ${hh(b.start)} - ${hh(b.start+b.dur)} (${b.dur} jam)</div></div><span class="tag t-${t}">${payLbl[t]}</span></div>
  <p style="margin-top:6px;font-size:14px">Total ${rp(total(b))} | Dibayar ${rp(b.bayar)}</p>
  <div class="row" style="margin-top:8px">${b.status==='Batal'||b.bayar>=total(b)?'':`<button class="sm" onclick="payC('${b.id}')">💳 Bayar</button>`}
  ${b.status!=='Batal'&&b.bayar<total(b)&&b.klaim?`<span class="muted">Konfirmasi ${rp(b.klaim.nominal)} terkirim, menunggu verifikasi admin</span>`:''}
  ${b.bukti>0?`<button class="sm s" onclick="showProof('${b.id}')">Lihat Bukti</button>`:''}
  ${b.bayar>0?`<button class="sm s" onclick="kwitansi('${b.id}')">Lihat Kwitansi</button>`:''}</div></div>`}).join(''):'<div class="card muted">Belum ada pesanan.</div>');
}
function payC(id){
  const b=S.bookings.find(x=>x.id===id),sisa=Math.max(0,total(b)-b.bayar);
  openM(`<h3>Pembayaran ${b.id}</h3><p class="muted">Lap ${b.court}, ${fmtD(b.date)}, ${hh(b.start)} - ${hh(b.start+b.dur)}</p>
  <div class="card" style="margin:10px 0"><div class="row" style="justify-content:space-between"><span>Total</span><b>${rp(total(b))}</b></div>
  <div class="row" style="justify-content:space-between"><span>Sudah dibayar</span><b>${rp(b.bayar)}</b></div>
  <div class="row" style="justify-content:space-between"><span>Sisa tagihan</span><b style="color:var(--r)">${rp(sisa)}</b></div></div>
  <label>Pilihan pembayaran</label><select id="cj" onchange="cj()"><option value="dp">Bayar uang muka (DP) lewat transfer</option><option value="lunas">Bayar lunas lewat transfer</option></select>
  <div id="cf"></div><div id="ce"></div>
  <div class="row" style="margin-top:12px"><button onclick="sendPay('${id}')">Konfirmasi</button><button class="s" onclick="closeM()">Tutup</button></div>`);
  cj(id);
}
function cj(id){
  const j=$('cj').value,bid=id||$('cj').dataset.id;
  if(id)$('cj').dataset.id=id;
  const b=S.bookings.find(x=>x.id===bid),sisa=Math.max(0,total(b)-b.bayar);
  $('cf').innerHTML=`<div class="msg ok">Transfer ke: <b>${esc(S.profile.rek)}</b></div><label>Nominal transfer (Rp)</label><input id="cn" type="number" min="1" max="${sisa}" value="${j==='dp'?Math.round(sisa/2):sisa}">
  <label>Nama pengirim</label><input id="cp" value="${esc(S.user?S.user.nama:'')}">
  <label>Bukti transfer (foto / screenshot)</label><input id="cb" type="file" accept="image/*"><p class="muted" style="margin-top:4px">Wajib diunggah. Gambar otomatis dikecilkan sebelum dikirim.</p>`;
}
async function readImg(file){ // kecilkan gambar (maks 1000px, JPEG) agar ringan disimpan
  return new Promise((ok,no)=>{const r=new FileReader();r.onerror=()=>no(new Error('Gagal membaca gambar.'));
    r.onload=()=>{const im=new Image();im.onerror=()=>no(new Error('File harus berupa gambar.'));
      im.onload=()=>{const k=Math.min(1,1000/Math.max(im.width,im.height)),c=document.createElement('canvas');
        c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.7))};
      im.src=r.result};r.readAsDataURL(file)});
}
async function sendPay(id){
  const f=$('cb').files&&$('cb').files[0],err=t=>{$('ce').innerHTML='<div class="msg er">'+esc(t)+'</div>'};
  if(!f)return err('Unggah bukti transfer terlebih dahulu.');
  if(S.busy)return;S.busy=true;$('ce').innerHTML='<div class="msg ok">Mengunggah bukti transfer...</div>';
  try{
    const bukti=await readImg(f);
    await api('bookings',{method:'PATCH',body:{id,action:'confirm',jenis:$('cj').value,nominal:Math.round(+$('cn').value||0),pengirim:$('cp').value,bukti}});
    closeM();await loadBookings();render();
  }catch(e){err(e.message)}finally{S.busy=false}
}
async function showProof(id){
  openM('<p class="muted">Memuat bukti transfer...</p>');
  try{
    const d=await api('proof?booking='+encodeURIComponent(id));
    openM(`<h3>Bukti Transfer ${esc(id)}</h3>${d.proofs.length?d.proofs.map(x=>`<p class="muted" style="margin:10px 0 4px">Diunggah ${esc(x.at)}</p><img src="${x.data}" alt="Bukti transfer" style="width:100%;border:1px solid var(--b);border-radius:8px">`).join(''):'<p class="muted">Belum ada bukti.</p>'}<button class="s" style="margin-top:12px;width:100%" onclick="closeM()">Tutup</button>`);
  }catch(e){openM('<div class="msg er">'+esc(e.message)+'</div><button class="s" style="margin-top:10px" onclick="closeM()">Tutup</button>')}
}
/* ===== Kwitansi (FR-8) ===== */
function kwitansi(id){
  const b=S.bookings.find(x=>x.id===id);if(!b)return;const t=payTag(b);
  openM(`<div class="kw"><h3>KWITANSI PEMBAYARAN</h3><p style="text-align:center;font-size:12px;margin-bottom:8px">${esc(S.profile.nama)}</p>
  <table><tr><td>No. Booking</td><td>: ${b.id}</td></tr><tr><td>Nama</td><td>: ${esc(b.nama)}</td></tr><tr><td>Tanggal main</td><td>: ${fmtD(b.date)}</td></tr>
  <tr><td>Lapangan</td><td>: ${b.court}, ${hh(b.start)} - ${hh(b.start+b.dur)}</td></tr><tr><td>Total biaya</td><td>: ${rp(total(b))}</td></tr>
  <tr><td>Telah dibayar</td><td>: <b>${rp(b.bayar)}</b></td></tr><tr><td>Sisa</td><td>: ${rp(Math.max(0,total(b)-b.bayar))}</td></tr><tr><td>Status</td><td>: ${payLbl[t]}</td></tr>
  <tr><td>Dicetak</td><td>: ${new Date().toLocaleString('id-ID')}</td></tr></table></div>
  <div class="row" style="margin-top:10px"><button onclick="print()">Cetak</button><button class="s" onclick="closeM()">Tutup</button></div>`);
}

/* ===== Admin (FR-5,6,7,9,10) ===== */
function admin(){
  if(!S.admin){S.role='admin';S.authMode='login';return loginForm()}
  const T=[['booking','Data Booking'],['jadwal','Jadwal Lapangan'],['profil','Profil']];
  const t=today(),ak=S.bookings.filter(b=>b.status!=='Batal'),rev=ak.reduce((x,b)=>x+b.bayar,0);
  const st=[['Booking hari ini',ak.filter(b=>b.date===t).length],['Belum lunas',ak.filter(b=>b.bayar<total(b)).length],['Menunggu verifikasi',ak.filter(b=>b.klaim&&b.bayar<total(b)).length],['Pemasukan tercatat',rp(rev)]];
  return `<h1 class="big" style="font-size:clamp(26px,5vw,40px);letter-spacing:-1.5px;margin:18px 0 12px">DASHBOARD ADMIN</h1>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">${st.map(x=>`<div class="card" style="margin:0"><div class="muted">${x[0]}</div><div style="font-size:22px;font-weight:800;color:var(--g)">${x[1]}</div></div>`).join('')}</div>
  <div class="tabs">${T.map(t=>`<button class="${S.adminTab===t[0]?'on':''}" onclick="S.adminTab='${t[0]}';render()">${t[1]}</button>`).join('')}</div>`+({booking:aBooking,jadwal:aJadwal,profil:aProfil})[S.adminTab]();
}
function aBooking(){
  const q=S.q.toLowerCase();
  const l=S.bookings.filter(b=>!q||(b.nama+b.id+b.wa+b.date).toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)||a.start-b.start);
  const rev=S.bookings.filter(b=>b.status!=='Batal').reduce((s,b)=>s+b.bayar,0);
  return `<div class="card"><h2>Data Booking</h2><p class="muted">Total booking: ${S.bookings.length} | Pemasukan tercatat: ${rp(rev)}</p>
  <input placeholder="Cari nama / kode / WA / tanggal" value="${esc(S.q)}" oninput="S.q=this.value;aList()" style="margin-top:8px"></div><div id="alist">${aItems(l)}</div>`;
}
function aList(){const q=S.q.toLowerCase();$('alist').innerHTML=aItems(S.bookings.filter(b=>!q||(b.nama+b.id+b.wa+b.date).toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)||a.start-b.start))}
function aItems(l){
  return l.length?l.map(b=>{const t=payTag(b);return `<div class="item"><div class="top"><div><b>${esc(b.nama)}</b> <span class="muted">${b.id}</span><div class="muted">WA ${esc(b.wa)}<br>${fmtD(b.date)}<br>Lap ${b.court}, ${hh(b.start)} - ${hh(b.start+b.dur)}</div></div><span class="tag t-${t}">${payLbl[t]}</span></div>
  <p style="margin-top:6px;font-size:14px">Total ${rp(total(b))} | Dibayar ${rp(b.bayar)} ${b.klaim&&b.bayar<total(b)?`<span class="tag t-DP">Pelanggan konfirmasi ${rp(b.klaim.nominal)}${b.klaim.pengirim?' dari '+esc(b.klaim.pengirim):''}</span>`:''}</p>
  ${b.status==='Batal'?'':`<div class="row" style="margin-top:8px"><button class="sm" onclick="payForm('${b.id}')">Catat Bayar</button><button class="sm s" onclick="reForm('${b.id}')">Ubah Jadwal</button><button class="sm s" onclick="kwitansi('${b.id}')" ${b.bayar?'':'disabled style="opacity:.4"'}>Kwitansi</button>${b.bukti>0?`<button class="sm s" onclick="showProof('${b.id}')">Lihat Bukti</button>`:''}<button class="sm d" onclick="cancelB('${b.id}')">Batalkan</button></div>`}</div>`}).join(''):'<div class="card muted">Belum ada data booking.</div>';
}
function payForm(id){
  const b=S.bookings.find(x=>x.id===id);
  openM(`<h3>Catat Pembayaran ${b.id}</h3><p class="muted">Total ${rp(total(b))}, sudah dibayar ${rp(b.bayar)}</p>
  <label>Jenis</label><select id="pj"><option value="dp">Uang muka (DP)</option><option value="lunas">Pelunasan</option></select>
  <label>Nominal (Rp)</label><input id="pn" type="number" min="0" value="${b.klaim?b.klaim.nominal:Math.max(0,total(b)-b.bayar)}">
  <div class="row" style="margin-top:12px"><button onclick="doPay('${id}')">Simpan & Buat Kwitansi</button><button class="s" onclick="closeM()">Batal</button></div>`);
}
async function doPay(id){
  const n=Math.round(+$('pn').value||0);if(n<1)return;
  try{
    await api('bookings',{method:'PATCH',body:{id,action:'pay',jenis:$('pj').value,nominal:n}});
    closeM();await loadBookings();render();kwitansi(id); // include: Mencetak Kwitansi
  }catch(e){alert(e.message)}
}
function reForm(id){
  const b=S.bookings.find(x=>x.id===id);
  openM(`<h3>Ubah Jadwal ${b.id}</h3><p class="muted">${esc(b.nama)}, durasi ${b.dur} jam</p>
  <label>Tanggal baru</label><input id="rd" type="date" min="${today()}" value="${b.date}">
  <div class="row"><div><label>Lapangan</label><select id="rc">${COURTS.map(c=>`<option value="${c}" ${b.court==c?'selected':''}>Lap ${c}</option>`).join('')}</select></div>
  <div><label>Jam mulai</label><select id="rs">${HOURS.map(h=>`<option value="${h}" ${b.start==h?'selected':''}>${hh(h)}</option>`).join('')}</select></div></div><div id="re"></div>
  <div class="row" style="margin-top:12px"><button onclick="doRe('${id}')">Periksa & Simpan</button><button class="s" onclick="closeM()">Batal</button></div>`);
}
async function doRe(id){
  try{
    await api('bookings',{method:'PATCH',body:{id,action:'reschedule',date:$('rd').value,court:+$('rc').value,start:+$('rs').value}});
    S.av={};closeM();await loadBookings();render();
  }catch(e){$('re').innerHTML='<div class="msg er">'+esc(e.message)+'</div>'}
}
async function cancelB(id){
  if(!confirm('Batalkan booking ini?'))return;
  try{await api('bookings',{method:'PATCH',body:{id,action:'cancel'}});S.av={};await loadBookings();render()}catch(e){alert(e.message)}
}
function aJadwal(){
  return `<div class="card"><h2>Kelola Jadwal Lapangan</h2><label>Tanggal</label><input type="date" value="${S.jd}" onchange="S.jd=this.value;render()">
  <p class="muted" style="margin:8px 0">Ketuk sel kosong untuk menutup (maintenance/acara), ketuk sel abu-abu untuk membuka lagi.</p>
  <div class="scroll"><table><tr><th>Jam</th>${COURTS.map(c=>`<th>Lap ${c}</th>`).join('')}</tr>${HOURS.map(h=>`<tr><td>${hh(h)}</td>${COURTS.map(c=>{const s=cellState(S.jd,c,h);
    return `<td class="${s}" ${s==='full'||s==='ld'?'':`onclick="tog(${c},${h})"`}>${lbl(s)}</td>`}).join('')}</tr>`).join('')}</table></div></div>`;
}
async function tog(c,h){
  try{await api('availability',{method:'POST',body:{date:S.jd,court:c,hour:h}});await loadAv(S.jd);render()}catch(e){alert(e.message)}
}
function aProfil(){
  const p=S.profile;
  return `<div class="card"><h2>Kelola Profil Blessing Futsal</h2>
  ${[['nama','Nama tempat'],['alamat','Alamat lokasi'],['wa','Nomor WhatsApp'],['buka','Jam operasional'],['rek','Rekening pembayaran'],['desk','Deskripsi']].map(f=>`<label>${f[1]}</label><input id="pf_${f[0]}" value="${esc(p[f[0]])}">`).join('')}
  <label>Harga per jam (Rp)</label><input id="pf_harga" type="number" value="${p.harga}">
  <button style="margin-top:12px;width:100%" onclick="saveProf()">Simpan Profil</button></div>`;
}
async function saveProf(){
  const b={harga:+$('pf_harga').value};['nama','alamat','wa','buka','rek','desk'].forEach(k=>b[k]=$('pf_'+k).value);
  try{S.profile=await api('profile',{method:'PUT',body:b});alert('Profil tersimpan');render()}catch(e){alert(e.message)}
}
async function init(){render();await loadProfile();if(S.token)await loadBookings();render()}
init();
