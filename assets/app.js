/* Читалка підручників: вибір предмета → сторінка зліва, тези справа.
   Адреса: #<slug>.<сторінка> (лише літери/цифри/крапка/дефіс — так працює і на claude.ai, і на будь-якому хостингу). */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const KIND = { cover: 'Обкладинка', toc: 'Зміст', text: 'Тема', exercises: 'Завдання', image: 'Ілюстрація', empty: 'Порожня сторінка', intro: 'Вступ', answers: 'Відповіді', index: 'Покажчик' };
  const state = { books: null, book: null, theses: {}, texts: null, page: 1, busy: false };
  const cache = new Map();
  // масштаб шрифту конспекту: кроки A−/A+, 1 = як у макеті
  const FS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('p8:' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('p8:' + k, JSON.stringify(v)); } catch { /* приватний режим */ } },
  };
  const getJSON = async url => {
    if (!cache.has(url)) cache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }));
    try { return await cache.get(url); } catch (e) { cache.delete(url); throw e; }
  };
  const pageUrl = (slug, n) => `books/${slug}/pages/${String(n).padStart(4, '0')}.webp`;
  const ready = b => (b.pages || 0) > 0;
  // Номер, НАДРУКОВАНИЙ у книжці (page_offset/page_scale з scripts/page_labels.py); адреса й файли — за номером PDF.
  // page_scale 2 — PDF з розворотів: на одній сторінці PDF дві сторінки книжки («78–79»).
  const label = (b, i) => {
    if (b.page_offset == null) return String(i);
    const s = b.page_scale || 1, p = s * i - b.page_offset;
    if (p < 1) return '';
    return s === 2 ? `${p}–${p + 1}` : String(p);
  };
  const fromLabel = (b, x) => (b.page_offset == null ? x : Math.floor((x + b.page_offset) / (b.page_scale || 1)));
  const lastLabel = b => { const l = label(b, b.pages); return l.includes('–') ? l.split('–')[1] : l; };

  function parseHash() {
    const m = location.hash.slice(1).match(/^([a-z0-9-]+)(?:\.(\d+))?$/i);
    return m ? { slug: m[1], page: m[2] ? +m[2] : null } : null;
  }
  function go(slug, page) {
    const h = slug ? `#${slug}.${page}` : '#';
    if (location.hash !== h) history.replaceState(null, '', h === '#' ? location.pathname + location.search : h);
  }

  /* ---------- Вибір предмета: «Дія» × кіберпанк (макет design/landing-ideas/04a) ---------- */
  // неон — за групою предметів; невідома група — блакитний
  const NEON = { 'Мови й література': '#00f0ff', 'Математика': '#ff2bd6', 'Природничі науки': '#7dff4d', 'Суспільство': '#ffe14d', 'Технології': '#ff8a3d', "Мистецтво й здоров'я": '#b77dff' };
  const ICON = {
    'ukr-mova': '✍️', 'ukr-lit': '📖', 'zar-lit': '🌍', english: '💬', algebra: '➗', geometria: '📐',
    fizyka: '⚡', khimiia: '🧪', biolohiia: '🧬', heohrafiia: '🗺️', 'istoriia-ukr': '🏰', vsesvitnia: '🏛️',
    hromadianska: '🤝', pidpryiemnytstvo: '💰', informatyka: '💻', tekhnolohii: '🛠️', mystetstvo: '🎨', zdorovia: '🍎',
  };
  // знахідний відмінок для «Продовжимо …?» (з назвою в називному виходить «Продовжимо фізика?»)
  const ACC = {
    'ukr-mova': 'українську мову', 'ukr-lit': 'українську літературу', 'zar-lit': 'зарубіжну літературу', english: 'англійську',
    algebra: 'алгебру', geometria: 'геометрію', fizyka: 'фізику', khimiia: 'хімію', biolohiia: 'біологію', heohrafiia: 'географію',
    'istoriia-ukr': 'історію України', vsesvitnia: 'всесвітню історію', hromadianska: 'громадянську освіту',
    pidpryiemnytstvo: 'підприємництво', informatyka: 'інформатику', tekhnolohii: 'технології', mystetstvo: 'мистецтво', zdorovia: "«Здоров'я, безпека та добробут»",
  };
  const num = n => n.toLocaleString('uk-UA');

  function renderHome() {
    document.title = 'Підручники 8 клас';
    const all = state.books.subjects;
    const groups = new Map();
    for (const b of all) {
      if (!groups.has(b.group)) groups.set(b.group, []);
      groups.get(b.group).push(b);
    }
    const nReady = all.filter(ready).length;
    const nPages = all.reduce((s, b) => s + (b.pages || 0), 0);
    // остання відкрита книжка (state 'recent' пише show()); закладка на обкладинці — теж закладка
    const rb = all.find(b => b.slug === store.get('recent') && ready(b));
    const rp = rb && Math.min(store.get('last:' + rb.slug) || 1, rb.pages);
    const hello = rb
      ? `<div><div class="cy-sys">// система готова · ${nReady} підручників · ${num(nPages)} сторінок</div>
          <h2>Привіт! Продовжимо <span>${esc(ACC[rb.slug] || rb.subject)}</span>?<i class="cy-cur" aria-hidden="true"></i></h2>
          <p>${label(rb, rp) ? `Закладка на сторінці ${label(rb, rp)} з ${lastLabel(rb)}.` : 'Закладка на початку книжки.'} Тези вже чекають поруч.</p>
          <div class="cy-bar" role="progressbar" aria-label="Прочитано" aria-valuemin="0" aria-valuemax="${rb.pages}" aria-valuenow="${rp}"><i style="width:${Math.round(rp / rb.pages * 100)}%"></i></div></div>
        <button class="cy-go" data-slug="${esc(rb.slug)}">Продовжити →</button>`
      : `<div><div class="cy-sys">// система готова · ${nReady} з ${all.length} підручників · ${num(nPages)} сторінок</div>
          <h2>Привіт! Обери <span>предмет</span><i class="cy-cur" aria-hidden="true"></i></h2>
          <p>Ліворуч сторінка підручника, праворуч короткі тези саме цієї сторінки.</p></div>
        <button class="cy-go" id="to-list">До предметів ↓</button>`;
    app.innerHTML = `
      <main class="cy">
        <div class="cy-sky" aria-hidden="true"></div><div class="cy-floor" aria-hidden="true"></div>
        <div class="cy-wrap">
          <header class="cy-top"><h1>Підручники</h1><span class="cy-lv">${state.books.grade} клас</span><span class="cy-me" aria-hidden="true">${state.books.grade}</span></header>
          <section class="cy-hello">${hello}</section>
          ${[...groups].map(([g, list], i) => `
            <section class="cy-group" style="--n:${NEON[g] || '#00f0ff'}" aria-label="${esc(g)}"${i ? '' : ' id="list"'}>
              <h3>${esc(g)}</h3>
              <div class="cy-grid">
                ${list.map(b => {
                  const last = store.get('last:' + b.slug);
                  const meta = ready(b)
                    ? `<span>${b.pages} с. · тези</span>${b.demo ? '<span class="demo">демо</span>' : ''}${last > 1 && label(b, last) ? `<span class="res">▶ с. ${label(b, last)}</span>` : ''}`
                    : `<span>${esc(b.note || 'чекає на PDF')}</span>`;
                  return `<button class="cy-card" data-slug="${esc(b.slug)}" ${ready(b) ? '' : 'disabled'}>
                      <span class="cy-ico" aria-hidden="true">${ICON[b.slug] || '📘'}</span>
                      <span><b>${esc(b.subject)}</b><span class="cy-meta">${meta}</span></span>
                      <span class="cy-arr" aria-hidden="true">→</span>
                    </button>`;
                }).join('')}
              </div>
            </section>`).join('')}
        </div>
      </main>`;
    app.querySelectorAll('.cy-card:not([disabled]), .cy-go[data-slug]').forEach(el =>
      el.addEventListener('click', () => openBook(el.dataset.slug)));
    document.getElementById('to-list')?.addEventListener('click', () => document.getElementById('list').scrollIntoView({ behavior: 'smooth' }));
  }

  /* ---------- Читалка ---------- */
  async function openBook(slug, page) {
    const b = state.books.subjects.find(x => x.slug === slug);
    if (!b || !ready(b)) { go(); renderHome(); return; }
    state.book = b; state.texts = null;
    state.page = Math.min(Math.max(page || store.get('last:' + slug) || 1, 1), b.pages);
    try { state.theses = (await getJSON(`books/${slug}/theses.json`)).pages || {}; } catch { state.theses = {}; }
    renderReader();
  }

  function renderReader() {
    const b = state.book;
    document.title = `${b.subject} · 8 клас`;
    app.innerHTML = `
      <div class="reader" style="--n:${NEON[b.group] || '#00f0ff'}">
        <div class="cy-sky" aria-hidden="true"></div>
        <header class="bar">
          <button class="back" id="back" title="До списку предметів">← Предмети</button>
          <div class="title"><span class="dot"></span><b>${esc(b.title || b.subject)}</b></div>
          <nav class="pager" aria-label="Сторінки">
            <button id="prev" aria-label="Попередня сторінка">‹</button>
            <input id="pnum" type="text" inputmode="numeric" aria-label="Номер сторінки, як надруковано в підручнику">
            <span class="of">з ${lastLabel(b)}</span>
            <button id="next" aria-label="Наступна сторінка">›</button>
          </nav>
        </header>
        <div class="split">
          <section class="stage" id="stage" aria-label="Сторінка підручника">
            <div class="sheet" id="sheet"><img id="img" alt=""></div>
            <button class="hit l" id="hitl" aria-label="Попередня сторінка"></button>
            <button class="hit r" id="hitr" aria-label="Наступна сторінка"></button>
            <div class="stage-tools"><button id="zoom">Збільшити</button></div>
          </section>
          <aside class="notebook" id="notes" aria-label="Конспект сторінки">
            <button class="nb-toggle" id="nbtoggle" aria-controls="nbbody"><i aria-hidden="true">‹</i><span>Конспект</span></button>
            <div id="nbbody" aria-live="polite"></div>
          </aside>
        </div>
      </div>`;
    const $ = id => document.getElementById(id);
    $('back').onclick = () => { go(); renderHome(); };
    $('prev').onclick = $('hitl').onclick = () => turn(-1);
    $('next').onclick = $('hitr').onclick = () => turn(1);
    $('pnum').onchange = e => { const x = parseInt(e.target.value, 10); show(Number.isFinite(x) ? fromLabel(b, x) : state.page, 0); };
    // конспект: згорнути/розгорнути (лишається смужка-поле, по якій його відкривають знову) і розмір шрифту
    $('nbtoggle').onclick = () => { store.set('nbClosed', !store.get('nbClosed')); applyNotebook(); };
    $('notes').addEventListener('click', e => {
      const btn = e.target.closest('[data-fs]');
      if (!btn) return;
      const i = Math.min(Math.max(fsIndex() + +btn.dataset.fs, 0), FS.length - 1);
      store.set('nbFont', FS[i]);
      applyNotebook();
    });
    applyNotebook();
    $('zoom').onclick = () => {
      const z = $('stage').classList.toggle('zoom');
      $('zoom').textContent = z ? 'Вмістити' : 'Збільшити';
    };
    // свайп на телефоні
    let x0 = null, y0 = null;
    $('stage').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('stage').addEventListener('touchend', e => {
      if (x0 == null || $('stage').classList.contains('zoom')) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
    show(state.page, 0);
  }

  function turn(d) { show(state.page + d, d); }

  function fsIndex() { const i = FS.indexOf(store.get('nbFont')); return i < 0 ? FS.indexOf(1) : i; }

  // стан конспекту з localStorage → класи/атрибути; викликається після кожного renderNotes (кнопки A−/A+ перемальовуються)
  function applyNotebook() {
    const el = document.getElementById('notes');
    if (!el) return;
    const closed = !!store.get('nbClosed'), i = fsIndex();
    el.closest('.split').classList.toggle('nb-closed', closed);
    el.classList.toggle('closed', closed);
    el.style.setProperty('--nb-fs', FS[i]);
    const t = document.getElementById('nbtoggle');
    t.setAttribute('aria-expanded', String(!closed));
    t.title = closed ? 'Показати конспект' : 'Сховати конспект';
    t.setAttribute('aria-label', t.title);
    el.querySelectorAll('[data-fs]').forEach(b => { b.disabled = +b.dataset.fs < 0 ? i === 0 : i === FS.length - 1; });
    const pct = el.querySelector('.nb-font');
    if (pct) pct.title = `Шрифт конспекту: ${Math.round(FS[i] * 100)}%`;
  }

  function show(n, dir) {
    const b = state.book;
    n = Math.min(Math.max(n, 1), b.pages);
    const img = document.getElementById('img');
    if (!img) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dir && n !== state.page && img.complete && img.naturalWidth && !reduce) {
      // стара сторінка перегортається поверх нової
      document.querySelectorAll('.flip').forEach(f => f.remove());
      const flip = document.createElement('div');
      flip.className = 'flip ' + (dir > 0 ? 'next' : 'prev');
      flip.innerHTML = `<img src="${img.src}" alt="">`;
      document.getElementById('sheet').appendChild(flip);
      flip.addEventListener('animationend', () => flip.remove());
    }
    state.page = n;
    img.src = pageUrl(b.slug, n);
    const lb = label(b, n);
    img.alt = `${b.subject}, сторінка ${lb || n}`;
    const pn = document.getElementById('pnum');
    pn.value = lb;
    pn.placeholder = lb ? '' : 'обкл.';
    document.getElementById('prev').disabled = n <= 1;
    document.getElementById('next').disabled = n >= b.pages;
    store.set('last:' + b.slug, n);
    store.set('recent', b.slug);
    go(b.slug, n);
    renderNotes();
    for (const k of [n + 1, n + 2, n - 1]) if (k >= 1 && k <= b.pages) new Image().src = pageUrl(b.slug, k);
  }

  function renderNotes() {
    const el = document.getElementById('nbbody');
    const n = state.page, t = state.theses[String(n)], lb = label(state.book, n);
    let html = `<div class="nb-page${lb.includes("–") ? " wide" : ""}" aria-label="Сторінка ${lb || n}">${lb || '·'}</div>`;
    const font = `<span class="nb-font" role="group" aria-label="Розмір шрифту конспекту">
        <button data-fs="-1" aria-label="Зменшити шрифт конспекту">A−</button><button data-fs="1" aria-label="Збільшити шрифт конспекту">A+</button></span>`;
    if (!t) {
      html += `<div class="nb-head">${font}</div>`;
      html += `<div class="empty"><b>Тез ще немає</b><span>Для сторінки ${lb || n} конспект ще не згенеровано. Сторінку можна читати зліва.</span></div>`;
    } else {
      html += `<div class="nb-head"><span class="nb-kind">${esc(KIND[t.kind] || 'Сторінка')}</span>${font}</div>`;
      if (t.title) html += `<h2>${esc(t.title)}</h2>`;
      if (t.points?.length) html += `<ul class="points">${t.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;
      if (t.formulas?.length) html += `<h3>Формули</h3>${t.formulas.map(f => `<div class="formula">${esc(f)}</div>`).join(' ')}`;
      if (t.terms?.length) html += `<h3>Запам'ятай</h3><dl class="terms">${t.terms.map(x => `<div><dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd></div>`).join('')}</dl>`;
      if (t.example) html += `<h3>Приклад</h3><p class="example">${esc(t.example)}</p>`;
    }
    html += `<details class="raw" id="raw"><summary>Текст сторінки</summary><pre id="rawtext">…</pre></details>`;
    el.innerHTML = html;
    document.getElementById('notes').scrollTop = 0;
    applyNotebook();
    document.getElementById('raw').addEventListener('toggle', async e => {
      if (!e.target.open) return;
      try {
        state.texts ??= await getJSON(`books/${state.book.slug}/text.json`);
        document.getElementById('rawtext').textContent = state.texts[String(state.page)] || '(на сторінці немає текстового шару — скан або малюнок)';
      } catch { document.getElementById('rawtext').textContent = 'Не вдалося завантажити текст сторінки.'; }
    });
  }

  document.addEventListener('keydown', e => {
    if (!state.book || !document.getElementById('img') || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { turn(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { turn(-1); e.preventDefault(); }
    else if (e.key === 'Home') show(1, -1);
    else if (e.key === 'End') show(state.book.pages, 1);
  });

  function route() {
    const h = parseHash();
    if (h) openBook(h.slug, h.page); else { state.book = null; renderHome(); }
  }

  getJSON('books.json').then(data => { state.books = data; route(); })
    .catch(() => { app.innerHTML = '<p class="loading">Не вдалося завантажити список предметів (books.json). Оновіть сторінку.</p>'; });
  window.addEventListener('hashchange', () => { if (state.books) route(); });
})();
