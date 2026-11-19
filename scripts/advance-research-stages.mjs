import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const fields = ['title','authors','year','source','summary','tags','url'];
const assuranceProgramme = 'ID-EBP catalogue assurance baseline 2026-11';
const assessment = readFileSync(new URL('./research-stage-assessment.sql', import.meta.url), 'utf8');
const publicSearch = 'https://www.id-ebp.org/api/research';
const textPresent = value => typeof value === 'string' && value.trim().length > 0;
const link = value => {
  if (!textPresent(value) || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
};

export function validateReviews(input, now = Date.now()) {
  if (!Array.isArray(input)) throw Error('The review file must contain an array.');
  const reviews = Object.create(null);
  for (const item of input) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(item?.id ?? '') || !/^[a-f0-9]{32}$/.test(item?.fingerprint ?? '') ||
        !textPresent(item?.reviewer) || Object.hasOwn(reviews,item.id)) {
      throw Error('Every review needs a unique record ID, current fingerprint and named reviewer.');
    }
    const evidence = Object.fromEntries(fields.map(field => {
      const url=item.evidence?.[field]??item.evidence?.primary;
      if (!link(url)) throw Error(`Missing evidence URL for ${item.id} / ${field}.`);
      return [field,url];
    }));
    const review = {fingerprint:item.fingerprint,reviewer:item.reviewer,evidence};
    if (item.year_not_applicable) {
      if (!textPresent(item.year_not_applicable.reason)) throw Error(`Missing year exception reason for ${item.id}.`);
      review.year_not_applicable = {reason:item.year_not_applicable.reason};
    }
    if (item.final) {
      const checked = Date.parse(item.final.link_verified_at);
      if (!link(item.final.relevance_evidence) || !link(item.final.checked_url) ||
          item.final.duplicate_reviewed !== true || !Number.isFinite(checked) ||
          checked > now || now - checked > 7 * 86400000) {
        throw Error(`Final review for ${item.id} needs relevance evidence, duplicate review and a link check from the last seven days.`);
      }
      review.final={relevance_evidence:item.final.relevance_evidence, checked_url:item.final.checked_url,
        link_verified_at:new Date(checked).toISOString(),duplicate_reviewed:true};
    }
    reviews[item.id]=review;
  }
  return reviews;
}

const jsonSql = input => `convert_from(decode('${Buffer.from(JSON.stringify(input)).toString('base64')}','base64'),'UTF8')::jsonb`;
export const stageSql = (reviews, reviewedOnly=false) => assessment.replace('__REVIEWS__',jsonSql(reviews))
  .replace('__REVIEW_SCOPE__',reviewedOnly?'where v.id is not null':'');
const blockers = `select jsonb_build_object(
 'counts', (select jsonb_object_agg(stage,n) from
   (select stages.stage,count(a.id) n from generate_series(1,5) stages(stage)
    left join assessment a on a.stage=stages.stage group by stages.stage) x),
 'blockers', (select coalesce(jsonb_object_agg(reason,n),'{}'::jsonb) from
   (select reason,count(*) n from assessment cross join lateral
    unnest(case when stage<4 then stage4_blockers else stage5_blockers end) reason
    where stage<5 group by reason) x)
)`;
export const reportSql = reviews => stageSql(reviews)+blockers;
const details = `select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from (
 select id,title,url,authors,year,source,summary,tags,kind_std,fingerprint,stage,publication_evidence,stage4_blockers,stage5_blockers
 from assessment where stage<5 order by stage desc,id
) a`;
const finalCandidates = `select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'url',url,
   'authors',authors,'source',source,'summary',summary,'tags',tags)),'[]'::jsonb)
 from assessment where supplied is not null and ready_for_review and stage<5
 and reviewed#>>'{final,checked_url}'=url and cardinality(array_remove(stage5_blockers,'live_search_confirmation_required'))=0`;

function db(query) {
  return execFileSync('psql',['-X','-w','-qAt','--set=ON_ERROR_STOP=1'],{
    input:`set statement_timeout='45s';\n${query};\n`,encoding:'utf8',maxBuffer:45*1024*1024
  }).trim().split('\n').at(-1);
}
const select = sql => JSON.parse(db(sql));

async function findLive({id,title,url,authors,source,summary,tags}) {
  if (title.length>300) return false;
  const query=new URL(publicSearch);
  query.search=new URLSearchParams({q:title,exact:'1'}).toString();
  for(let page=1;page<=3;page++) {
    query.searchParams.set('page',String(page));
    const response=await fetch(query,{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok) throw Object.assign(Error(`Public search returned HTTP ${response.status}`),{status:response.status});
    const payload=await response.json();
    if(!Array.isArray(payload.results)) throw Error('Invalid public search response');
    const rows=payload.results;
    if(rows.some(r=>r.id===id&&r.title===title&&r.url===url&&r.authors===authors&&r.source===source&&
        r.summary===summary&&JSON.stringify(r.tags)===JSON.stringify(tags))) return true;
    if(!rows.length) break;
  }
  return false;
}

export function applySql(reviews) {
  return `begin;
 select pg_advisory_xact_lock(68130921);
 select id from public.research_records where id in
   (select key from jsonb_each(${jsonSql(reviews)})) order by id for update;
 ${stageSql(reviews,true)}, selected as materialized (
   select *, (cardinality(stage5_blockers)=0 and reviewed#>>'{final,checked_url}'=url) approved
   from assessment where supplied is not null and ready_for_review and stage<5
   and (cardinality(stage5_blockers)=0 and reviewed#>>'{final,checked_url}'=url
     or supplied-'live_found' is distinct from checks->'stage4_review')
 ), new_batch as (
   insert into private.verification_batches(programme_id,batch_number,status,target_count,rules_version,
     started_at,completed_at,checkpoint_at,summary)
   select p.id,coalesce((select max(b.batch_number) from private.verification_batches b where b.programme_id=p.id),0)+1,
     'assessed',count(*)::int,'research-stage-gates-v1',now(),now(),now(),
     jsonb_build_object('stage4',count(*) filter(where approved is not true),
                        'stage5',count(*) filter(where approved is true))
   from selected cross join private.verification_programmes p
   where p.name='${assuranceProgramme}' and p.status='active' group by p.id
   returning id
 ), stamped as (
   insert into private.verification_items(batch_id,record_id,baseline_record,baseline_fingerprint,
     selected_reason,assessment_status,checks,assessed_at)
   select b.id,m.id,to_jsonb(r)-'search_vector',m.fingerprint,'reviewed research stage evidence',
     case when m.approved then 'evidence_verified' else 'automatic_screened' end,
     coalesce(m.checks,'{}'::jsonb)||jsonb_build_object('stage4_review',m.supplied-'live_found',
       'publication_evidence',m.publication_evidence,'full_record_verified',m.approved is true,
       'live_search_verified_at',case when m.approved then now() end),
     now()
   from selected m join public.research_records r on r.id=m.id cross join new_batch b
   returning assessment_status
 ) select jsonb_build_object('stage4_recorded',count(*) filter(where assessment_status='automatic_screened'),
   'stage5_signed_off',count(*) filter(where assessment_status='evidence_verified')) from stamped;
 commit`;
}

const pendingReviewCandidates = reviews => Object.keys(reviews).length ? select(stageSql(reviews,true)+finalCandidates) : [];

async function main() {
  const {values}=parseArgs({options:{reviews:{type:'string'},apply:{type:'boolean'},
    advance:{type:'boolean'},details:{type:'boolean'},help:{type:'boolean'}}});
  if(values.help){
    process.stdout.write('Usage: node scripts/advance-research-stages.mjs [--details] [--reviews FILE] [--apply] [--advance]\n');
    return;
  }
  const reviews=validateReviews(values.reviews?JSON.parse(readFileSync(values.reviews,'utf8')):[]);
  if(values.advance&&!values.apply) throw Error('--advance requires --apply.');
  if(values.details&&(values.apply||values.reviews)) throw Error('--details exports the live review queue and is used on its own.');
  if(values.apply){
    if(values.advance){
      let screenedBatches=0;
      for(let i=0;i<100;i++) {
        const id=db("select coalesce(private.screen_research_verification_batch()::text,'')");
        if(!id) break;
        screenedBatches++;
      }
      const dispatch=select(`with started as materialized (select case when
        not exists(select from private.enrichment_hourly_batches where started_at>now()-interval '1 hour')
        then private.start_enrichment_hourly_batch(250) end id)
        select jsonb_build_object('screening_batches',${screenedBatches},'publication_batch',id,
          'dispatch',case when id is not null then private.advance_enrichment_chunk(id)->'continuation_request' end) from started`);
      console.error(JSON.stringify(dispatch));
    }
    const candidates=pendingReviewCandidates(reviews);
    for(const candidate of candidates){
      try { reviews[candidate.id].live_found=await findLive(candidate); }
      catch(error){
        console.error(`${candidate.id}: ${error.message}`);
        if(error.status===429||error.status>=500) break;
      }
    }
    const pending=Object.entries(reviews);
    for(let i=0;i<pending.length;i+=250) {
      console.error(JSON.stringify(select(applySql(Object.fromEntries(pending.slice(i,i+250))))));
    }
  }
  console.log(JSON.stringify(select(stageSql(values.apply?{}:reviews)+(values.details?details:blockers)),null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
