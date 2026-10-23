// Kredit Book data layer.
// Pure functions operate on a plain `state` object so they are easy to test.
// Money is always stored as whole cents (integers) to avoid rounding errors.

export const STORAGE_KEY = 'kredit-book:v1';
export const SCHEMA_VERSION = 1;

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: { shopName: '', currency: 'R', countryCode: '27' },
    customers: [],
    entries: [],
  };
}

export function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Money ----------

/** Parse user input like "12", "12.5", "12,50", "R 1 200.00" into cents. Returns null if invalid. */
export function parseAmount(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/^[^\d.,-]+/, '').replace(/\s/g, '');
  if (!s) return null;
  // Treat a single comma as a decimal separator when there is no dot (common in ZA).
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return cents > 0 ? cents : null;
}

/** Format cents as "R1 234.50". */
export function formatMoney(cents, currency = 'R') {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${currency}${whole}.${frac}`;
}

// ---------- Phone ----------

/** Convert a local number like "082 123 4567" into international digits "27821234567". */
export function toInternational(phone, countryCode = '27') {
  if (!phone) return '';
  let digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return digits;
}

// ---------- Customers ----------

export function addCustomer(state, { name, phone = '' }) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Customer name is required');
  const customer = { id: uid(), name: clean, phone: String(phone).trim(), createdAt: new Date().toISOString() };
  state.customers.push(customer);
  return customer;
}

export function updateCustomer(state, id, { name, phone }) {
  const c = getCustomer(state, id);
  if (!c) throw new Error('Customer not found');
  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) throw new Error('Customer name is required');
    c.name = clean;
  }
  if (phone !== undefined) c.phone = String(phone).trim();
  return c;
}

export function deleteCustomer(state, id) {
  state.customers = state.customers.filter((c) => c.id !== id);
  state.entries = state.entries.filter((e) => e.customerId !== id);
}

export function getCustomer(state, id) {
  return state.customers.find((c) => c.id === id) || null;
}

// ---------- Entries ----------

/** type: 'credit' (customer took goods on credit) or 'payment' (customer paid back). */
export function addEntry(state, { customerId, type, amount, note = '', date }) {
  if (!getCustomer(state, customerId)) throw new Error('Customer not found');
  if (type !== 'credit' && type !== 'payment') throw new Error('Invalid entry type');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be more than zero');
  const entry = {
    id: uid(),
    customerId,
    type,
    amount,
    note: String(note).trim(),
    date: date || new Date().toISOString(),
  };
  state.entries.push(entry);
  return entry;
}

export function deleteEntry(state, id) {
  state.entries = state.entries.filter((e) => e.id !== id);
}

export function entriesFor(state, customerId) {
  return state.entries
    .filter((e) => e.customerId === customerId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Positive balance = customer owes the shop. */
export function balanceOf(state, customerId) {
  return state.entries.reduce((sum, e) => {
    if (e.customerId !== customerId) return sum;
    return sum + (e.type === 'credit' ? e.amount : -e.amount);
  }, 0);
}

export function totalOwed(state) {
  return state.customers.reduce((sum, c) => sum + Math.max(0, balanceOf(state, c.id)), 0);
}

export function lastActivity(state, customerId) {
  let latest = null;
  for (const e of state.entries) {
    if (e.customerId === customerId && (!latest || e.date > latest)) latest = e.date;
  }
  return latest;
}

/** Customers with balances, sorted: biggest debts first, then settled customers by name. */
export function customerSummaries(state, query = '') {
  const q = query.trim().toLowerCase();
  return state.customers
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
    .map((c) => ({ ...c, balance: balanceOf(state, c.id), lastActivity: lastActivity(state, c.id) }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

// ---------- Reminders ----------

export function reminderMessage(state, customerId) {
  const c = getCustomer(state, customerId);
  if (!c) return '';
  const { shopName, currency } = state.settings;
  const shop = shopName || 'the shop';
  const firstName = c.name.split(/\s+/)[0];
  const balance = balanceOf(state, customerId);
  if (balance <= 0) {
    return `Hi ${firstName}, thank you! Your account at ${shop} is fully paid up.`;
  }
  return `Hi ${firstName}, this is a friendly reminder that your balance at ${shop} is ${formatMoney(balance, currency)}. Thank you!`;
}

export function whatsappLink(state, customerId) {
  const c = getCustomer(state, customerId);
  if (!c || !c.phone) return '';
  const number = toInternational(c.phone, state.settings.countryCode);
  return `https://wa.me/${number}?text=${encodeURIComponent(reminderMessage(state, customerId))}`;
}

export function smsLink(state, customerId) {
  const c = getCustomer(state, customerId);
  if (!c || !c.phone) return '';
  const number = '+' + toInternational(c.phone, state.settings.countryCode);
  return `sms:${number}?body=${encodeURIComponent(reminderMessage(state, customerId))}`;
}

// ---------- Persistence & backup ----------

/** Validate and normalise data loaded from storage or a backup file. Throws on bad data. */
export function normalise(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Kredit Book backup');
  if (!Array.isArray(raw.customers) || !Array.isArray(raw.entries)) throw new Error('Not a Kredit Book backup');
  const base = emptyState();
  const customers = raw.customers
    .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((c) => ({ id: c.id, name: c.name, phone: String(c.phone || ''), createdAt: c.createdAt || new Date().toISOString() }));
  const ids = new Set(customers.map((c) => c.id));
  const entries = raw.entries
    .filter(
      (e) =>
        e && ids.has(e.customerId) && (e.type === 'credit' || e.type === 'payment') &&
        Number.isInteger(e.amount) && e.amount > 0
    )
    .map((e) => ({ id: String(e.id || uid()), customerId: e.customerId, type: e.type, amount: e.amount, note: String(e.note || ''), date: e.date || new Date().toISOString() }));
  return {
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...(raw.settings || {}) },
    customers,
    entries,
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const text = storage && storage.getItem(STORAGE_KEY);
    return text ? normalise(JSON.parse(text)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportBackup(state) {
  return JSON.stringify({ app: 'kredit-book', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importBackup(text) {
  return normalise(JSON.parse(text));
}
