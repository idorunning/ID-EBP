// Session-side helper for the research editorial job (see docs/research-editorial-job.md).
// It never writes to the database: it gathers evidence, checks drafted summaries, and prints the SQL
// calls that an authorised operator runs (private.research_editorial_submit / _signoff).
//
//   node scripts/editorial-batch.mjs evidence --dir DIR ID...          fetch records and evidence; print a digest
//   node scripts/editorial-batch.mjs check --dir DIR --run RUN FILE    validate drafts; print the submit call
//   node scripts/editorial-batch.mjs live --run RUN ID...              live search + link check; print the sign-off call
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { extract } from '../supabase/functions/_shared/publisher-metadata.ts';

const ORIGIN = process.env.ID_EBP_SUPABASE_URL || 'https://hvwmystbqlocjixvwgfl.supabase.co';
const KEY = process.env.ID_EBP_PUBLISHABLE_KEY || 'sb_publishable_0fhRn9kYUd8Ur7g9TuCzJQ_Zdu5aIRk';
const SEARCH = 'https://www.id-ebp.org/api/research';
const UA = 'ID-EBP editorial evidence check (https://www.id-ebp.org; contact@id-ebp.org)';
const FIELDS = ['title', 'authors', 'year', 'source', 'summary', 'tags', 'url'];
export const norm = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isUrl = v => typeof v === 'string' && /^https?:\/\/[^\s/]+/.test(v) && v.length <= 2048;
export const authorMissing = v => /^(|not stated.*|not specified.*|unknown.*|responsible organisation:.*|n\/a|none listed.*|none|editor|editors|anonymous|various)$/i
  .test(String(v ?? '').trim());

// Longest run of consecutive words shared by a draft and a source text.
export function longestSharedRun(draft, source) {
  const a = norm(draft).split(' ').filter(Boolean), b = ' ' + norm(source) + ' ';
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + best + 1; j <= a.length; j++) {
    if (b.includes(' ' + a.slice(i, j).join(' ') + ' ')) best = j - i; else break;
  }
  return best;
}

// Mirrors the checks in private.research_editorial_submit, plus a copy check against the evidence.
export function summaryProblems(text, sources = []) {
  const s = String(text ?? '').trim(), problems = [];
  if (s.length < 60 || s.length > 420) problems.push(`length ${s.length} (60-420)`);
  if (/(https?:\/\/|www\.|[#*_`|<>[\]{}])/.test(s)) problems.push('links or markup');
  const sentences = (s.match(/[.!?](\s|$)/g) || []).length;
  if (sentences < 1 || sentences > 3) problems.push(`${sentences} sentence endings (1-3)`);
  if (/(stage [0-9]|inventory record|placeholder|lorem ipsum)/i.test(s)) problems.push('placeholder wording');
  for (const src of sources) {
    const run = longestSharedRun(s, src);
    if (run >= 10) { problems.push(`copies ${run} consecutive words from the evidence`); break; }
  }
  return problems;
}

async function getJson(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), ...opts });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.json();
}
function pageText(buf, type) {
  if (type.includes('pdf') || buf.subarray(0, 5).toString() === '%PDF-') {
    const f = join(process.env.TMPDIR || '/tmp', `editorial-${process.pid}.pdf`);
    writeFileSync(f, buf);
    try { return { kind: 'pdf', text: execFileSync('pdftotext', ['-l', '6', f, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 3e7 }) }; }
    catch { return { kind: 'pdf', text: '' }; }
  }
  const html = buf.toString('utf8');
  const body = html.replace(/<(script|style|nav|header|footer|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, '-')
    .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  return { kind: 'html', text: body, meta: extract(html) };
}
async function fetchEvidence(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5' } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) return { status: r.status, final: r.url, text: '' };
    return { status: r.status, final: r.url, ...pageText(buf, r.headers.get('content-type') || '') };
  } catch (e) { return { status: 0, error: e.name === 'TimeoutError' ? 'timeout' : 'connection error', text: '' }; }
}
async function doiEvidence(doi) {
  const out = {};
  try {
    const m = (await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { 'user-agent': UA } })).message;
    out.crossref = { url: `https://api.crossref.org/works/${encodeURIComponent(doi)}`, title: m.title?.[0],
      year: (m.issued?.['date-parts']?.[0] || [])[0] ?? null, type: m.type, container: m['container-title']?.[0],
      publisher: m.publisher, authors: (m.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean) };
  } catch (e) { out.crossref = { error: e.message }; }
  try {
    const o = await getJson(`https://api.openalex.org/works/doi:${doi}?select=id,title,publication_year,authorships,abstract_inverted_index`);
    const words = [];
    for (const [w, ps] of Object.entries(o.abstract_inverted_index || {})) for (const p of ps) words[p] = w;
    out.openalex = { url: `https://api.openalex.org/works/doi:${doi}`, title: o.title, year: o.publication_year,
      authors: (o.authorships || []).map(a => a.author?.display_name).filter(Boolean), abstract: words.join(' ') };
  } catch (e) { out.openalex = { error: e.message }; }
  try {
    const h = await getJson(`https://doi.org/api/handles/${doi}`);
    out.handle = { url: `https://doi.org/api/handles/${doi}`, registered: h.responseCode === 1,
      target: h.values?.find(v => v.type === 'URL')?.data?.value };
  } catch { out.handle = { registered: false }; }
  return out;
}
export async function liveFound(rec) {
  if (!rec.title || rec.title.length > 300) return false;
  const q = new URL(SEARCH);
  q.search = new URLSearchParams({ q: rec.title, exact: '1' }).toString();
  for (let page = 1; page <= 3; page++) {
    q.searchParams.set('page', String(page));
    const r = await fetch(q, { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!r.ok) throw Object.assign(Error(`Public search returned HTTP ${r.status}`), { status: r.status });
    const rows = (await r.json()).results || [];
    if (rows.some(x => x.id === rec.id && x.title === rec.title && x.url === rec.url && x.authors === rec.authors &&
      x.source === rec.source && x.summary === rec.summary && JSON.stringify(x.tags) === JSON.stringify(rec.tags))) return true;
    if (!rows.length) break;
  }
  return false;
}
async function records(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    out.push(...await getJson(`${ORIGIN}/rest/v1/research_records?id=in.(${part.map(encodeURIComponent).join(',')})` +
      '&select=id,title,url,doi,authors,year,publication,source,source_slug,summary,tags,kind_std', { headers: { apikey: KEY } }));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function evidenceCommand(dir, ids) {
  mkdirSync(dir, { recursive: true });
  for (const rec of await records(ids)) {
    const page = await fetchEvidence(rec.url);
    const doi = rec.doi ? await doiEvidence(rec.doi.trim()) : {};
    const t = norm(page.text);
    const surnames = String(rec.authors || '').split(';').map(a => norm(a.includes(',') ? a.split(',')[0] : a.trim().split(' ').at(-1)))
      .filter(Boolean);
    const checks = {
      reachable: page.status >= 200 && page.status < 400,
      titleOnPage: !!t && t.includes(norm(rec.title)),
      authorsOnPage: authorMissing(rec.authors) ? null : `${surnames.filter(s => t.includes(s)).length}/${surnames.length}`,
      yearOnPage: rec.year ? t.includes(String(rec.year)) : null,
      existingSummaryCopied: rec.summary ? Math.max(longestSharedRun(rec.summary, page.text), longestSharedRun(rec.summary, doi.openalex?.abstract || '')) : 0,
      crossrefTitleMatch: doi.crossref?.title ? norm(doi.crossref.title) === norm(rec.title) : null,
    };
    writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify({ record: rec, page, doi, checks }, null, 1));
    const lines = [`=== ${rec.id} | ${rec.kind_std || '-'} | ${rec.source}`,
      `title: ${rec.title}`, `url: ${rec.url}${page.final && page.final !== rec.url ? ' -> ' + page.final : ''}`,
      `authors: ${rec.authors || '(none)'} | year: ${rec.year ?? '(none)'} | doi: ${rec.doi || '-'} | tags: ${(rec.tags || []).join(', ') || '(none)'}`,
      `current summary: ${String(rec.summary || '').slice(0, 220).replace(/\s+/g, ' ')}`,
      `page: ${page.status || page.error} ${page.kind || ''} | checks: ${JSON.stringify(checks)}`];
    if (page.meta) lines.push(`meta: ${JSON.stringify({ title: page.meta.title, authors: page.meta.authors.slice(0, 8), year: page.meta.year, publication: page.meta.publication })}`);
    if (doi.crossref?.title) lines.push(`crossref: ${JSON.stringify({ title: doi.crossref.title, year: doi.crossref.year, authors: doi.crossref.authors.slice(0, 8), container: doi.crossref.container, type: doi.crossref.type })}`);
    if (doi.handle) lines.push(`doi handle: ${doi.handle.registered ? 'registered -> ' + doi.handle.target : 'not registered'}`);
    const excerpt = page.text ? page.text.slice(Math.max(0, norm(page.text).indexOf(norm(rec.title).split(' ')[0]) - 50), 1800) : '';
    lines.push(`excerpt: ${excerpt.slice(0, 1400) || (doi.openalex?.abstract ? '(page unavailable; abstract available for reading only, do not copy)' : '(none)')}`);
    if (!page.text && doi.openalex?.abstract) lines.push(`abstract (read only): ${doi.openalex.abstract.slice(0, 1200)}`);
    console.log(lines.join('\n') + '\n');
  }
}

function checkCommand(dir, run, file) {
  if (!/^[0-9a-f-]{36}$/.test(run || '')) throw Error('--run RUN is required');
  const drafts = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(drafts) || drafts.length > 50) throw Error('drafts must be an array of at most 50');
  const items = [], rejected = [];
  for (const d of drafts) {
    const path = join(dir, `${d.id}.json`);
    if (!existsSync(path)) { rejected.push(`${d.id}: no evidence file`); continue; }
    const ev = JSON.parse(readFileSync(path, 'utf8'));
    if (d.hold) { items.push({ id: d.id, hold: String(d.hold).slice(0, 300) }); continue; }
    const evidence = Object.fromEntries(FIELDS.map(f => [f, d.evidence?.[f] ?? d.evidence_default]));
    const missing = FIELDS.filter(f => !isUrl(evidence[f]));
    if (missing.length) { rejected.push(`${d.id}: evidence URL missing for ${missing.join(', ')}`); continue; }
    const item = { id: d.id, evidence };
    if (d.summary) {
      const problems = summaryProblems(d.summary, [ev.page.text || '', ev.doi?.openalex?.abstract || '', ev.record.summary || '']);
      if (problems.length) { rejected.push(`${d.id}: summary ${problems.join('; ')}`); continue; }
      item.summary = d.summary.trim();
      if (String(ev.record.summary || '').trim() && !/^\s*(Stage \d+ (source )?inventory record|\[Skip to content\]|#{1,4} )/i.test(ev.record.summary)) {
        if (!['copied_abstract', 'page_capture', 'not_descriptive', 'inaccurate'].includes(d.replace_reason)) {
          rejected.push(`${d.id}: existing summary needs replace_reason`); continue;
        }
        item.replace_reason = d.replace_reason;
      }
    }
    if (d.authors) {
      if (!authorMissing(ev.record.authors)) { rejected.push(`${d.id}: authors already recorded`); continue; }
      item.authors = String(d.authors).trim();
    }
    if (d.year != null) {
      if (ev.record.year != null) { rejected.push(`${d.id}: year already recorded`); continue; }
      item.year = Number(d.year);
    }
    if (Array.isArray(d.tags) && d.tags.length) item.tags = d.tags;
    items.push(item);
  }
  const json = JSON.stringify(items);
  if (json.includes('$j$')) throw Error('unexpected delimiter in content');
  const sql = `select private.research_editorial_submit('${run}', $j$${json}$j$::jsonb);`;
  writeFileSync(join(dir, 'submit.sql'), sql);
  console.error(`${items.length} item(s) ready, ${rejected.length} rejected` + (rejected.length ? ':\n  ' + rejected.join('\n  ') : ''));
  console.log(sql);
}

async function liveCommand(run, ids) {
  if (!/^[0-9a-f-]{36}$/.test(run || '')) throw Error('--run RUN is required');
  const items = [], notes = [];
  for (const rec of await records(ids)) {
    let link = false;
    if (/^https?:\/\/(dx\.)?doi\.org\//i.test(rec.url)) {
      const doi = rec.url.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      try { link = (await getJson(`https://doi.org/api/handles/${doi}`)).responseCode === 1; } catch { link = false; }
    } else {
      const page = await fetchEvidence(rec.url);
      link = page.status >= 200 && page.status < 400;
    }
    let found = false;
    try { found = await liveFound(rec); } catch (e) { notes.push(`${rec.id}: ${e.message}`); if (e.status === 429 || e.status >= 500) break; }
    if (link && found) items.push({ id: rec.id, live_found: true, checked_url: rec.url, link_verified_at: new Date().toISOString() });
    else notes.push(`${rec.id}: ${link ? '' : 'link check failed '}${found ? '' : 'not found on live search'}`.trim());
  }
  console.error(`${items.length} ready for sign-off` + (notes.length ? '\n  ' + notes.join('\n  ') : ''));
  console.log(`select private.research_editorial_signoff('${run}', $j$${JSON.stringify(items)}$j$::jsonb);`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true,
    options: { dir: { type: 'string' }, run: { type: 'string' } } });
  if (command === 'evidence') return evidenceCommand(values.dir || 'editorial-evidence', positionals);
  if (command === 'check') return checkCommand(values.dir || 'editorial-evidence', values.run, positionals[0]);
  if (command === 'live') return liveCommand(values.run, positionals);
  console.error('Usage: node scripts/editorial-batch.mjs evidence|check|live ... (see file header)');
  process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
