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

function route() {
  const hash = location.hash || '#/';
  const [, view, id] = hash.split('/');
  for (const v of document.querySelectorAll('.view')) v.hidden = true;

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
    $('title').textContent = state.settings.shopName || 'Kredit Book';
    renderHome();
  }
  window.scrollTo(0, 0);
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
}

// ---------- Dialogs ----------

function openCustomerDialog(customer = null) {
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

$('settings-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
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

$('import-input').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const next = store.importBackup(await file.text());
    if (!confirm(`Restore ${next.customers.length} customers from this backup? This replaces everything currently on this phone.`)) return;
    state = next;
    save();
    toast('Backup restored');
    go('#/');
  } catch {
    toast('That file is not a Kredit Book backup');
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

// First run: ask for the shop name so reminders sound personal.
if (!state.settings.shopName && state.customers.length === 0 && !location.hash) {
  go('#/settings');
  toast('Welcome! Start by adding your shop name.');
}

// Offline support.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
