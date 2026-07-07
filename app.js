// Sitely Mini App - личный кабинет. API на Cloudflare Pages, авторизация через initData.
const API = "https://sitely-99n.pages.dev/api/miniapp";
const tg = window.Telegram ? window.Telegram.WebApp : null;

const content = document.getElementById("content");
let timerInterval = null;
let serverOffset = 0; // serverTime - Date.now()

if (tg) { tg.ready(); tg.expand(); }

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toast(text) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(path, body) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: tg ? tg.initData : "", ...body }),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

function fmtLeft(ms) {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function badgeClass(status) {
  if (status === "active") return "active";
  if (status === "awaiting_site" || status === "reactivating") return "wait";
  if (status === "awaiting_pay") return "pay";
  return "off";
}

function render(data) {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const sub = data.sub;
  serverOffset = (data.serverTime || Date.now()) - Date.now();

  if (!sub) {
    content.innerHTML = `<div class="state"><div class="big">🌿</div>
      <p><b>У вас пока нет подписки.</b></p>
      <p>Откройте чат с ботом и нажмите /start - Ева подберёт тариф и сделает премиум-сайт за 24 часа.</p></div>`;
    return;
  }

  let html = "";

  // Статус
  html += `<div class="card">
    <div class="row"><span class="k">Тариф</span><span class="v">${esc(sub.tariffName)}${sub.sum ? " · " + sub.sum + " ₽/мес" : ""}</span></div>
    <div class="row"><span class="k">Статус</span><span class="v"><span class="badge ${badgeClass(sub.status)}">${esc(sub.statusText)}</span></span></div>
    ${sub.next_payment_str ? `<div class="row"><span class="k">Следующее списание</span><span class="v">${esc(sub.next_payment_str)}</span></div>` : ""}
  </div>`;

  // Живой таймер
  if ((sub.status === "awaiting_site" || sub.status === "reactivating") && sub.deadline) {
    const total = sub.status === "awaiting_site" ? 24 * 3600 * 1000 : 5 * 60 * 1000;
    const label = sub.status === "awaiting_site"
      ? "Ваш сайт готовится. До выдачи:"
      : "Сайт оживает. Осталось примерно:";
    const subtext = sub.status === "awaiting_site"
      ? "Как только сайт будет готов, Ева пришлёт ссылку в чат - можно спокойно заниматься делами."
      : "Тот же самый сайт возвращается онлайн - все тексты и настройки на месте.";
    html += `<div class="card timer-card">
      <div class="timer-label">${label}</div>
      <div class="timer ${sub.status === "reactivating" ? "small" : ""}" id="timer">--:--</div>
      <div class="progress"><i id="bar" style="width:0%"></i></div>
      <div class="timer-sub">${subtext}</div>
    </div>`;
    setTimeout(() => {
      const tick = () => {
        const nowSrv = Date.now() + serverOffset;
        const left = sub.deadline - nowSrv;
        const el = document.getElementById("timer");
        const bar = document.getElementById("bar");
        if (!el) return;
        el.textContent = left > 0 ? fmtLeft(left) : "вот-вот!";
        if (bar) bar.style.width = Math.min(100, Math.max(2, 100 - (left / total) * 100)) + "%";
      };
      tick();
      timerInterval = setInterval(tick, 1000);
    }, 0);
  }

  // Сайт
  if (sub.site_url && (sub.status === "active")) {
    html += `<div class="card"><h2>Ваш сайт</h2>
      <a class="site-link" href="${esc(sub.site_url)}" target="_blank" rel="noopener">Открыть сайт ↗</a>
      <div class="site-url">${esc(sub.site_url)}</div>
    </div>`;
  }
  if ((sub.status === "cancelled" || sub.status === "expired") && sub.site_url) {
    html += `<div class="card"><h2>Ваш сайт</h2>
      <div class="timer-sub" style="text-align:center">Сайт сейчас скрыт, но полностью сохранён 🌙<br>Возобновите подписку - и он вернётся онлайн за пару минут, тот же самый.</div>
    </div>`;
  }

  // Действия
  const btns = [];
  if (sub.status === "awaiting_pay") btns.push(`<button class="btn primary" data-a="pay">Оплатить подписку · ${sub.sum} ₽</button>`);
  if (sub.status === "active") {
    btns.push(`<button class="btn primary" data-a="pay">Продлить подписку · ${sub.sum} ₽</button>`);
    if (sub.tariff === "basic") btns.push(`<button class="btn" data-a="upgrade">Апгрейд до Премиум ✨</button>`);
    btns.push(`<button class="btn" data-a="edits">Заказать правки</button>`);
  }
  if (sub.status === "cancelled" || sub.status === "expired") {
    btns.push(`<button class="btn primary" data-a="pay">Возобновить подписку · ${sub.sum} ₽</button>`);
  }
  btns.push(`<button class="btn ${sub.status === "active" ? "" : "wide"}" data-a="support">Поддержка 💬</button>`);
  if (sub.status === "active") btns.push(`<button class="btn danger" data-a="cancel">Отменить подписку</button>`);
  html += `<div class="card"><h2>Действия</h2><div class="actions">${btns.join("")}</div></div>`;

  // История платежей
  if (sub.payments && sub.payments.length) {
    html += `<div class="card"><h2>История платежей</h2>` +
      sub.payments.slice().reverse().map((p) =>
        `<div class="pay-item"><span class="d">${esc(p.date)} · ${p.purpose === "new" ? "первый платёж" : p.purpose === "renew" ? "продление" : "возобновление"}</span><span class="s">${p.sum} ₽</span></div>`
      ).join("") + `</div>`;
  }

  content.innerHTML = html;

  content.querySelectorAll("[data-a]").forEach((btn) => {
    btn.addEventListener("click", () => doAction(btn.dataset.a, btn));
  });
}

async function doAction(action, btn) {
  if (action === "cancel") {
    const go = tg && tg.showConfirm
      ? await new Promise((res) => tg.showConfirm("Отменить подписку? Сайт доработает оплаченный период и скроется, но полностью сохранится.", res))
      : confirm("Отменить подписку?");
    if (!go) return;
  }
  btn.disabled = true;
  try {
    const r = await api("/action", { action });
    if (!r.ok) { toast("Не получилось: " + (r.error || "попробуйте в чате бота")); return; }
    if (r.url) {
      if (tg && tg.openLink) tg.openLink(r.url); else window.open(r.url, "_blank");
      toast("Открываю страницу оплаты...");
    } else if (r.message) {
      toast(r.message);
    }
    if (action === "cancel") setTimeout(load, 800);
  } catch {
    toast("Сеть не отвечает - откройте /кабинет в чате бота, там всё то же самое.");
  } finally {
    btn.disabled = false;
  }
}

async function load() {
  try {
    const data = await api("/data", {});
    if (!data.ok) {
      content.innerHTML = `<div class="state"><div class="big">🔐</div>
        <p><b>Не удалось подтвердить, что это вы.</b></p>
        <p>Откройте кабинет заново из чата с ботом (кнопка «Открыть кабинет»).</p></div>`;
      return;
    }
    render(data);
  } catch {
    content.innerHTML = `<div class="state"><div class="big">📡</div>
      <p><b>Кабинет временно недоступен из вашей сети.</b></p>
      <p>Ничего страшного: откройте чат с ботом и отправьте <b>/кабинет</b> - там есть всё то же самое, включая таймер и оплату.</p></div>`;
  }
}

load();
