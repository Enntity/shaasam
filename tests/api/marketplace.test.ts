import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { jsonRequest } from '@/tests/helpers';
const mocks = vi.hoisted(() => ({ session: null as any, intents: new Map<string, any>(), checkout: new Map<string, any>(), create: vi.fn(), capture: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionUser: async () => mocks.session }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({
  accounts: { retrieve: async () => ({ payouts_enabled: true, capabilities: { transfers: 'active' } }) },
  paymentIntents: {
    create: async (data: any, options: any) => { mocks.create(data, options); const id = `pi_${options.idempotencyKey}`; if (!mocks.intents.has(id)) mocks.intents.set(id, { ...data, id, client_secret: 'test-only', status: 'requires_payment_method', latest_charge: null }); return mocks.intents.get(id); },
    retrieve: async (id: string) => structuredClone(mocks.intents.get(id)),
    capture: async (id: string, data: any, opts: any) => { mocks.capture(id, data, opts); const pi = mocks.intents.get(id); pi.status = 'succeeded'; return pi; },
    cancel: async (id: string, data: any, opts: any) => { mocks.cancel(id, data, opts); const pi = mocks.intents.get(id); pi.status = 'canceled'; return pi; },
  },
  checkout: { sessions: {
    create: async (data: any, opts: any) => { const id = `cs_${opts.idempotencyKey}`; mocks.checkout.set(id, { id, url: 'https://checkout.stripe.com/test', status: 'open', metadata: data.metadata, payment_intent: null, data }); return mocks.checkout.get(id); },
    retrieve: async (id: string) => mocks.checkout.get(id),
    expire: async (id: string) => { mocks.checkout.get(id).status = 'expired'; },
  } },
  webhooks: { constructEvent: (payload: string, signature: string) => { if (signature !== 'valid') throw new Error(); return JSON.parse(payload); } },
}) }));
import { POST as postTask, GET as listTasks } from '@/app/api/requests/route';
import { GET as getTask } from '@/app/api/requests/[id]/route';
import { POST as act } from '@/app/api/humans/requests/[id]/route';
import { POST as fund } from '@/app/api/payments/intent/route';
import { POST as checkout } from '@/app/api/payments/checkout/route';
import { POST as capture } from '@/app/api/payments/capture/route';
import { POST as cancel } from '@/app/api/payments/cancel/route';
import { GET as getPayment } from '@/app/api/payments/[id]/route';
import { POST as resolveReport } from '@/app/api/admin/requests/[id]/resolve/route';
import { POST as webhook } from '@/app/api/webhooks/stripe/route';
const base = { title: 'Try a signup', description: 'Use the public demo.', acceptanceCriteria: 'A report of confusing steps.', budgetCents: 1500, durationMinutes: 15, skills: [] };
const req = (path: string, body: any, key = 'test-api-key', idem = 'task-one') => jsonRequest(`http://test${path}`, body, { headers: { authorization: `Bearer ${key}`, 'idempotency-key': idem } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path: string, key = 'test-api-key') => new Request(`http://test${path}`, { headers: { authorization: `Bearer ${key}` } });
afterEach(() => { vi.unstubAllEnvs(); mocks.session = null; mocks.intents.clear(); mocks.checkout.clear(); vi.clearAllMocks(); });
async function setup() {
  const created = await postTask(req('/api/requests', base));
  expect(created.status).toBe(200);
  const task = await created.json();
  const db = await getDb();
  const humanId = new ObjectId();
  await db.collection('users').insertOne({ _id: humanId, phone: `+1${humanId}`, verified: true, status: 'active', reviewStatus: 'approved', alias: 'helper', stripeAccountId: 'acct_test', skillsNormalized: [] });
  mocks.session = { id: humanId.toString() };
  expect((await act(req('/action', { action: 'accept' }), params(task.id))).status).toBe(200);
  return task;
}
async function funded() {
  const task = await setup();
  const res = await fund(req('/api/payments/intent', { requestId: task.id }));
  expect(res.status).toBe(200);
  const payment = await res.json();
  const pi = mocks.intents.get(payment.stripePaymentIntentId);
  pi.status = 'requires_capture';
  pi.latest_charge = { amount_refunded: 0, payment_method_details: { card: { capture_before: Math.floor(Date.now()/1000) + 3 * 86400 } } };
  return { task, payment };
}
describe('marketplace boundaries', () => {
  it('fails closed without keys', async () => { vi.stubEnv('SHAASAM_API_KEY', ''); expect((await postTask(req('/api/requests', base))).status).toBe(401); });
  it('creates exactly one task for concurrent retries and rejects changed inputs', async () => {
    const replies = await Promise.all(Array.from({ length: 8 }, () => postTask(req('/api/requests', base))));
    expect(replies.every(r => r.status === 200)).toBe(true);
    expect(await (await getDb()).collection('requests').countDocuments()).toBe(1);
    expect((await postTask(req('/api/requests', { ...base, budgetCents: 3000 }))).status).toBe(409);
  });
  it.each([0, -1, 1.5, 100001, '1500', null])('rejects invalid money %s', async budgetCents => { expect((await postTask(req('/api/requests', { ...base, budgetCents }))).status).toBe(400); });
  it('rejects callbacks, unknown skills, malformed JSON, oversized input and missing criteria', async () => {
    expect((await postTask(req('/api/requests', { ...base, callbackUrl: 'http://169.254.169.254' }))).status).toBe(400);
    expect((await postTask(req('/api/requests', { ...base, skills: ['invented'] }))).status).toBe(400);
    expect((await postTask(req('/api/requests', { ...base, acceptanceCriteria: '' }))).status).toBe(400);
    expect((await postTask(req('/api/requests', { ...base, description: 'x'.repeat(17000) }))).status).toBe(413);
    expect((await postTask(new Request('http://test/api/requests', { method: 'POST', headers: { 'x-api-key': 'test-api-key', 'content-type': 'application/json' }, body: '{' }))).status).toBe(400);
  });
  it('isolates agent requests, payments, capture and cancel', async () => {
    const { task, payment } = await funded();
    vi.stubEnv('SHAASAM_AGENT_KEYS', JSON.stringify({ legacy: 'test-api-key', other: 'other-key' }));
    expect((await getTask(get('/task', 'other-key'), params(task.id))).status).toBe(404);
    expect((await (await listTasks(get('/api/requests', 'other-key'))).json()).data).toEqual([]);
    expect((await getPayment(get('/payment', 'other-key'), params(payment.id))).status).toBe(404);
    expect((await capture(req('/capture', { paymentId: payment.id }, 'other-key'))).status).toBe(404);
    expect((await cancel(req('/cancel', { paymentId: payment.id }, 'other-key'))).status).toBe(404);
    expect(mocks.capture).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('does not allow unfunded work, early completion, or arbitrary payment amounts/recipients', async () => {
    const task = await setup();
    expect((await act(req('/action', { action: 'start' }), params(task.id))).status).toBe(409);
    expect((await act(req('/action', { action: 'complete', result: 'Done' }), params(task.id))).status).toBe(409);
    expect((await fund(req('/fund', { requestId: task.id, amount: 100 }))).status).toBe(400);
    expect((await fund(req('/fund', { requestId: task.id, humanId: new ObjectId().toString() }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('reuses one payment and rejects switching payment modes', async () => {
    const task = await setup();
    const a = await fund(req('/fund', { requestId: task.id }));
    const b = await fund(req('/fund', { requestId: task.id }));
    expect((await a.json()).id).toBe((await b.json()).id);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect((await checkout(req('/checkout', { requestId: task.id }))).status).toBe(409);
  });
  it('returns a hosted checkout link without calling it funded', async () => {
    const task = await setup();
    const res = await checkout(req('/checkout', { requestId: task.id }));
    const body = await res.json();
    expect(res.status).toBe(200); expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test'); expect(body.status).toBe('awaiting_payment');
    expect((await act(req('/action', { action: 'start' }), params(task.id))).status).toBe(409);
  });
  it('enforces work, result, and full capture; retries do not recapture', async () => {
    const { task, payment } = await funded();
    expect((await capture(req('/capture', { paymentId: payment.id }))).status).toBe(409);
    expect((await act(req('/action', { action: 'start' }), params(task.id))).status).toBe(200);
    expect((await cancel(req('/cancel', { paymentId: payment.id }))).status).toBe(409);
    expect((await act(req('/action', { action: 'complete' }), params(task.id))).status).toBe(400);
    expect((await act(req('/action', { action: 'complete', result: 'Screen two had an unlabeled button.' }), params(task.id))).status).toBe(200);
    expect((await capture(req('/capture', { paymentId: payment.id, amount: 100 }))).status).toBe(400);
    expect((await capture(req('/capture', { paymentId: payment.id }))).status).toBe(200);
    expect((await capture(req('/capture', { paymentId: payment.id }))).status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture.mock.calls[0][2].idempotencyKey).toContain(payment.id);
  });
  it('blocks settlement on a reported task', async () => {
    const { task, payment } = await funded();
    expect((await act(req('/action', { action: 'report', reason: 'Unsafe instructions' }), params(task.id))).status).toBe(200);
    expect((await cancel(req('/cancel', { paymentId: payment.id }))).status).toBe(409);
    expect((await act(req('/action', { action: 'start' }), params(task.id))).status).toBe(409);
  });
  it('resolves reports with an immutable history and an admin boundary', async () => {
    const { task } = await funded();
    await act(req('/action', { action: 'report', reason: 'Need clarification' }), params(task.id));
    expect((await resolveReport(req('/resolve', { resolution: 'Resolved' }), params(task.id))).status).toBe(401);
    const res = await resolveReport(jsonRequest('http://test/resolve', { resolution: 'Both parties agreed on the original brief.' }, { headers: { 'x-admin-key': 'test-admin-key' } }), params(task.id));
    expect(res.status).toBe(200);
    const saved = await (await getDb()).collection('requests').findOne({ _id: new ObjectId(task.id) });
    expect(saved?.reportedAt).toBeUndefined(); expect(saved?.reportHistory[0].reason).toBe('Need clarification');
    expect(saved?.reportHistory[0].resolution).toBe('Both parties agreed on the original brief.');
  });
  it('serializes cancellation against starting work', async () => {
    const { task, payment } = await funded();
    const [start, stop] = await Promise.all([act(req('/action', { action: 'start' }), params(task.id)), cancel(req('/cancel', { paymentId: payment.id }))]);
    expect([start.status, stop.status].sort()).toEqual([200, 409]);
    if (start.status === 200) expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('reserves one payment under concurrent retries', async () => {
    const task = await setup();
    const responses = await Promise.all(Array.from({ length: 4 }, () => fund(req('/fund', { requestId: task.id }))));
    expect(responses.every(r => r.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(new Set(bodies.map(b => b.id)).size).toBe(1);
    expect(await (await getDb()).collection('payments').countDocuments()).toBe(1);
    expect(new Set(mocks.create.mock.calls.map(c => c[1].idempotencyKey)).size).toBe(1);
  });
  it('repairs an early webhook before the provider ID is persisted', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-only');
    const { payment } = await funded(); const pi = mocks.intents.get(payment.stripePaymentIntentId);
    const db = await getDb();
    await db.collection('payments').updateOne({ _id: new ObjectId(payment.id) }, { $unset: { stripePaymentIntentId: '' }, $set: { status: 'creating' } });
    const event = { id: 'evt_early', type: 'payment_intent.amount_capturable_updated', data: { object: { id: pi.id, metadata: pi.metadata } } };
    expect((await webhook(jsonRequest('http://test/webhook', event, { headers: { 'stripe-signature': 'valid' } }))).status).toBe(200);
    const saved = await db.collection('payments').findOne({ _id: new ObjectId(payment.id) });
    expect(saved?.stripePaymentIntentId).toBe(pi.id); expect(saved?.status).toBe('requires_capture');
  });
  it('rejects a soon-expiring authorization', async () => {
    const { task, payment } = await funded();
    mocks.intents.get(payment.stripePaymentIntentId).latest_charge.payment_method_details.card.capture_before = Math.floor(Date.now()/1000) + 60;
    expect((await act(req('/action', { action: 'start' }), params(task.id))).status).toBe(409);
  });
  it('allows only one human to claim and only the assignee to submit', async () => {
    const { task } = await funded();
    const db = await getDb(); const other = new ObjectId();
    await db.collection('users').insertOne({ _id: other, phone: '+19990001111', verified: true, status: 'active', alias: 'other', stripeAccountId: 'acct_other' });
    mocks.session = { id: other.toString() };
    expect((await act(req('/action', { action: 'accept' }), params(task.id))).status).toBe(409);
    expect((await act(req('/action', { action: 'complete', result: 'Stolen result' }), params(task.id))).status).toBe(404);
  });
  it('rejects invalid webhooks and ignores stale event status', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-only');
    const { payment } = await funded(); const pi = mocks.intents.get(payment.stripePaymentIntentId); pi.status = 'succeeded';
    const body = { id: 'evt_test', type: 'payment_intent.processing', data: { object: { id: pi.id, metadata: pi.metadata, status: 'processing' } } };
    expect((await webhook(jsonRequest('http://test/webhook', body))).status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await webhook(jsonRequest('http://test/webhook', body, { headers: { 'stripe-signature': 'valid' } }))).status).toBe(200);
    const db = await getDb(); expect((await db.collection('payments').findOne({ _id: new ObjectId(payment.id) }))?.status).toBe('succeeded');
    expect(await db.collection('stripe_events').countDocuments()).toBe(1);
  });
  it('reconciles an expired checkout and retries cancellation without calling expire again', async () => {
    const task = await setup();
    const payment = await (await checkout(req('/checkout', { requestId: task.id }))).json();
    const session = [...mocks.checkout.values()][0]; session.status = 'expired';
    const result = await (await getPayment(get('/payment'), params(payment.id))).json();
    expect(result.status).toBe('canceled'); expect(result.checkoutUrl).toBeNull();
    expect((await cancel(req('/cancel', { paymentId: payment.id }))).status).toBe(200);
    expect((await cancel(req('/cancel', { paymentId: payment.id }))).status).toBe(200);
    expect((await (await getDb()).collection('requests').findOne({ _id: new ObjectId(task.id) }))?.status).toBe('canceled');
  });
  it('cancels an open checkout and records expiry webhook state', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-only');
    const task = await setup();
    const payment = await (await checkout(req('/checkout', { requestId: task.id }))).json();
    expect((await cancel(req('/cancel', { paymentId: payment.id }))).status).toBe(200);
    const session = [...mocks.checkout.values()][0];
    const event = { id: 'evt_expiry', type: 'checkout.session.expired', data: { object: session } };
    expect((await webhook(jsonRequest('http://test/webhook', event, { headers: { 'stripe-signature': 'valid' } }))).status).toBe(200);
    expect((await (await getDb()).collection('payments').findOne({ _id: new ObjectId(payment.id) }))?.status).toBe('canceled');
  });
  it('reflects partial and full refunds without allowing recapture', async () => {
    const { payment } = await funded(); const pi = mocks.intents.get(payment.stripePaymentIntentId);
    pi.status = 'succeeded'; pi.latest_charge.amount_refunded = 500;
    const partial = await (await getPayment(get('/payment'), params(payment.id))).json();
    expect(partial.status).toBe('succeeded'); expect(partial.refundedCents).toBe(500);
    pi.latest_charge.amount_refunded = 1500;
    const full = await (await getPayment(get('/payment'), params(payment.id))).json();
    expect(full.status).toBe('refunded');
    expect((await capture(req('/capture', { paymentId: payment.id }))).status).toBe(409);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it('rejects changed provider metadata or fees before settlement', async () => {
    const { payment } = await funded(); const pi = mocks.intents.get(payment.stripePaymentIntentId);
    pi.metadata.ownerId = 'wrong-owner';
    expect((await getPayment(get('/payment'), params(payment.id))).status).toBe(409);
    pi.metadata.ownerId = 'legacy'; pi.application_fee_amount = 100;
    expect((await getPayment(get('/payment'), params(payment.id))).status).toBe(409);
  });

});
