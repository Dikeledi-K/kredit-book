// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../js/store.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

test('parseAmount handles common inputs', () => {
  assert.equal(s.parseAmount('12'), 1200);
  assert.equal(s.parseAmount('12.5'), 1250);
  assert.equal(s.parseAmount('12,50'), 1250);
  assert.equal(s.parseAmount('R 1 200.00'), 120000);
  assert.equal(s.parseAmount('0.99'), 99);
  assert.equal(s.parseAmount('0'), null);
  assert.equal(s.parseAmount('-5'), null);
  assert.equal(s.parseAmount('abc'), null);
  assert.equal(s.parseAmount('1.234'), null);
  assert.equal(s.parseAmount(''), null);
});

test('formatMoney formats cents', () => {
  assert.equal(s.formatMoney(0), 'R0.00');
  assert.equal(s.formatMoney(24000), 'R240.00');
  assert.equal(s.formatMoney(123456), 'R1 234.56');
  assert.equal(s.formatMoney(-500), '-R5.00');
});

test('toInternational converts local numbers', () => {
  assert.equal(s.toInternational('082 123 4567'), '27821234567');
  assert.equal(s.toInternational('+27 82 123 4567'), '27821234567');
  assert.equal(s.toInternational('0027821234567'), '27821234567');
  assert.equal(s.toInternational('0712345678', '254'), '254712345678');
});

test('balances, totals and sorting', () => {
  const st = s.emptyState();
  const a = s.addCustomer(st, { name: 'Thabo Mokoena', phone: '0821234567' });
  const b = s.addCustomer(st, { name: 'Ayesha' });
  const c = s.addCustomer(st, { name: 'Bongani' });
  s.addEntry(st, { customerId: a.id, type: 'credit', amount: 30000 });
  s.addEntry(st, { customerId: a.id, type: 'payment', amount: 6000 });
  s.addEntry(st, { customerId: b.id, type: 'credit', amount: 5000 });
  s.addEntry(st, { customerId: c.id, type: 'credit', amount: 1000 });
  s.addEntry(st, { customerId: c.id, type: 'payment', amount: 2000 }); // overpaid
  assert.equal(s.balanceOf(st, a.id), 24000);
  assert.equal(s.balanceOf(st, c.id), -1000);
  assert.equal(s.totalOwed(st), 29000); // overpayment is not subtracted from the total owed
  assert.deepEqual(s.customerSummaries(st).map((x) => x.name), ['Thabo Mokoena', 'Ayesha', 'Bongani']);
  assert.deepEqual(s.customerSummaries(st, 'tha').map((x) => x.name), ['Thabo Mokoena']);
  assert.deepEqual(s.customerSummaries(st, '082 123').map((x) => x.name), ['Thabo Mokoena']);
});

test('validation errors', () => {
  const st = s.emptyState();
  assert.throws(() => s.addCustomer(st, { name: '  ' }));
  const a = s.addCustomer(st, { name: 'X' });
  assert.throws(() => s.addEntry(st, { customerId: a.id, type: 'credit', amount: 0 }));
  assert.throws(() => s.addEntry(st, { customerId: a.id, type: 'gift', amount: 100 }));
  assert.throws(() => s.addEntry(st, { customerId: 'nope', type: 'credit', amount: 100 }));
});

test('deleting a customer removes their entries', () => {
  const st = s.emptyState();
  const a = s.addCustomer(st, { name: 'A' });
  s.addEntry(st, { customerId: a.id, type: 'credit', amount: 100 });
  s.deleteCustomer(st, a.id);
  assert.equal(st.customers.length, 0);
  assert.equal(st.entries.length, 0);
});

test('reminders and links', () => {
  const st = s.emptyState();
  st.settings.shopName = "Mama's Shop";
  const a = s.addCustomer(st, { name: 'Thabo Mokoena', phone: '082 123 4567' });
  s.addEntry(st, { customerId: a.id, type: 'credit', amount: 24000 });
  const msg = s.reminderMessage(st, a.id);
  assert.match(msg, /Hi Thabo/);
  assert.match(msg, /Mama's Shop/);
  assert.match(msg, /R240\.00/);
  assert.ok(s.whatsappLink(st, a.id).startsWith('https://wa.me/27821234567?text='));
  assert.ok(s.smsLink(st, a.id).startsWith('sms:+27821234567?body='));
  const b = s.addCustomer(st, { name: 'NoPhone' });
  assert.equal(s.whatsappLink(st, b.id), '');
});

test('save/load round trip and backup import', () => {
  const st = s.emptyState();
  const a = s.addCustomer(st, { name: 'A' });
  s.addEntry(st, { customerId: a.id, type: 'credit', amount: 500 });
  const storage = memoryStorage();
  s.saveState(st, storage);
  assert.deepEqual(s.loadState(storage), st);
  const restored = s.importBackup(s.exportBackup(st));
  assert.equal(s.balanceOf(restored, a.id), 500);
  assert.throws(() => s.importBackup('{"hello":1}'));
  assert.deepEqual(s.loadState(memoryStorage()), s.emptyState());
});
