/* Общий рендер: ссылки, цифры, эпизоды и появление секций.
 * Механики вариантов сюда не лезут — у каждого свой файл.
 */
(() => {
  "use strict";

  // Появление секций ставим первым делом и безусловно. base.css прячет
  // .reveal, пока наблюдатель не пометит element data-revealed — если бы
  // это осталось внизу за проверкой `if (!D) return`, отказ shared/content.js
  // оставлял бы всю страницу невидимой. Данные ниже могут не прийти,
  // наблюдатель — обязан быть всегда.
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.dataset.revealed = "";
      obs.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -12% 0px" });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));

  const D = window.SOULS;
  if (!D) return;

  // Ссылки и цифры проставляются из данных, чтобы в трёх вариантах
  // не разъезжались адреса.
  document.querySelectorAll("[data-link]").forEach(a => {
    const href = D.links[a.dataset.link];
    if (href) a.href = href;
  });
  const paintStats = () => document.querySelectorAll("[data-stat]").forEach(el => {
    const v = D.audience[el.dataset.stat];
    if (v) el.textContent = v;
  });
  paintStats();

  // Боевой домен: статистика посещений и свежие цифры аудитории с сервера.
  const live = D.live && D.live.hosts.includes(location.hostname) ? D.live : null;
  if (live && live.analytics) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = live.analytics.src;
    s.dataset.websiteId = live.analytics.websiteId;
    document.head.appendChild(s);
  }
  if (live && live.counters && window.fetch) {
    // Сервер недоступен или ответ странный — остаются цифры из content.js.
    const ok = v => typeof v === "string" && /^\d{1,3}(,\d{3})*\+$/.test(v);
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 5000);
    fetch(live.counters, { signal: stop.signal, cache: "no-cache" })
      .then(r => (r.ok ? r.json() : null))
      .then(c => {
        if (!c || !ok(c.readers) || !ok(c.views) || typeof c.asOf !== "string") return;
        D.audience = { readers: c.readers, views: c.views, asOf: c.asOf.slice(0, 40) };
        paintStats();
      })
      .catch(() => {});
  }

  const box = document.querySelector("[data-episodes]");
  if (box && Array.isArray(D.episodes) && D.episodes.length) {
    box.textContent = "";
    // Номер и дата эпизода на странице не показываются (решено 25.09):
    // дата остаётся в данных — по ней держится порядок ленты.
    D.episodes.forEach(ep => {
      const row = document.createElement("article");
      row.className = "episode reveal";
      row.innerHTML =
        '<p class="line ep-line"></p>' +
        '<a class="btn-ghost ep-link" target="_blank" rel="noopener">watch</a>';
      row.querySelector(".ep-line").textContent = ep.line;
      row.querySelector(".ep-link").href = ep.url;
      box.append(row);
      // Строка родилась после того, как наблюдатель уже прошёлся по .reveal
      // выше — сама она под слежение не попала, добираем вручную.
      io.observe(row);
    });
  }
})();
