// Настройки, напитки и уровни — в config.js
const { CONFIG, DRINKS, LEVELS } = window

const STORAGE_KEY = 'dr22_rsvp'
const $ = (s, root = document) => root.querySelector(s)
const $$ = (s, root = document) => [...root.querySelectorAll(s)]
const fmtRub = n => n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'

// ---------- Таймер ----------
const target = new Date(CONFIG.PARTY_DATE)
const pad = n => String(n).padStart(2, '0')
function tick() {
  const diff = target - new Date()
  const el = $('#count')
  if (diff <= 0) {
    el.classList.add('over')
    $('.count-nums', el).textContent = 'УЖЕ ИДЁТ!'
    $('.count-l', el).hidden = true
    return false
  }
  $('[data-d]', el).textContent = pad(Math.floor(diff / 864e5))
  $('[data-h]', el).textContent = pad(Math.floor(diff / 36e5) % 24)
  $('[data-m]', el).textContent = pad(Math.floor(diff / 6e4) % 60)
  $('[data-s]', el).textContent = pad(Math.floor(diff / 1e3) % 60)
  return true
}
if (tick()) { const t = setInterval(() => { if (!tick()) clearInterval(t) }, 1000) }

// ---------- Появление секций и копилка ----------
const bank = $('#bank')
bank.style.setProperty('--p', Math.min(100, (CONFIG.BANK_NOW / CONFIG.BANK_GOAL) * 100) + '%')
$('#bankNow').textContent = fmtRub(CONFIG.BANK_NOW)
$('#bankGoal').textContent = fmtRub(CONFIG.BANK_GOAL)

const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
}, { threshold: 0.15 })
$$('.reveal, .bank').forEach(el => io.observe(el))

// ---------- Аккордеон напитков ----------
const drinksRoot = $('#drinks')
drinksRoot.innerHTML = DRINKS.map(g => `
  <div class="acc" data-group="${g.id}">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-${g.id}">
      <span class="acc-title">${g.title}</span><span class="acc-count"></span><span class="acc-icon">+</span>
    </button>
    <div class="acc-body" id="acc-${g.id}"><div class="acc-inner">
      ${g.items.map(i => `<label class="chk"><input type="checkbox" name="drink" value="${g.title}: ${i}"><span>${i}</span></label>`).join('')}
    </div></div>
  </div>`).join('')

function setAccOpen(acc, open) {
  acc.classList.toggle('open', open)
  $('.acc-head', acc).setAttribute('aria-expanded', open)
  $$('input', acc).forEach(i => { i.tabIndex = open ? 0 : -1 })
}
$$('.acc').forEach(acc => {
  setAccOpen(acc, false)
  $('.acc-head', acc).addEventListener('click', () => setAccOpen(acc, !acc.classList.contains('open')))
})
function updateAccCounts() {
  $$('.acc').forEach(acc => {
    const n = $$('input:checked', acc).length
    $('.acc-count', acc).textContent = n ? n : ''
  })
}

const noAlcohol = $('#noAlcohol')
const drinkCustomOn = $('#drinkCustomOn')
const drinkCustom = $('#drinkCustom')
drinksRoot.addEventListener('change', () => {
  if ($$('input[name=drink]:checked').length) noAlcohol.checked = false
  updateAccCounts()
})
noAlcohol.addEventListener('change', () => {
  if (!noAlcohol.checked) return
  $$('input[name=drink]').forEach(i => { i.checked = false })
  $$('.acc').forEach(a => setAccOpen(a, false))
  updateAccCounts()
})
drinkCustomOn.addEventListener('change', () => {
  drinkCustom.hidden = !drinkCustomOn.checked
  if (drinkCustomOn.checked) drinkCustom.focus()
})

// ---------- Еда ----------
const foodAny = $('#foodAny')
foodAny.addEventListener('change', () => {
  if (foodAny.checked) $$('input[name=food]').forEach(i => { i.checked = false })
})
$$('input[name=food]').forEach(i => i.addEventListener('change', () => { if (i.checked) foodAny.checked = false }))

// ---------- +1 ----------
const plusOne = $('#plusOne')
const plusOneName = $('#plusOneName')
plusOne.addEventListener('change', () => {
  plusOneName.hidden = !plusOne.checked
  if (plusOne.checked) plusOneName.focus()
})

// ---------- Ночёвка ----------
// spotsLeft — сколько мест свободно, не считая этого гостя
let spotsLeft = CONFIG.SLEEP_SPOTS
function renderSpots() {
  const sleepover = $('#sleepover')
  const shown = Math.max(0, spotsLeft - (sleepover.checked ? 1 : 0))
  $('#spotsLeft').textContent = shown
  $('#spotsLeft').classList.toggle('zero', shown === 0)
  sleepover.disabled = spotsLeft <= 0 && !sleepover.checked
}
$('#sleepover').addEventListener('change', renderSpots)

async function loadSpots() {
  if (!CONFIG.API_URL) return
  try {
    // свой id передаём, только если он есть: пустой совпал бы со строками, вписанными в таблицу вручную
    const id = loadSaved()?.client_id
    const res = await fetch(`${CONFIG.API_URL}?action=spots${id ? '&client_id=' + encodeURIComponent(id) : ''}`)
    const json = await res.json()
    if (json.ok) { spotsLeft = json.left; renderSpots() }
  } catch (err) { console.warn('Не удалось узнать свободные места', err) }
}

// ---------- Уровень тусовки ----------
const level = $('#level')
function renderLevel() {
  const v = +level.value
  $('#levelNum').textContent = v
  $('#levelCap').textContent = LEVELS[v]
  $('#levelNum').style.color = v >= 9 ? 'var(--orange)' : 'var(--lime)'
}
level.addEventListener('input', renderLevel)

// ---------- Показ блока «иду» ----------
const attendBlock = $('#attendBlock')
function renderAttend() {
  const v = $('input[name=attending]:checked')?.value
  attendBlock.hidden = v !== 'yes'
}
$$('input[name=attending]').forEach(r => r.addEventListener('change', renderAttend))

// ---------- Сбор и заполнение формы ----------
function collect() {
  const attending = $('input[name=attending]:checked')?.value
  const yes = attending === 'yes'
  return {
    name: $('#name').value.trim(),
    attending: yes,
    plus_one: yes && plusOne.checked,
    plus_one_name: yes && plusOne.checked ? plusOneName.value.trim() : '',
    arrival: yes ? ($('input[name=arrival]:checked')?.value || '') : '',
    drinks: yes ? $$('input[name=drink]:checked').map(i => i.value) : [],
    no_alcohol: yes && noAlcohol.checked,
    drink_custom: yes && drinkCustomOn.checked ? drinkCustom.value.trim() : '',
    food_any: yes && foodAny.checked,
    food: yes ? $$('input[name=food]:checked').map(i => i.value) : [],
    allergies: yes ? $('#allergies').value.trim() : '',
    sleepover: yes && $('#sleepover').checked,
    track: yes ? $('#track').value.trim() : '',
    party_level: yes ? +level.value : null,
    message: $('#message').value.trim(),
  }
}

function fill(d) {
  $('#name').value = d.name || ''
  $$('input[name=attending]').forEach(r => { r.checked = r.value === (d.attending ? 'yes' : 'no') })
  plusOne.checked = !!d.plus_one; plusOneName.hidden = !d.plus_one; plusOneName.value = d.plus_one_name || ''
  $$('input[name=arrival]').forEach(r => { r.checked = r.value === d.arrival })
  $$('input[name=drink]').forEach(i => { i.checked = (d.drinks || []).includes(i.value) })
  $$('.acc').forEach(a => setAccOpen(a, !!$('input:checked', a)))
  noAlcohol.checked = !!d.no_alcohol
  drinkCustomOn.checked = !!d.drink_custom; drinkCustom.hidden = !d.drink_custom; drinkCustom.value = d.drink_custom || ''
  foodAny.checked = !!d.food_any
  $$('input[name=food]').forEach(i => { i.checked = (d.food || []).includes(i.value) })
  $('#allergies').value = d.allergies || ''
  $('#sleepover').checked = !!d.sleepover
  $('#track').value = d.track || ''
  if (d.party_level) level.value = d.party_level
  $('#message').value = d.message || ''
  updateAccCounts(); renderAttend(); renderLevel(); renderSpots()
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function save(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch {}
}

// ---------- Отправка ----------
const form = $('#form')
const errorEl = $('#error')
const submitBtn = $('#submit')

function showError(msg) { errorEl.textContent = msg; errorEl.hidden = !msg }

form.addEventListener('submit', async e => {
  e.preventDefault()
  const d = collect()
  if (!d.name) { showError('Напиши, как тебя зовут'); $('#name').focus(); return }
  if (!$('input[name=attending]:checked')) { showError('Выбери: идёшь или нет'); return }
  if (d.plus_one && !d.plus_one_name) { showError('Напиши имя спутника'); plusOneName.focus(); return }
  showError('')

  submitBtn.disabled = true
  submitBtn.textContent = 'Отправляю…'
  const prev = loadSaved()
  d.client_id = prev?.client_id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

  try {
    if (CONFIG.API_URL) {
      // text/plain — чтобы Apps Script принял запрос без CORS-preflight
      const res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(d) })
      const json = await res.json()
      if (json.error === 'no_spots') {
        spotsLeft = 0; $('#sleepover').checked = false; renderSpots()
        showError('Пока ты заполнял(а) анкету, спальные места закончились. Галочку ночёвки я снял — отправь ещё раз.')
        return
      }
      if (!json.ok) throw new Error(json.error || 'Ошибка сервера')
    } else {
      await new Promise(r => setTimeout(r, 600))
      console.log('[demo] ответ анкеты:', d)
    }
    save(d)
    showDone(d)
  } catch (err) {
    showError('Не получилось отправить. Попробуй ещё раз через минуту.')
    console.error(err)
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Отправить →'
  }
})

function showDone(d) {
  form.hidden = true
  $('#done').hidden = false
  $('#doneText').innerHTML = d.attending
    ? `Жду тебя${d.plus_one ? ' (+ ' + escapeHtml(d.plus_one_name) + ')' : ''} <b>10.10 в 17:00</b>. Код домофона пришлю лично.`
    : 'Жаль! Выпьем за тебя. Если планы поменяются — просто измени ответ.'
  $('#rsvp').scrollIntoView({ behavior: 'smooth' })
}
$('#edit').addEventListener('click', () => {
  $('#done').hidden = true
  form.hidden = false
})

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ---------- Старт ----------
renderLevel()
renderSpots()
const saved = loadSaved()
if (saved) { fill(saved); showDoneSilently(saved) }
loadSpots()
function showDoneSilently(d) {
  form.hidden = true
  $('#done').hidden = false
  $('#doneText').innerHTML = (d.attending ? 'Ты уже ответил(а) — жду тебя 10.10 в 17:00.' : 'Ты уже ответил(а), что не сможешь.') + ' Можно поменять ответ.'
}
