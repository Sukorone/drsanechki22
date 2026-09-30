const { CONFIG, DRINKS, FOOD, ARRIVALS, LEVELS } = window
const KEY_STORAGE = 'dr22_admin_key'
const $ = (s, root = document) => root.querySelector(s)
const $$ = (s, root = document) => [...root.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const getKey = () => { try { return localStorage.getItem(KEY_STORAGE) || '' } catch { return '' } }
const setKey = k => { try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE) } catch {} }

let rows = []
let sleepSpots = CONFIG.SLEEP_SPOTS

// ---------- Telegram Mini App ----------
// Telegram передаёт подписанные данные пользователя в #tgWebAppData — по ним скрипт пускает без пароля
const TG_STORAGE = 'dr22_tg_init'
const tgInit = (() => {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')
  try {
    if (fromHash) sessionStorage.setItem(TG_STORAGE, fromHash)
    return fromHash || sessionStorage.getItem(TG_STORAGE) || ''
  } catch { return fromHash || '' }
})()
if (tgInit) {
  document.documentElement.classList.add('in-tg')
  const s = document.createElement('script')
  s.src = 'https://telegram.org/js/telegram-web-app.js'
  s.onload = () => {
    const tg = window.Telegram?.WebApp
    if (!tg) return
    tg.ready()
    tg.expand()
    try { tg.setHeaderColor('#0c0c0c'); tg.setBackgroundColor('#0c0c0c') } catch {}
  }
  document.head.appendChild(s)
}

// ---------- Загрузка ----------
async function load() {
  const demo = !CONFIG.API_URL
  $('#demo').hidden = !demo
  if (demo) { rows = demoRows(); return show() }

  const key = getKey()
  if (!tgInit && !key) return showLogin()

  $('#status').hidden = false
  $('#status').textContent = 'Загружаю ответы…'
  $('#refresh').disabled = true
  try {
    const res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'list', tg_init: tgInit || undefined, key: key || undefined }) })
    const json = await res.json()
    if (json.error === 'wrong_key') { setKey(''); return showLogin('Неверный пароль') }
    if (json.error === 'tg_denied') return showLogin('Telegram не пустил — введи пароль')
    if (!json.ok) throw new Error(json.error)
    rows = json.rows
    if (json.sheet_url) { $('#sheetLink').href = json.sheet_url; $('#sheetLink').hidden = false }
    sleepSpots = json.sleep_spots ?? sleepSpots
    show()
  } catch (err) {
    console.error(err)
    $('#status').textContent = 'Не получилось загрузить данные. Проверь интернет и нажми «Обновить».'
    $('#actions').hidden = false
  } finally {
    $('#refresh').disabled = false
  }
}

function showLogin(msg = '') {
  $('#dash').hidden = true
  $('#actions').hidden = true
  $('#status').hidden = true
  $('#login').hidden = false
  $('#loginError').textContent = msg
  $('#loginError').hidden = !msg
  $('#key').focus()
}

$('#login').addEventListener('submit', e => {
  e.preventDefault()
  setKey($('#key').value.trim())
  $('#login').hidden = true
  load()
})
$('#refresh').addEventListener('click', load)
$('#sheetLink').addEventListener('click', e => {
  const tg = window.Telegram?.WebApp
  if (tg?.openLink) { e.preventDefault(); tg.openLink(e.currentTarget.href) }
})
$('#logout').addEventListener('click', () => { setKey(''); showLogin() })

// ---------- Отрисовка ----------
function show() {
  $('#status').hidden = true
  $('#login').hidden = true
  $('#dash').hidden = false
  $('#actions').hidden = false
  $('#logout').hidden = !!tgInit
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))
  renderTiles()
  renderAllergies()
  renderDrinks()
  renderFood()
  renderArrival()
  renderLevels()
  renderTracks()
  renderMessages()
  renderCards()
}

const going = () => rows.filter(r => r.attending)
const nameOf = r => r.name + (r.plus_one ? ` +1` : '')

function renderTiles() {
  const g = going()
  const plus = g.filter(r => r.plus_one).length
  const sleep = g.filter(r => r.sleepover).length
  const lv = g.map(r => +r.party_level).filter(Boolean)
  const avg = lv.length ? (lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1) : '—'
  const tiles = [
    ['Людей придёт', g.length + plus, `${g.length} гостей + ${plus} спутн.`, true],
    ['Ответили', rows.length, ''],
    ['Не смогут', rows.length - g.length, ''],
    ['Ночёвка', `${sleep}<small>/${sleepSpots}</small>`, sleep >= sleepSpots ? 'мест больше нет' : `свободно ${sleepSpots - sleep}`],
    ['Не пьют', g.filter(r => r.no_alcohol).length, ''],
    ['Уровень тусовки', avg, lv.length ? LEVELS[Math.round(avg)] : ''],
  ]
  $('#tiles').innerHTML = tiles.map(([k, v, s, hl]) =>
    `<div class="tile${hl ? ' hl' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`).join('')
}

// Строки-полоски: items = [{label, people: [row…]}]
function bars(items, max) {
  max = max || Math.max(1, ...items.map(i => i.people.length))
  return items.map(i => {
    const n = i.people.length
    return `<details class="bar-row${n ? '' : ' zero'}">
      <summary><span class="bl" title="${esc(i.label)}">${esc(i.label)}</span>
        <span class="bt"><span class="bf" style="display:block;width:${(n / max) * 100}%"></span></span>
        <span class="bv">${n}</span></summary>
      <div class="who">${n ? i.people.map(p => esc(p.name)).join(', ') : 'никто'}</div>
    </details>`
  }).join('')
}

function renderDrinks() {
  const g = going()
  const groups = DRINKS.map(grp => ({
    title: grp.title,
    items: grp.items.map(it => ({ label: it, people: g.filter(r => (r.drinks || []).includes(`${grp.title}: ${it}`)) })),
  }))
  const extra = [
    { label: 'Не пьют', people: g.filter(r => r.no_alcohol) },
    { label: 'Свой вариант', people: g.filter(r => r.drink_custom) },
  ]
  const max = Math.max(1, ...groups.flatMap(x => x.items).concat(extra).map(i => i.people.length))
  let html = groups.map(x => `<p class="group">${x.title}</p>${bars(x.items, max)}`).join('')
  html += `<p class="group">Другое</p>${bars(extra, max)}`
  const custom = g.filter(r => r.drink_custom)
  if (custom.length) html += `<ul class="plain" style="margin-top:10px">${custom.map(r => `<li>${esc(r.drink_custom)} <span>— ${esc(r.name)}</span></li>`).join('')}</ul>`
  $('#drinks').innerHTML = html
}

function renderFood() {
  const g = going()
  $('#food').innerHTML = bars([
    { label: 'Съем что будет', people: g.filter(r => r.food_any) },
    ...FOOD.map(f => ({ label: f, people: g.filter(r => (r.food || []).includes(f)) })),
    { label: 'Не указали', people: g.filter(r => !r.food_any && !(r.food || []).length) },
  ])
}

function renderAllergies() {
  const list = going().filter(r => r.allergies || (r.food || []).length)
  $('#allergies').innerHTML = list.length
    ? list.map(r => `<div class="alg"><b>${esc(r.name)}</b>${(r.food || []).length ? ` · <span class="tags">${esc(r.food.join(', '))}</span>` : ''}${r.allergies ? `<br>${esc(r.allergies)}` : ''}</div>`).join('')
    : '<p class="empty">Пока никто ничего не указал</p>'
}

function renderArrival() {
  const g = going()
  $('#arrival').innerHTML = bars([
    ...ARRIVALS.map(([v, l]) => ({ label: l, people: g.filter(r => r.arrival === v) })),
    { label: 'Не указали', people: g.filter(r => !r.arrival) },
  ])
}

function renderLevels() {
  const g = going().filter(r => +r.party_level)
  const counts = Array.from({ length: 10 }, (_, i) => g.filter(r => +r.party_level === i + 1))
  const max = Math.max(1, ...counts.map(c => c.length))
  $('#levels').innerHTML = counts.map((c, i) => `
    <div class="col${i >= 8 ? ' hot' : ''}" title="${i + 1} — ${esc(LEVELS[i + 1])}: ${c.length ? esc(c.map(r => r.name).join(', ')) : 'никто'}">
      <span class="cv">${c.length || ''}</span>
      <span class="cb" style="height:${(c.length / max) * 100}%"></span>
      <span class="cl">${i + 1}</span>
    </div>`).join('')
  const avg = g.length ? (g.reduce((a, r) => a + +r.party_level, 0) / g.length) : 0
  $('#levelAvg').textContent = g.length ? `В среднем ${avg.toFixed(1)} — «${LEVELS[Math.round(avg)]}». Наведи на столбик — увидишь кто.` : 'Пока нет ответов'
}

function renderTracks() {
  const t = going().filter(r => r.track)
  $('#tracks').innerHTML = t.length ? t.map(r => `<li>${esc(r.track)} <span>— ${esc(r.name)}</span></li>`).join('') : '<p class="empty">Пока пусто</p>'
}

function renderMessages() {
  const m = rows.filter(r => r.message)
  $('#messages').innerHTML = m.length ? m.map(r => `<div class="msg"><div class="from">${esc(r.name)}</div>${esc(r.message)}</div>`).join('') : '<p class="empty">Пока пусто</p>'
}

// ---------- Карточки гостей ----------
function arrivalLabel(v) { return (ARRIVALS.find(a => a[0] === v) || [, v])[1] }
function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function renderCards() {
  const f = $('input[name=f]:checked').value
  const q = $('#search').value.trim().toLowerCase()
  const list = rows.filter(r =>
    (f === 'all' || (f === 'yes' && r.attending) || (f === 'no' && !r.attending) || (f === 'sleep' && r.attending && r.sleepover)) &&
    (!q || String(r.name).toLowerCase().includes(q) || String(r.plus_one_name).toLowerCase().includes(q)))

  $('#cards').innerHTML = list.length ? list.map(r => {
    const rowsHtml = r.attending ? [
      r.plus_one && ['+1', esc(r.plus_one_name) || 'да'],
      ['Придёт', esc(arrivalLabel(r.arrival)) || '—'],
      ['Пьёт', r.no_alcohol ? 'не пьёт' : ((r.drinks || []).map(esc).join(', ') || '—') + (r.drink_custom ? `; свой: ${esc(r.drink_custom)}` : '')],
      ['Еда', r.food_any ? 'съест что будет' : ((r.food || []).length ? `<span class="warn">${esc(r.food.join(', '))}</span>` : '—')],
      r.allergies && ['Аллергии', `<span class="warn">${esc(r.allergies)}</span>`],
      ['Ночёвка', r.sleepover ? 'остаётся 🛏' : 'нет'],
      r.track && ['Трек', esc(r.track)],
      r.party_level && ['Тусовка', `${r.party_level}/10 · ${esc(LEVELS[r.party_level] || '')}`],
      r.message && ['Пишет', esc(r.message)],
    ] : [r.message && ['Пишет', esc(r.message)]]
    return `<article class="card${r.attending ? '' : ' no'}">
      <div class="card-top"><div class="card-name">${esc(r.name)}</div><span class="badge ${r.attending ? 'yes' : 'no'}">${r.attending ? 'ИДЁТ' : 'НЕ ИДЁТ'}</span></div>
      <dl>${rowsHtml.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="card-foot">ответ: ${fmtDate(r.submitted_at)}${r.updated_at ? ` · изменён: ${fmtDate(r.updated_at)}` : ''}</div>
    </article>`
  }).join('') : '<p class="empty">Никого</p>'
}
$('#filters').addEventListener('change', renderCards)
$('#search').addEventListener('input', renderCards)

// ---------- Демо-данные (пока таблица не подключена) ----------
function demoRows() {
  const g = (name, o = {}) => ({
    name, attending: true, plus_one: false, plus_one_name: '', arrival: '17:00', drinks: [], no_alcohol: false, drink_custom: '',
    food_any: true, food: [], allergies: '', sleepover: false, track: '', party_level: 7, message: '',
    submitted_at: '2026-10-02T12:00:00Z', updated_at: '', ...o,
  })
  return [
    g('Маша Петрова', { plus_one: true, plus_one_name: 'Дима', drinks: ['Вино: Красное', 'Вино: Игристое'], party_level: 8, track: 'Zivert — Life', message: 'Санечка, с наступающим! 🎉' }),
    g('Илья Смирнов', { drinks: ['Крепкое: Виски', 'Крепкое: Ягермейстер'], party_level: 10, sleepover: true, arrival: '19:00', track: 'Cream Soda — Никаких больше вечеринок' }),
    g('Катя Орлова', { food_any: false, food: ['Вегетарианец'], allergies: 'орехи', drinks: ['Слабое: Мартини', 'Вино: Белое'], party_level: 6 }),
    g('Артём Козлов', { drinks: ['Крепкое: Водка', 'Слабое: Пиво'], party_level: 9, sleepover: true, arrival: '21:00' }),
    g('Настя Волкова', { no_alcohol: true, party_level: 5, message: 'Приду с тортом!' }),
    g('Женя Морозов', { drinks: ['Слабое: Пиво'], drink_custom: 'сидр', arrival: 'late', party_level: 7, track: 'Макс Корж — Мотылёк' }),
    g('Лиза Новикова', { food_any: false, food: ['Не ем свинину', 'Без глютена'], drinks: ['Вино: Игристое', 'Слабое: Лимончелло'], party_level: 8 }),
    g('Саша Белов', { attending: false, message: 'Буду в отъезде, обнимаю!' }),
    g('Оля Соколова', { plus_one: true, plus_one_name: 'Паша', drinks: ['Крепкое: Коньяк'], party_level: 4, arrival: '19:00' }),
    g('Денис Фёдоров', { attending: false }),
    g('Вика Лебедева', { drinks: ['Вино: Красное', 'Крепкое: Ягермейстер'], party_level: 9, track: 'Руки Вверх — Крошка моя', updated_at: '2026-10-05T18:30:00Z' }),
  ]
}

load()
