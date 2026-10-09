// Viktresan Admin – admin.viktresan.online
// Samma Firebase som appen. Säkerheten sköts av Firestore-reglerna: bara den som finns i "admins" kan ändra något här.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, serverTimestamp, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyCsiVgbTHXX-SUDGNXGP09RfXOdFTOVP3Q',
  authDomain: 'viktresan-25170.firebaseapp.com',
  projectId: 'viktresan-25170',
  appId: '1:852549237443:web:f766b8249e6ec340f30076'
});
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById('app');

// ---------- Hjälpare ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = (n) => (n == null || isNaN(n) ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const MON = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const dShort = (d) => (d ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : '–');
const toD = (x) => (x?.toDate ? x.toDate() : x ? new Date(x) : null);
let toastT;
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
function errText(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Fel e-post eller lösenord.';
  if (c.includes('permission-denied')) return 'Ingen behörighet. Är reglerna publicerade?';
  if (c.includes('too-many-requests')) return 'För många försök. Vänta en stund.';
  return 'Något gick fel. (' + (c || e?.message || '') + ')';
}
function modal(html) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: bg.querySelector('.modal'), close };
}
function confirmBox(title, text, ok = 'Ta bort') {
  return new Promise((res) => {
    const m = modal(`<h2>${esc(title)}</h2>${text ? `<p class="muted">${esc(text)}</p>` : ''}<div class="row" style="justify-content:flex-end"><button class="btn" data-no>Avbryt</button><button class="btn danger" data-yes>${esc(ok)}</button></div>`);
    m.el.querySelector('[data-no]').onclick = () => { m.close(); res(false); };
    m.el.querySelector('[data-yes]').onclick = () => { m.close(); res(true); };
  });
}
async function busy(btn, fn) { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } }

// ---------- Inloggning ----------
function loginView(msg = '') {
  root.innerHTML = `<div class="login stack" style="gap:16px">
    <div class="row"><img src="favicon.png" alt="" width="48" height="48" style="border-radius:14px"><div><h1>Viktresan Admin</h1><span class="muted small">Bara för administratörer</span></div></div>
    <form class="card stack" novalidate>
      <div class="field"><label for="em">E-post</label><input class="input" id="em" type="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">Lösenord</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      <p class="error ${msg ? '' : 'hidden'}" role="alert">${esc(msg)}</p>
      <button class="btn primary" type="submit" style="height:48px">Logga in</button>
      <button class="btn" type="button" data-forgot>Glömt lösenord?</button>
    </form>
    <p class="small muted">Samma e-post och lösenord som i appen.</p></div>`;
  const f = root.querySelector('form');
  const err = f.querySelector('.error');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await busy(f.querySelector('[type=submit]'), async () => {
      try { await signInWithEmailAndPassword(auth, f.em.value.trim(), f.pw.value); } catch (ex) { err.textContent = errText(ex); err.classList.remove('hidden'); }
    });
  });
  f.querySelector('[data-forgot]').addEventListener('click', async () => {
    if (!f.em.value.trim()) { err.textContent = 'Skriv din e-post först.'; err.classList.remove('hidden'); return; }
    try { await sendPasswordResetEmail(auth, f.em.value.trim()); toast('Kolla din e-post (och skräpposten).'); } catch (ex) { err.textContent = errText(ex); err.classList.remove('hidden'); }
  });
}

// ---------- Ramen med meny ----------
const PAGES = [
  ['', '📊', 'Översikt', overviewPage],
  ['lankar', '🔗', 'Reklamlänkar', linksPage],
  ['nyheter', '📣', 'Nyheter', newsPage],
  ['varor', '🥫', 'Varor', foodsPage],
  ['inlagg', '💬', 'Offentliga inlägg', postsPage]
];

async function route() {
  const user = auth.currentUser;
  if (!user) return loginView();
  let isAdmin = false, err = '';
  try { isAdmin = (await getDoc(doc(db, 'admins', user.uid))).exists(); } catch (e) { err = errText(e); }
  if (!isAdmin) {
    root.innerHTML = `<div class="login stack"><h1>Ingen behörighet</h1>
      <div class="card stack"><p>Kontot <b>${esc(user.email)}</b> är inte admin.</p>${err ? `<p class="error">${esc(err)}</p>` : ''}
      <p class="small muted">Ditt användar-id: <code>${esc(user.uid)}</code></p><button class="btn" data-out>Logga ut</button></div></div>`;
    root.querySelector('[data-out]').onclick = () => signOut(auth);
    return;
  }
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  const page = PAGES.find((p) => p[0] === key) || PAGES[0];
  root.innerHTML = `<div class="layout">
    <aside class="side">
      <div class="brand"><img src="favicon.png" alt=""><div>Viktresan<small>Admin</small></div></div>
      <nav class="nav">${PAGES.map(([k, ic, l]) => `<a href="#/${k}" ${k === page[0] ? 'aria-current="page"' : ''}><span class="ico">${ic}</span>${l}</a>`).join('')}</nav>
      <div class="foot"><span class="hide-m">${esc(user.email)}</span><a href="https://viktresan.online" target="_blank" rel="noopener">Öppna appen ↗</a><a href="#" data-out>Logga ut</a></div>
    </aside>
    <main class="main" id="main"><div class="boot">Laddar…</div></main></div>`;
  root.querySelector('[data-out]').onclick = (e) => { e.preventDefault(); signOut(auth); };
  const main = document.getElementById('main');
  try { await page[3](main); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><p class="error">${esc(errText(e))}</p></div>`; }
}
window.addEventListener('hashchange', route);
onAuthStateChanged(auth, () => route());

// ---------- Översikt ----------
const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };

function barChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const W = 640, H = 170, bw = W / weeks.length;
  return `<svg viewBox="0 0 ${W} ${H + 22}" style="width:100%;height:auto" role="img" aria-label="Nya användare per vecka">
    ${weeks.map((w, i) => { const h = Math.round((w.n / max) * (H - 18)); return `
      <rect x="${i * bw + 6}" y="${H - h}" width="${bw - 12}" height="${Math.max(h, 2)}" rx="5" fill="${i === weeks.length - 1 ? '#7B5EA7' : '#CDBFE3'}"/>
      ${w.n ? `<text x="${i * bw + bw / 2}" y="${H - h - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="#3E2A5C">${w.n}</text>` : ''}
      <text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle" font-size="11" fill="#63675F">v${w.label}</text>`; }).join('')}
  </svg>`;
}

async function safeCount(q) { try { return (await getCountFromServer(q)).data().count; } catch { return null; } }

async function overviewPage(main) {
  const [statsS, membersS, clicksS, foods, posts, anns] = await Promise.all([
    getDoc(doc(db, 'stats', 'users')).catch(() => null),
    getDocs(collection(db, 'stats', 'users', 'members')).catch(() => null),
    getDocs(collection(db, 'tipClicks')).catch(() => null),
    safeCount(collection(db, 'foods')),
    safeCount(query(collection(db, 'posts'), where('public', '==', true))),
    getDocs(collection(db, 'announcements')).catch(() => null)
  ]);
  const total = statsS?.exists() ? statsS.data().count : 0;
  const members = membersS ? membersS.docs.map((d) => toD(d.data().at)).filter(Boolean) : [];
  const now = Date.now();
  const n7 = members.filter((d) => now - d < 7 * 864e5).length;
  const n30 = members.filter((d) => now - d < 30 * 864e5).length;
  const w0 = weekStart(new Date());
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = new Date(w0.getTime() - (11 - i) * 7 * 864e5); return { s, label: isoWeek(s), n: 0 }; });
  members.forEach((d) => { const i = weeks.findIndex((w, j) => d >= w.s && (j === 11 || d < weeks[j + 1].s)); if (i >= 0) weeks[i].n++; });
  const clicks = clicksS ? clicksS.docs.map((d) => [d.id, d.data().count || 0]).sort((a, b) => b[1] - a[1]) : [];
  const totalClicks = clicks.reduce((a, b) => a + b[1], 0);
  const tips = await loadTips();
  const tipName = (id) => tips.find((t) => t.id === id)?.title || id;
  const activeAnn = anns ? anns.docs.filter((d) => d.data().active).length : 0;

  main.innerHTML = `
    <div class="between"><div><h1>Översikt</h1><span class="muted">${dShort(new Date())}</span></div></div>
    <div class="grid g4">
      ${[['Användare totalt', total, 'Alla konton i appen'], ['Nya senaste 7 dagarna', members.length ? n7 : '–', ''], ['Nya senaste 30 dagarna', members.length ? n30 : '–', ''], ['Klick på reklamlänkar', totalClicks, 'Totalt']]
        .map(([l, v, s]) => `<div class="card kpi"><div class="lbl">${l}</div><div class="val num">${v ?? '–'}</div><div class="sub">${s}</div></div>`).join('')}
    </div>
    <div class="card stack"><div class="between"><h2>Nya användare per vecka</h2><span class="small muted">Räknas från 3 okt 2026</span></div>${barChart(weeks)}</div>
    <div class="grid g2">
      <div class="card stack"><h2>Mest klickade länkar</h2>
        ${clicks.length ? `<table>${clicks.slice(0, 6).map(([id, n]) => `<tr><td>${esc(tipName(id))}</td><td class="r num"><b>${n}</b></td></tr>`).join('')}</table>` : '<p class="muted">Inga klick än.</p>'}
        <a class="btn outline sm" href="#/lankar" style="align-self:flex-start">Hantera länkar</a></div>
      <div class="card stack"><h2>Innehåll</h2>
        <table>
          <tr><td>Varor som användare lagt till</td><td class="r num"><b>${foods ?? '–'}</b></td></tr>
          <tr><td>Offentliga inlägg</td><td class="r num"><b>${posts ?? '–'}</b></td></tr>
          <tr><td>Aktiva nyheter</td><td class="r num"><b>${activeAnn}</b></td></tr>
        </table></div>
    </div>
    <p class="small muted">Bara antal. Adminsidan visar aldrig vilka som har konto eller deras hälsouppgifter.</p>`;
}

// ---------- Reklamlänkar ----------
const TIP_CATS = [['mata', 'Mäta'], ['trana', 'Träna'], ['ata', 'Äta och dricka']];
const DEFAULT_TIPS = [
  { id: 'vag', cat: 'mata', title: 'Personvåg', why: 'Väg dig samma tid varje vecka, gärna på morgonen. En enkel digital våg räcker gott.' },
  { id: 'kroppsvag', cat: 'mata', title: 'Våg som mäter fett och muskler', why: 'Bra om du vill se mer än bara kilon. Siffrorna är ungefärliga, men visar hur det går över tid.' },
  { id: 'mattband', cat: 'mata', title: 'Måttband för kroppen', why: 'Midjan kan minska fast vikten står still. Ett mjukt måttband gör det lätt att mäta själv.' },
  { id: 'koksvag', cat: 'mata', title: 'Köksvåg', why: 'Gör det mycket lättare att räkna kalorier rätt. Väg maten några gånger, sedan lär du dig ögonmåttet.' },
  { id: 'skor', cat: 'trana', title: 'Bra promenadskor', why: 'Promenader är den enklaste träningen. Sköna skor gör att du orkar gå längre.' },
  { id: 'klocka', cat: 'trana', title: 'Aktivitetsklocka', why: 'Räknar steg och kalorier. Skriv in siffran under Träning, så får du äta lite mer.' },
  { id: 'gummiband', cat: 'trana', title: 'Träningsband', why: 'Styrketräning hemma utan gym. Billigt, tar ingen plats och passar alla nivåer.' },
  { id: 'flaska', cat: 'ata', title: 'Vattenflaska', why: 'Lättare att dricka tillräckligt när flaskan alltid står framme.' },
  { id: 'matlador', cat: 'ata', title: 'Matlådor', why: 'Laga mat i förväg, så blir det lättare att äta bra även stressiga dagar.' },
  { id: 'matkasse', cat: 'ata', title: 'Matkasse', why: 'Färdiga recept och rätt mängd råvaror hem till dörren. Många har kalorisnåla alternativ.' }
];
const validUrl = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim());

async function loadTips() {
  const s = await getDocs(collection(db, 'tips')).catch(() => ({ docs: [] }));
  const saved = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
  const merged = DEFAULT_TIPS.map((t) => ({ store: '', url: '', visible: true, ...t, ...(saved[t.id] || {}), id: t.id }));
  const extra = s.docs.filter((d) => !DEFAULT_TIPS.some((t) => t.id === d.id)).map((d) => ({ visible: true, ...d.data(), id: d.id }))
    .sort((a, b) => (toD(a.created) || 0) - (toD(b.created) || 0));
  return [...merged, ...extra].filter((t) => !t.deleted);
}

async function linksPage(main) {
  const [tips, clicksS] = await Promise.all([loadTips(), getDocs(collection(db, 'tipClicks')).catch(() => null)]);
  const clicks = Object.fromEntries(clicksS ? clicksS.docs.map((d) => [d.id, d.data().count || 0]) : []);
  const cat = (k) => (TIP_CATS.find((c) => c[0] === k) || [, 'Övrigt'])[1];
  main.innerHTML = `
    <div class="between"><div><h1>Reklamlänkar</h1><span class="muted">Visas under Tips och prylar i appen, märkta "Reklamlänk".</span></div>
      <button class="btn primary" data-new>+ Ny länk</button></div>
    <div class="card flush"><table>
      <thead><tr><th>Rubrik</th><th class="hide-m">Kategori</th><th class="hide-m">Butik</th><th class="r">Klick</th><th>Status</th></tr></thead>
      <tbody>${tips.map((t) => `<tr class="click" data-id="${esc(t.id)}"><td><b>${esc(t.title)}</b><div class="small muted">${esc((t.why || '').slice(0, 70))}${(t.why || '').length > 70 ? '…' : ''}</div></td>
        <td class="hide-m">${esc(cat(t.cat))}</td><td class="hide-m">${esc(t.store || '–')}</td><td class="r num">${clicks[t.id] || 0}</td>
        <td>${!t.url ? '<span class="chip off">Länk saknas</span>' : t.visible === false ? '<span class="chip off">Dold</span>' : '<span class="chip good">Visas</span>'}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">Klistra in länken från Adtraction, Awin eller Partner-ads. Den måste börja med https://. Inga bantningspiller eller produkter som lovar snabb viktnedgång.</p>`;
  const edit = (t) => {
    const x = t || { cat: 'mata', title: '', why: '', store: '', url: '', visible: true };
    const m = modal(`
      <h2>${t ? 'Ändra reklamlänk' : 'Ny reklamlänk'}</h2>
      <div class="field"><label>Rubrik</label><input class="input" id="tt" maxlength="60" value="${esc(x.title)}"></div>
      <div class="field"><label>Kategori</label><select class="input" id="tc">${TIP_CATS.map(([k, l]) => `<option value="${k}" ${k === x.cat ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Varför är den bra?</label><textarea class="input" id="tw" maxlength="200">${esc(x.why)}</textarea></div>
      <div class="field"><label>Butik (valfritt)</label><input class="input" id="ts" maxlength="40" value="${esc(x.store)}"></div>
      <div class="field"><label>Länk</label><input class="input" id="tu" value="${esc(x.url)}" placeholder="https://..."></div>
      <label class="check"><input type="checkbox" id="tv" ${x.visible !== false ? 'checked' : ''}> Visa för användarna</label>
      <p class="error hidden"></p>
      <div class="row" style="justify-content:space-between">${t ? '<button class="btn danger" data-del>Ta bort</button>' : '<span></span>'}
        <div class="row"><button class="btn" data-close>Avbryt</button><button class="btn primary" data-save>Spara</button></div></div>`);
    const v = (id) => m.el.querySelector('#' + id).value.trim();
    const err = m.el.querySelector('.error');
    m.el.querySelector('[data-save]').onclick = async (e) => {
      if (!v('tt')) { err.textContent = 'Skriv en rubrik.'; err.classList.remove('hidden'); return; }
      if (v('tu') && !validUrl(v('tu'))) { err.textContent = 'Länken måste börja med https://'; err.classList.remove('hidden'); return; }
      await busy(e.currentTarget, async () => {
        const id = t?.id || 't' + Date.now().toString(36);
        const data = { cat: v('tc'), title: v('tt'), why: v('tw'), store: v('ts'), url: v('tu'), visible: m.el.querySelector('#tv').checked, deleted: false, updated: serverTimestamp() };
        if (!t) data.created = serverTimestamp();
        try { await setDoc(doc(db, 'tips', id), data, { merge: true }); m.close(); toast('Sparat.'); linksPage(main); } catch (ex) { err.textContent = errText(ex); err.classList.remove('hidden'); }
      });
    };
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmBox('Ta bort länken?'))) return;
      try { await setDoc(doc(db, 'tips', t.id), { deleted: true, updated: serverTimestamp() }, { merge: true }); m.close(); toast('Borttagen.'); linksPage(main); } catch (ex) { toast(errText(ex)); }
    });
  };
  main.querySelector('[data-new]').onclick = () => edit(null);
  main.querySelectorAll('tr[data-id]').forEach((r) => (r.onclick = () => edit(tips.find((t) => t.id === r.dataset.id))));
}

// ---------- Nyheter ----------
const GOTO = [['', 'Ingen knapp'], ['/', 'Översikt'], ['/kost', 'Kost'], ['/kost/traning', 'Träning'], ['/blodvarden', 'Blodvärden'], ['/rapport', 'Rapport till vården'],
  ['/utmaningar', 'Utmaningar'], ['/marken', 'Mina märken'], ['/tips', 'Tips och prylar'], ['/flode', 'Flöde'], ['/profil', 'Profil']];

async function newsPage(main) {
  const s = await getDocs(collection(db, 'announcements'));
  const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toD(b.created) || 0) - (toD(a.created) || 0));
  main.innerHTML = `
    <div class="between"><div><h1>Nyheter</h1><span class="muted">Visas som en NYHET-ruta i appen, en gång per användare.</span></div>
      <button class="btn primary" data-new>+ Ny nyhet</button></div>
    ${list.length ? `<div class="card flush"><table>
      <thead><tr><th>Rubrik</th><th class="hide-m">Skapad</th><th>Status</th></tr></thead>
      <tbody>${list.map((n) => `<tr class="click" data-id="${n.id}"><td><b>${esc(n.title)}</b><div class="small muted">${esc((n.rows || []).join(' · ').slice(0, 90))}</div></td>
        <td class="hide-m">${dShort(toD(n.created))}</td><td>${n.active ? '<span class="chip good">Visas</span>' : '<span class="chip off">Av</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Inga nyheter än. Skriv en, så får alla användare se den nästa gång de öppnar appen.</div>'}`;
  const edit = (n) => {
    const x = n || { title: '', rows: ['', '', ''], note: '', go: '', active: true };
    const rows = [...(x.rows || []), '', '', '', ''].slice(0, 4);
    const m = modal(`
      <h2>${n ? 'Ändra nyhet' : 'Ny nyhet'}</h2>
      <div class="field"><label>Rubrik</label><input class="input" id="nt" maxlength="60" value="${esc(x.title)}" placeholder="t.ex. Nu kan du …"></div>
      <div class="field"><label>Punkter (1–4 korta rader)</label>${rows.map((r, i) => `<input class="input" data-r="${i}" maxlength="90" value="${esc(r)}" style="margin-bottom:6px">`).join('')}</div>
      <div class="field"><label>Liten text längst ner (valfritt)</label><input class="input" id="nn" maxlength="120" value="${esc(x.note)}"></div>
      <div class="field"><label>Knappen "Testa nu" leder till</label><select class="input" id="ng">${GOTO.map(([k, l]) => `<option value="${k}" ${k === (x.go || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="na" ${x.active ? 'checked' : ''}> Visa i appen</label>
      <div class="preview" data-prev></div>
      <p class="error hidden"></p>
      <div class="row" style="justify-content:space-between">${n ? '<button class="btn danger" data-del>Ta bort</button>' : '<span></span>'}
        <div class="row"><button class="btn" data-close>Avbryt</button><button class="btn primary" data-save>Spara</button></div></div>`);
    const read = () => ({ title: m.el.querySelector('#nt').value.trim(), rows: [...m.el.querySelectorAll('[data-r]')].map((i) => i.value.trim()).filter(Boolean),
      note: m.el.querySelector('#nn').value.trim(), go: m.el.querySelector('#ng').value, active: m.el.querySelector('#na').checked });
    const prev = () => { const d = read(); m.el.querySelector('[data-prev]').innerHTML = `<span class="small muted">Förhandsvisning</span><span class="news-chip">✨ NYHET</span>
      <b style="font-size:20px">${esc(d.title || 'Rubrik')}</b>${d.rows.map((r) => `<div class="row" style="gap:8px">✨ <span>${esc(r)}</span></div>`).join('')}
      ${d.note ? `<span class="small muted">${esc(d.note)}</span>` : ''}${d.go ? '<span class="btn primary sm" style="align-self:flex-start">Testa nu</span>' : ''}`; };
    m.el.addEventListener('input', prev); m.el.addEventListener('change', prev); prev();
    const err = m.el.querySelector('.error');
    m.el.querySelector('[data-save]').onclick = async (e) => {
      const d = read();
      if (!d.title) { err.textContent = 'Skriv en rubrik.'; err.classList.remove('hidden'); return; }
      await busy(e.currentTarget, async () => {
        const id = n?.id || 'n' + Date.now().toString(36);
        try { await setDoc(doc(db, 'announcements', id), { ...d, ...(n ? {} : { created: serverTimestamp() }), updated: serverTimestamp() }, { merge: true }); m.close(); toast('Sparat.'); newsPage(main); } catch (ex) { err.textContent = errText(ex); err.classList.remove('hidden'); }
      });
    };
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmBox('Ta bort nyheten?'))) return;
      try { await deleteDoc(doc(db, 'announcements', n.id)); m.close(); toast('Borttagen.'); newsPage(main); } catch (ex) { toast(errText(ex)); }
    });
  };
  main.querySelector('[data-new]').onclick = () => edit(null);
  main.querySelectorAll('tr[data-id]').forEach((r) => (r.onclick = () => edit(list.find((n) => n.id === r.dataset.id))));
}

// ---------- Varor som användare lagt till ----------
async function foodsPage(main) {
  const s = await getDocs(collection(db, 'foods'));
  const all = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nameLower || '').localeCompare(b.nameLower || '', 'sv'));
  main.innerHTML = `
    <div class="between"><div><h1>Varor</h1><span class="muted">${all.length} varor som användare har lagt till. Rätta fel eller ta bort konstiga.</span></div></div>
    <input class="input" id="q" placeholder="Sök vara, märke eller streckkod…" style="max-width:420px">
    <div class="card flush"><table>
      <thead><tr><th>Namn</th><th class="hide-m">Märke</th><th class="r">kcal/100</th><th class="r hide-m">Protein</th><th class="hide-m">Streckkod</th><th>Typ</th></tr></thead>
      <tbody data-rows></tbody></table></div>`;
  const draw = () => {
    const q = main.querySelector('#q').value.trim().toLowerCase();
    const list = all.filter((f) => !q || `${f.name} ${f.brand} ${f.barcode}`.toLowerCase().includes(q)).slice(0, 300);
    main.querySelector('[data-rows]').innerHTML = list.length ? list.map((f) => `<tr class="click" data-id="${esc(f.id)}"><td><b>${esc(f.name)}</b></td><td class="hide-m">${esc(f.brand || '–')}</td>
      <td class="r num">${Math.round(f.per100?.kcal ?? 0)}</td><td class="r num hide-m">${fmt1(f.per100?.p)}</td><td class="hide-m small">${esc(f.barcode || '–')}</td>
      <td>${f.liquid ? '<span class="chip off">Dryck</span>' : '<span class="chip off">Mat</span>'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Inga träffar.</td></tr>';
    main.querySelectorAll('tr[data-id]').forEach((r) => (r.onclick = () => edit(all.find((f) => f.id === r.dataset.id))));
  };
  const edit = (f) => {
    const p = f.per100 || {};
    const fld = (id, l, v) => `<div class="field"><label>${l}</label><input class="input" id="${id}" inputmode="decimal" value="${v ?? ''}"></div>`;
    const m = modal(`
      <h2>Ändra vara</h2>
      <div class="field"><label>Namn</label><input class="input" id="fn" maxlength="80" value="${esc(f.name)}"></div>
      <div class="field"><label>Märke</label><input class="input" id="fb" maxlength="40" value="${esc(f.brand || '')}"></div>
      <label class="check"><input type="checkbox" id="fl" ${f.liquid ? 'checked' : ''}> Det är en dryck (per 100 ml)</label>
      <div class="grid g2">${fld('fk', 'Energi (kcal per 100)', p.kcal)}${fld('fp', 'Protein (g)', p.p)}${fld('fc', 'Kolhydrater (g)', p.c)}${fld('ff', 'Fett (g)', p.f)}${fld('fpo', '1 portion (g/ml)', f.portionG)}${fld('fpa', 'Hel förp. (g/ml)', f.packG)}</div>
      <p class="small muted">${f.barcode ? 'Streckkod ' + esc(f.barcode) + ' · ' : ''}Tillagd ${dShort(toD(f.createdAt))}. Det användare redan har loggat ändras inte.</p>
      <p class="error hidden"></p>
      <div class="row" style="justify-content:space-between"><button class="btn danger" data-del>Ta bort</button>
        <div class="row"><button class="btn" data-close>Avbryt</button><button class="btn primary" data-save>Spara</button></div></div>`);
    const v = (id) => m.el.querySelector('#' + id).value.trim();
    const err = m.el.querySelector('.error');
    m.el.querySelector('[data-save]').onclick = async (e) => {
      const kcal = num(v('fk'));
      if (!v('fn') || kcal == null || kcal < 0 || kcal > 1000) { err.textContent = 'Fyll i namn och kalorier (0–1000).'; err.classList.remove('hidden'); return; }
      await busy(e.currentTarget, async () => {
        const per100 = { kcal: Math.round(kcal), p: num(v('fp')) || 0, c: num(v('fc')) || 0, f: num(v('ff')) || 0 };
        const data = { name: v('fn'), nameLower: v('fn').toLowerCase(), brand: v('fb'), per100, portionG: num(v('fpo')), packG: num(v('fpa')), liquid: m.el.querySelector('#fl').checked, updatedAt: serverTimestamp() };
        try { await setDoc(doc(db, 'foods', f.id), data, { merge: true }); Object.assign(f, data); m.close(); toast('Sparat.'); draw(); } catch (ex) { err.textContent = errText(ex); err.classList.remove('hidden'); }
      });
    };
    m.el.querySelector('[data-del]').onclick = async () => {
      if (!(await confirmBox('Ta bort varan?', 'Den försvinner från sökningen för alla. Det som redan är loggat finns kvar.'))) return;
      try { await deleteDoc(doc(db, 'foods', f.id)); all.splice(all.indexOf(f), 1); m.close(); toast('Borttagen.'); draw(); } catch (ex) { toast(errText(ex)); }
    };
  };
  main.querySelector('#q').addEventListener('input', draw);
  draw();
}

// ---------- Offentliga inlägg ----------
async function postsPage(main) {
  const s = await getDocs(query(collection(db, 'posts'), where('public', '==', true)));
  const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toD(b.createdAt) || 0) - (toD(a.createdAt) || 0));
  const txt = (p) => p.text || (p.pct != null ? `${p.pct > 0 ? '+' : ''}${fmt1(p.pct)} % totalt` : p.pLast != null ? `${fmt1(p.pLast)} % sedan förra` : '(inlägg utan text)');
  main.innerHTML = `
    <div><h1>Offentliga inlägg</h1><span class="muted">Inlägg som visas för alla i appen. Privata inlägg syns inte här.</span></div>
    ${list.length ? `<div class="card flush"><table>
      <thead><tr><th>Inlägg</th><th class="hide-m">Av</th><th class="hide-m">Datum</th><th></th></tr></thead>
      <tbody>${list.map((p) => `<tr><td>${esc(txt(p))}</td><td class="hide-m">${esc(p.ownerName || '–')}</td><td class="hide-m">${dShort(toD(p.createdAt))}</td>
        <td class="r"><button class="btn danger sm" data-del="${p.id}">Ta bort</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Inga offentliga inlägg.</div>'}`;
  main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Ta bort inlägget?', 'Det försvinner för alla. Använd bara för olämpligt innehåll.'))) return;
    try { await deleteDoc(doc(db, 'posts', b.dataset.del)); toast('Borttaget.'); postsPage(main); } catch (ex) { toast(errText(ex)); }
  }));
}
