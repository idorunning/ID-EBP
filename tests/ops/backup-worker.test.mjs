import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from 'node:crypto';
import worker from '../../ops/backup-worker/worker.js';

test('paged export is assembled into one verified, encrypted idebp-backup-v1 file', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const data = { 'public.sources': Array.from({ length: 134 }, (_, i) => ({ id: i })),
    'public.research_records': Array.from({ length: 17090 }, (_, i) => ({ id: `R${String(i).padStart(5, '0')}` })) };
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (body.op === 'tables') return Response.json({ tables: Object.keys(data).map(table => ({ table, columns: [{ name: 'id' }], key: ['id'] })) });
    const rows = data[body.table], start = body.after ? rows.findIndex(r => String(r.id) === body.after[0]) + 1 : 0;
    const page = rows.slice(start, start + body.limit);
    const lines = page.map(r => JSON.stringify({ kind: 'row', t: body.table, r }));
    lines.push(JSON.stringify({ kind: 'page', table: body.table, n: page.length, next: page.length === body.limit ? [String(page.at(-1).id)] : null }));
    return new Response(lines.join('\n') + '\n');
  };
  const store = new Map(), mail = [];
  const env = { EXPORT_TOKEN: 'x'.repeat(40), PUBLIC_KEY: publicKey, EMAIL: { send: async m => mail.push(m.subject) },
    BACKUPS: { put: async (k, v) => store.set(k, typeof v === 'string' ? v : new Uint8Array(v)),
      get: async k => store.has(k) ? { arrayBuffer: async () => store.get(k).buffer ?? store.get(k), json: async () => JSON.parse(store.get(k)) } : null,
      list: async () => ({ objects: [] }) } };
  await worker.scheduled({ scheduledTime: Date.parse('2026-11-21T02:23:00Z') }, env, { waitUntil() {} });
  assert.deepEqual(mail, []);
  const manifest = JSON.parse(store.get('latest.json'));
  assert.deepEqual(manifest.counts, { 'public.sources': 134, 'public.research_records': 17090 });
  assert.ok(calls.filter(c => c.table === 'public.research_records').length === 9);
  const blob = Buffer.from(store.get('daily/2026-11-21.idebp.enc'));
  assert.equal(blob.subarray(0, 8).toString(), 'IDEBPBK1');
  const len = blob.readUInt32BE(8), wrapped = blob.subarray(12, 12 + len), iv = blob.subarray(12 + len, 24 + len), ct = blob.subarray(24 + len);
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
  const d = createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(ct.subarray(ct.length - 16));
  const lines = gunzipSync(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])).toString().trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].kind, 'header'); assert.equal(lines.at(-1).kind, 'footer');
  assert.equal(lines.filter(l => l.kind === 'row').length, 17224);
});
