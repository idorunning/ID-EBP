// idebp-backup — nightly off-site encrypted backup of the ID-EBP database.
// 1. POSTs to the Supabase backup-export function (read-only, snapshot-consistent JSON Lines).
// 2. gzips the stream, encrypts it (AES-256-GCM; the AES key is wrapped with an RSA-4096
//    public key — only Nathan holds the private key), writes it to R2 bucket idebp-backups.
// 3. Re-reads the object and checks its SHA-256; writes an unencrypted manifest (row counts only).
// 4. Emails hello@thinkingaboutpolicing.org on any failure, and a weekly "healthy" summary on Sundays.
// Layout: daily/YYYY-MM-DD.idebp.enc (kept 30 days), monthly/YYYY-MM.idebp.enc (first of month, kept 365 days),
//         manifests/YYYY-MM-DD.json, latest.json. Retention and bucket locks are R2 bucket rules.

const EXPORT_URL = 'https://hvwmystbqlocjixvwgfl.supabase.co/functions/v1/backup-export';
const FLOORS = { 'public.sources': 134, 'public.research_records': 17080 };
const ALERT_TO = 'hello@thinkingaboutpolicing.org';
const FROM = 'sign-in@auth.id-ebp.org';
const MAGIC = new TextEncoder().encode('IDEBPBK1');

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

async function readAll(stream) {
  const chunks = []; let size = 0;
  const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.byteLength; }
  const out = new Uint8Array(size); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

async function sendMail(env, subject, text) {
  try { await env.EMAIL.send({ to: ALERT_TO, from: { email: FROM, name: 'ID-EBP backups' }, subject, text }); }
  catch (e) { console.log(JSON.stringify({ event: 'mail_failed', error: String(e) })); }
}

async function runBackup(env, when) {
  const day = when.toISOString().slice(0, 10);
  const res = await fetch(EXPORT_URL, { method: 'POST', headers: { 'x-backup-token': env.EXPORT_TOKEN } });
  if (!res.ok || !res.body) throw new Error(`export returned HTTP ${res.status}`);

  // Watch the plain stream for the footer/error line while it is gzipped.
  let tail = ''; let rawBytes = 0;
  const dec = new TextDecoder();
  const watch = new TransformStream({
    transform(chunk, c) { rawBytes += chunk.byteLength; tail = (tail + dec.decode(chunk, { stream: true })).slice(-200000); c.enqueue(chunk); },
  });
  const gz = await readAll(res.body.pipeThrough(watch).pipeThrough(new CompressionStream('gzip')));

  const lines = tail.trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1] || '{}');
  if (last.kind === 'error') throw new Error(`export error: ${last.message}`);
  if (last.kind !== 'footer') throw new Error('export incomplete: no footer line');
  const counts = last.counts || {};
  const low = Object.entries(FLOORS).filter(([t, min]) => (counts[t] ?? 0) < min).map(([t, min]) => `${t} ${counts[t] ?? 0} < ${min}`);

  // Hybrid encryption.
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, gz));
  const pub = await crypto.subtle.importKey('spki', pemToDer(env.PUBLIC_KEY), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', aes, pub, { name: 'RSA-OAEP' }));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, wrapped.byteLength);
  const blob = new Uint8Array(MAGIC.length + 4 + wrapped.byteLength + iv.byteLength + ct.byteLength);
  let o = 0; for (const part of [MAGIC, len, wrapped, iv, ct]) { blob.set(part, o); o += part.byteLength; }
  const digest = hex(await crypto.subtle.digest('SHA-256', blob));

  const key = `daily/${day}.idebp.enc`;
  await env.BACKUPS.put(key, blob, { customMetadata: { sha256: digest, format: 'idebp-backup-v1' } });
  if (when.getUTCDate() === 1) await env.BACKUPS.put(`monthly/${day.slice(0, 7)}.idebp.enc`, blob, { customMetadata: { sha256: digest, format: 'idebp-backup-v1' } });

  // Verify what R2 actually stored.
  const back = await env.BACKUPS.get(key);
  if (!back) throw new Error('verification failed: object missing after upload');
  const backHash = hex(await crypto.subtle.digest('SHA-256', await back.arrayBuffer()));
  if (backHash !== digest) throw new Error('verification failed: stored object hash differs');

  const manifest = { key, created_at: new Date().toISOString(), export_started_at: lines[0]?.startsWith('{"kind":"header"') ? JSON.parse(lines[0]).created_at : null,
    sha256: digest, encrypted_bytes: blob.byteLength, raw_bytes: rawBytes, counts, low_counts: low, verified: true };
  await env.BACKUPS.put(`manifests/${day}.json`, JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: 'application/json' } });
  await env.BACKUPS.put('latest.json', JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: 'application/json' } });
  return manifest;
}

async function weeklySummary(env) {
  const list = await env.BACKUPS.list({ prefix: 'manifests/' });
  const names = list.objects.map((x) => x.key).sort().slice(-7);
  const rows = [];
  for (const k of names) { const m = await (await env.BACKUPS.get(k))?.json(); if (m) rows.push(`${k.slice(10, 20)}  ${(m.encrypted_bytes / 1e6).toFixed(1)} MB  sources ${m.counts['public.sources']}  records ${m.counts['public.research_records']}${m.low_counts?.length ? '  LOW' : ''}`); }
  await sendMail(env, 'ID-EBP backups: weekly summary', `Backups in the last 7 days (${rows.length} of 7):\n\n${rows.join('\n')}\n\nAll stored in Cloudflare R2 bucket idebp-backups (EU), encrypted with your backup key.`);
}

export default {
  async scheduled(controller, env, ctx) {
    const when = new Date(controller.scheduledTime);
    ctx.waitUntil((async () => {
      try {
        const m = await runBackup(env, when);
        console.log(JSON.stringify({ event: 'backup_ok', key: m.key, bytes: m.encrypted_bytes }));
        if (m.low_counts.length) await sendMail(env, 'ID-EBP backup WARNING: row counts low', `The backup completed but these tables are below their safety floors:\n${m.low_counts.join('\n')}\n\nThis can mean data was deleted. Earlier backups are kept and locked.`);
      } catch (e) {
        console.log(JSON.stringify({ event: 'backup_failed', error: String(e) }));
        await sendMail(env, 'ID-EBP backup FAILED', `Tonight's backup failed: ${String(e).slice(0, 500)}\n\nEarlier backups are unaffected. Ask Claude to check the idebp-backup Worker logs.`);
      }
      // Freshness check, independent of tonight's run.
      try {
        const latest = await (await env.BACKUPS.get('latest.json'))?.json();
        if (!latest || Date.now() - Date.parse(latest.created_at) > 36 * 3600e3) await sendMail(env, 'ID-EBP backup STALE', `No successful backup in the last 36 hours (latest: ${latest?.created_at ?? 'none'}).`);
      } catch {}
      if (when.getUTCDay() === 0) await weeklySummary(env);
    })());
  },
  async fetch() { return new Response('Not found', { status: 404 }); },
};
