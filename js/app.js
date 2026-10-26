import * as store from './store.js';

let state = store.loadState();
let currentCustomerId = null;
let entryType = 'credit';
let editingCustomerId = null;

const $ = (id) => document.getElementById(id);

// ---------- Helpers ----------

function save() {
  try {
    store.saveState(state);
  } catch {
    toast('Could not save. Is your phone storage full?');
  }
}

function money(cents) {
  return store.formatMoney(cents, state.settings.currency);
}

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function todayInput() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function dateFromInput(value) {
  if (!value || value === todayInput()) return new Date().toISOString();
  return new Date(`${value}T12:00:00`).toISOString();
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

function relativeDay(iso) {
  if (!iso) return 'No activity yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDate(iso);
}

// ---------- Routing ----------

function hasShop() {
  return Boolean(state.settings.shopName && state.settings.shopName.trim());
}

function route() {
  // 1. Nothing else is reachable until the shop has a name.
  const welcome = !hasShop();
  if (welcome) {
    locked = false;
    hidePad();
  } else if (locked && pad.mode !== 'unlock') {
    // 2. With a PIN set, the book stays hidden until it is unlocked.
    showPad('unlock');
  }

  const covered = welcome || padOpen();
  $('view-welcome').hidden = !welcome;
  document.querySelector('.topbar').hidden = covered;
  $('app').hidden = covered;
  document.title = welcome || locked ? 'Kredit Book' : `${state.settings.shopName} · Kredit Book`;
  if (welcome) {
    if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search);
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    window.scrollTo(0, 0);
    return;
  }
  if (covered) return;

  const hash = location.hash || '#/';
  const [, view, id] = hash.split('/');
  for (const v of document.querySelectorAll('.view')) v.hidden = true;
  $('lock-btn').hidden = true;

  if (view === 'customer' && store.getCustomer(state, id)) {
    currentCustomerId = id;
    $('view-customer').hidden = false;
    $('back-btn').hidden = false;
    $('settings-btn').hidden = true;
    renderCustomer();
  } else if (view === 'settings') {
    $('view-settings').hidden = false;
    $('back-btn').hidden = false;
    $('settings-btn').hidden = true;
    $('title').textContent = 'Settings';
    renderSettings();
  } else {
    currentCustomerId = null;
    $('view-home').hidden = false;
    $('back-btn').hidden = true;
    $('settings-btn').hidden = false;
    $('lock-btn').hidden = !store.hasPin(state);
    $('title').textContent = state.settings.shopName || 'Kredit Book';
    renderHome();
  }
  window.scrollTo(0, 0);
}

// ---------- PIN pad ----------
// One full-screen keypad handles every PIN step:
//   unlock  - open a locked book
//   verify  - confirm the current PIN before changing or removing it
//   new     - choose a PIN
//   confirm - type the new PIN again

const AUTO_LOCK_MS = 2 * 60 * 1000; // lock after 2 minutes away from the app
const FREE_TRIES = 5; // wrong PINs allowed before a wait

let locked = store.hasPin(state);
let hiddenAt = 0;
const pad = { mode: null, next: null, digits: '', first: '', fails: 0, blockedUntil: 0, busy: false, timer: null };

const PAD_TEXT = {
  unlock: ['Enter your PIN', ''],
  verify: ['Enter your current PIN', ''],
  new: ['Choose a 4-digit PIN', "You'll enter it each time you open Kredit Book."],
  confirm: ['Enter the same PIN again', 'This makes sure you typed it right.'],
};

function padOpen() {
  return !$('view-lock').hidden;
}

function showPad(mode, { next = null } = {}) {
  pad.mode = mode;
  if (next) pad.next = next;
  pad.digits = '';
  const [title, sub] = PAD_TEXT[mode];
  $('lock-title').textContent = title;
  $('lock-sub').textContent = sub;
  $('lock-shop').textContent = mode === 'unlock' ? state.settings.shopName : '';
  $('lock-error').textContent = '';
  $('key-cancel').classList.toggle('invisible', mode === 'unlock');
  $('key-cancel').disabled = mode === 'unlock';
  $('lock-forgot').hidden = mode !== 'unlock';
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  $('view-lock').hidden = false;
  renderDots();
  updateBlocked();
}

function openPad(mode, opts) {
  showPad(mode, opts);
  route();
}

function hidePad() {
  $('view-lock').hidden = true;
  pad.mode = null;
  pad.next = null;
  pad.digits = '';
  pad.first = '';
  clearInterval(pad.timer);
}

function closePad() {
  hidePad();
  route();
}

function lock() {
  if (!store.hasPin(state) || !hasShop()) return;
  locked = true;
  route();
}

function renderDots() {
  [...$('pin-dots').children].forEach((dot, i) => dot.classList.toggle('on', i < pad.digits.length));
  $('pin-count').textContent = pad.digits.length ? `${pad.digits.length} of ${store.PIN_LENGTH} digits entered` : '';
}

function failPad(message) {
  pad.digits = '';
  renderDots();
  $('lock-error').textContent = message;
  const dots = $('pin-dots');
  dots.classList.remove('shake');
  void dots.offsetWidth; // restart the animation
  dots.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate(120);
}

function updateBlocked() {
  clearInterval(pad.timer);
  const tick = () => {
    const left = Math.ceil((pad.blockedUntil - Date.now()) / 1000);
    const blocked = left > 0;
    $('keypad').classList.toggle('disabled', blocked);
    if (blocked) {
      $('lock-error').textContent = `Too many wrong tries. Try again in ${left} second${left === 1 ? '' : 's'}.`;
    } else {
      clearInterval(pad.timer);
      if ($('lock-error').textContent.startsWith('Too many')) $('lock-error').textContent = '';
    }
  };
  tick();
  if (pad.blockedUntil > Date.now()) pad.timer = setInterval(tick, 1000);
}

async function pressDigit(digit) {
  if (pad.busy || Date.now() < pad.blockedUntil || pad.digits.length >= store.PIN_LENGTH) return;
  pad.digits += digit;
  if (!$('lock-error').textContent.startsWith('Too many')) $('lock-error').textContent = '';
  renderDots();
  if (pad.digits.length < store.PIN_LENGTH) return;
  pad.busy = true;
  try {
    await completePin(pad.digits);
  } finally {
    pad.busy = false;
  }
}

function backspace() {
  if (pad.busy) return;
  pad.digits = pad.digits.slice(0, -1);
  renderDots();
}

function cancelPad() {
  if (pad.mode && pad.mode !== 'unlock') closePad();
}

async function completePin(pin) {
  const { mode } = pad;

  if (mode === 'unlock' || mode === 'verify') {
    if (await store.checkPin(state, pin)) {
      pad.fails = 0;
      if (mode === 'unlock') {
        locked = false;
        closePad();
      } else if (pad.next === 'remove') {
        store.clearPin(state);
        save();
        closePad();
        toast('PIN removed');
      } else {
        openPad('new');
      }
      return;
    }
    pad.fails += 1;
    if (pad.fails >= FREE_TRIES) {
      // 30 seconds, then 1 minute, 2 minutes, … for each further wrong try.
      pad.blockedUntil = Date.now() + 30000 * 2 ** (pad.fails - FREE_TRIES);
      failPad('');
      updateBlocked();
    } else {
      const left = FREE_TRIES - pad.fails;
      failPad(pad.fails < 3 ? 'Wrong PIN. Try again.' : `Wrong PIN. ${left} more ${left === 1 ? 'try' : 'tries'} before a short wait.`);
    }
    return;
  }

  if (mode === 'new') {
    const first = pin;
    showPad('confirm');
    pad.first = first;
    return;
  }

  if (mode === 'confirm') {
    if (pin !== pad.first) {
      showPad('new');
      failPad("The PINs didn't match. Choose your PIN again.");
      return;
    }
    const changing = store.hasPin(state);
    await store.setPin(state, pin);
    save();
    closePad();
    toast(changing ? 'PIN changed' : 'PIN set. Kredit Book will ask for it when it opens.');
  }
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ---------- Home ----------

function renderHome() {
  const all = store.customerSummaries(state);
  const list = store.customerSummaries(state, $('search').value);
  const owing = all.filter((c) => c.balance > 0).length;

  $('total-owed').textContent = money(store.totalOwed(state));
  $('total-sub').textContent = all.length
    ? `${owing} of ${all.length} customer${all.length === 1 ? '' : 's'} owe${owing === 1 ? 's' : ''} you`
    : 'No customers yet';

  const ul = $('customer-list');
  ul.replaceChildren(
    ...list.map((c) => {
      const owes = c.balance > 0;
      const amountClass = c.balance > 0 ? 'owes' : c.balance < 0 ? 'paid' : 'zero';
      return el('li', {}, [
        el('button', { class: 'row', onclick: () => go(`#/customer/${c.id}`) }, [
          el('span', { class: `avatar${owes ? ' owes' : ''}`, text: initials(c.name), 'aria-hidden': 'true' }),
          el('span', { class: 'row-main' }, [
            el('div', { class: 'row-title', text: c.name }),
            el('div', { class: 'row-sub', text: relativeDay(c.lastActivity) }),
          ]),
          el('span', {
            class: `row-amount ${amountClass}`,
            text: c.balance < 0 ? `${money(-c.balance)} ahead` : c.balance === 0 ? 'Paid up' : money(c.balance),
          }),
        ]),
      ]);
    })
  );

  const empty = $('empty-home');
  empty.hidden = list.length > 0;
  empty.textContent = all.length
    ? 'No customers match your search.'
    : 'Add your first customer to start tracking who owes you.';
}

// ---------- Customer ----------

function renderCustomer() {
  const c = store.getCustomer(state, currentCustomerId);
  if (!c) return go('#/');
  const balance = store.balanceOf(state, c.id);

  $('title').textContent = c.name;
  $('cust-phone').textContent = c.phone || 'No phone number';
  const card = document.querySelector('.balance-card');
  card.classList.toggle('owes', balance > 0);
  card.classList.toggle('settled', balance <= 0);
  $('cust-balance-label').textContent = balance > 0 ? 'Owes you' : balance < 0 ? 'Paid in advance' : 'All paid up';
  $('cust-balance').textContent = money(Math.abs(balance));

  const wa = store.whatsappLink(state, c.id);
  const sms = store.smsLink(state, c.id);
  for (const [btn, href] of [[$('whatsapp-btn'), wa], [$('sms-btn'), sms]]) {
    if (href) {
      btn.href = href;
      btn.removeAttribute('aria-disabled');
    } else {
      btn.removeAttribute('href');
      btn.setAttribute('aria-disabled', 'true');
    }
  }
  $('no-phone-hint').hidden = Boolean(c.phone);

  const entries = store.entriesFor(state, c.id);
  $('entry-list').replaceChildren(
    ...entries.map((e) => {
      const isCredit = e.type === 'credit';
      return el('li', { class: 'entry-row' }, [
        el('span', { class: 'row-main' }, [
          el('div', { class: 'row-title', text: e.note || (isCredit ? 'Credit' : 'Payment') }),
          el('div', { class: 'row-sub', text: `${shortDate(e.date)} · ${isCredit ? 'Gave credit' : 'Paid'}` }),
        ]),
        el('span', { class: `row-amount ${isCredit ? 'owes' : 'paid'}`, text: `${isCredit ? '+' : '−'}${money(e.amount)}` }),
        el('button', {
          class: 'entry-del',
          'aria-label': 'Delete entry',
          text: '×',
          onclick: () => {
            if (!confirm(`Delete this ${isCredit ? 'credit' : 'payment'} of ${money(e.amount)}?`)) return;
            store.deleteEntry(state, e.id);
            save();
            renderCustomer();
            toast('Entry deleted');
          },
        }),
      ]);
    })
  );
  $('empty-entries').hidden = entries.length > 0;
}

// ---------- Settings ----------

function renderSettings() {
  const f = $('settings-form');
  f.shopName.value = state.settings.shopName;
  f.currency.value = state.settings.currency;
  f.countryCode.value = state.settings.countryCode;

  const on = store.hasPin(state);
  const supported = store.pinSupported();
  $('pin-set-btn').hidden = on || !supported;
  $('pin-on-actions').hidden = !on;
  $('pin-status').textContent = !supported
    ? 'App lock only works when Kredit Book is opened from its https:// link.'
    : on
      ? 'On. Kredit Book asks for your PIN when it opens, and again after 2 minutes away from the app.'
      : "Ask for a 4-digit PIN when the app opens, so people at the counter can't see who owes what.";
}

// ---------- Dialogs ----------

function openCustomerDialog(customer = null) {
  if (!hasShop() || locked) return route();
  editingCustomerId = customer ? customer.id : null;
  const f = $('customer-form');
  $('customer-dialog-title').textContent = customer ? 'Edit customer' : 'New customer';
  f.name.value = customer ? customer.name : '';
  f.phone.value = customer ? customer.phone : '';
  $('customer-dialog').showModal();
  f.name.focus();
}

function openEntryDialog(type) {
  entryType = type;
  const f = $('entry-form');
  $('entry-dialog-title').textContent = type === 'credit' ? 'Gave credit' : 'Got paid';
  $('entry-submit').className = `btn ${type === 'credit' ? 'btn-credit' : 'btn-payment'}`;
  f.amount.value = '';
  f.note.value = '';
  f.date.value = todayInput();
  f.date.max = todayInput();
  $('entry-error').hidden = true;
  $('entry-dialog').showModal();
  f.amount.focus();
}

// ---------- Events ----------

$('back-btn').addEventListener('click', () => go('#/'));
$('settings-btn').addEventListener('click', () => go('#/settings'));
$('search').addEventListener('input', renderHome);
$('add-customer-btn').addEventListener('click', () => openCustomerDialog());
$('add-credit-btn').addEventListener('click', () => openEntryDialog('credit'));
$('add-payment-btn').addEventListener('click', () => openEntryDialog('payment'));
$('edit-customer-btn').addEventListener('click', () => openCustomerDialog(store.getCustomer(state, currentCustomerId)));

$('delete-customer-btn').addEventListener('click', () => {
  const c = store.getCustomer(state, currentCustomerId);
  if (!c) return;
  if (!confirm(`Delete ${c.name} and all their history? This cannot be undone.`)) return;
  store.deleteCustomer(state, c.id);
  save();
  toast(`${c.name} deleted`);
  go('#/');
});

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

$('customer-form').addEventListener('submit', (ev) => {
  const f = ev.target;
  try {
    if (editingCustomerId) {
      store.updateCustomer(state, editingCustomerId, { name: f.name.value, phone: f.phone.value });
      save();
      renderCustomer();
      toast('Customer updated');
    } else {
      const c = store.addCustomer(state, { name: f.name.value, phone: f.phone.value });
      save();
      $('search').value = '';
      go(`#/customer/${c.id}`);
      toast(`${c.name} added`);
    }
  } catch (err) {
    ev.preventDefault();
    toast(err.message);
  }
});

$('entry-form').addEventListener('submit', (ev) => {
  const f = ev.target;
  const amount = store.parseAmount(f.amount.value);
  if (!amount) {
    ev.preventDefault();
    $('entry-error').textContent = 'Enter an amount like 25 or 25.50';
    $('entry-error').hidden = false;
    f.amount.focus();
    return;
  }
  store.addEntry(state, {
    customerId: currentCustomerId,
    type: entryType,
    amount,
    note: f.note.value,
    date: dateFromInput(f.date.value),
  });
  save();
  renderCustomer();
  toast(`${entryType === 'credit' ? 'Credit' : 'Payment'} of ${money(amount)} saved`);
});

$('welcome-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $('welcome-shop');
  const name = input.value.trim();
  if (!name) {
    $('welcome-error').hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  state.settings.shopName = name;
  save();
  input.value = '';
  go('#/');
  toast(`Welcome, ${name}! Add your first customer.`);
});

$('welcome-shop').addEventListener('input', () => {
  $('welcome-error').hidden = true;
  $('welcome-shop').removeAttribute('aria-invalid');
});

$('settings-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (!f.shopName.value.trim()) {
    toast('Your shop needs a name');
    f.shopName.focus();
    return;
  }
  state.settings.shopName = f.shopName.value.trim();
  state.settings.currency = f.currency.value.trim() || 'R';
  state.settings.countryCode = f.countryCode.value.replace(/\D/g, '') || '27';
  save();
  toast('Settings saved');
  go('#/');
});

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([store.exportBackup(state)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kredit-book-backup-${todayInput()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
});

// keepPin: restoring from Settings keeps this phone's PIN. Restoring from
// "Forgot PIN?" removes it, so the owner can get back into their book.
async function restoreFrom(ev, { keepPin = true } = {}) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const next = store.importBackup(await file.text());
    if (!confirm(`Restore ${next.customers.length} customers from this backup? This replaces everything currently on this phone.`)) return;
    if (keepPin) store.copyPin(state, next);
    state = next;
    save();
    if (!keepPin) {
      locked = false;
      pad.fails = 0;
      pad.blockedUntil = 0;
      $('forgot-dialog').close();
      hidePad();
    }
    go('#/');
    if (!hasShop()) toast('Backup restored. Now enter your shop name.');
    else toast(keepPin ? 'Backup restored' : 'Backup restored. The PIN was removed; you can set a new one in Settings.');
  } catch {
    toast('That file is not a Kredit Book backup');
  }
}
$('import-input').addEventListener('change', (ev) => restoreFrom(ev));
$('welcome-import').addEventListener('change', (ev) => restoreFrom(ev));
$('forgot-import').addEventListener('change', (ev) => restoreFrom(ev, { keepPin: false }));

// ---------- PIN events ----------

$('keypad').addEventListener('click', (ev) => {
  const key = ev.target.closest('.key');
  if (!key) return;
  if (key.dataset.digit) pressDigit(key.dataset.digit);
  else if (key.id === 'key-back') backspace();
  else if (key.id === 'key-cancel') cancelPad();
});

document.addEventListener('keydown', (ev) => {
  if (!padOpen() || document.querySelector('dialog[open]')) return;
  if (/^\d$/.test(ev.key)) {
    ev.preventDefault();
    pressDigit(ev.key);
  } else if (ev.key === 'Backspace') {
    ev.preventDefault();
    backspace();
  } else if (ev.key === 'Escape') {
    cancelPad();
  }
});

$('pin-set-btn').addEventListener('click', () => openPad('new'));
$('pin-change-btn').addEventListener('click', () => openPad('verify', { next: 'change' }));
$('pin-remove-btn').addEventListener('click', () => openPad('verify', { next: 'remove' }));
$('lock-btn').addEventListener('click', lock);
$('lock-forgot').addEventListener('click', () => $('forgot-dialog').showModal());

$('forgot-erase-btn').addEventListener('click', () => {
  if (!confirm('Erase every customer and payment on this phone? This cannot be undone.')) return;
  state = store.emptyState();
  save();
  locked = false;
  pad.fails = 0;
  pad.blockedUntil = 0;
  $('forgot-dialog').close();
  hidePad();
  go('#/');
});

// Lock again when the owner comes back after being away for a while.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
  } else if (hiddenAt && Date.now() - hiddenAt >= AUTO_LOCK_MS) {
    hiddenAt = 0;
    lock();
  }
});

// Keep multiple tabs in sync.
window.addEventListener('storage', (ev) => {
  if (ev.key === store.STORAGE_KEY) {
    state = store.loadState();
    route();
  }
});

window.addEventListener('hashchange', route);
route();

// Offline support.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
