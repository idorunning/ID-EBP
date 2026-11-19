export const ENRICHMENT_PATH = '/admin/database/enrichment';

const number = new Intl.NumberFormat('en-GB');
const date = new Intl.DateTimeFormat('en-GB', {
  timeZone:'Europe/London', dateStyle:'medium', timeStyle:'medium'
});
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const count = value => value == null ? 'Unavailable' : number.format(value);
function timestamp(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? date.format(time) : 'Unavailable';
}
function timeElement(value) {
  return value ? `<time datetime="${escape(value)}">${escape(timestamp(value))}</time>` : 'Unavailable';
}
const description = (label,value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const states = {
  active:['Active','blue'], idle:['Idle','grey'], overdue:['Overdue','amber'], failing:['Failing','red']
};
const sections = ['Core metadata','Research enrichment','Data quality','Sources and organisations'];

function progress(label, completed, eligible, tone, available = true) {
  const share = available && eligible > 0 ? Math.min(100, Math.max(0, completed * 100 / eligible)) : null;
  const percent = share == null ? 'Unavailable'
    : share > 0 && share < 0.1 ? '<0.1%'
    : share < 100 && share >= 99.95 ? '>99.9%' : `${Math.round(share * 10) / 10}%`;
  const colour = share > 0 && ['blue','green','amber','red'].includes(tone) ? tone : 'grey';
  return `<div class="enrichment-bar-row"><progress class="enrichment-bar is-${colour}" max="100"
    value="${share ?? 0}" aria-label="${escape(label)}" aria-valuetext="${escape(percent)}"
    ${share == null ? 'aria-hidden="true"' : ''}></progress><strong>${escape(percent)}</strong></div>`;
}

function metricView(metric) {
  const {label, eligible, complete, inverse, latest, improved, unavailable} = metric;
  const measured = !unavailable && eligible > 0;
  return `<article class="enrichment-metric">
    <h4>${escape(label)}</h4>
    ${progress(label,complete,eligible,metric.tone,measured)}
    <dl class="enrichment-counts">
      ${description(inverse ? 'Affected' : 'Complete',measured ? count(complete) : 'Unavailable')}
      ${description('Eligible',count(eligible))}
      ${description(inverse ? 'Outside this backlog' : 'Outstanding',measured ? count(eligible-complete) : 'Unavailable')}
      ${description('Improved in 24h',improved == null ? 'Unavailable' : `${count(improved)} logged`)}
    </dl>
    <p class="enrichment-updated">Last recorded update · ${timeElement(latest)}</p>
    <details data-enrichment-detail="${escape(metric.key)}">
      <summary>Measurement</summary>
      <p>${escape(unavailable || metric.meaning)}</p>
      ${unavailable ? `<p>${escape(metric.meaning)}</p>` : ''}
      <p>${inverse ? 'Affected records ÷ eligible population.' : 'Completed records ÷ eligible population.'}
      ${metric.section === 'Sources and organisations' || ['doi','doi_validation','country','language','translation'].includes(metric.key)
        ? '' : ' The eligible population is the full research catalogue.'}</p>
      <p><strong>Data</strong> · ${escape(metric.origin)}<br><strong>Calculated</strong> · ${timeElement(metric.calculatedAt)}</p>
    </details>
  </article>`;
}

function summaryView(totals) {
  const metrics = [
    ['Research records',totals.total],
    ['Successfully enriched',totals.enriched,'blue'],
    ['Fully verified',totals.assurance_available ? totals.verified : null,'green'],
    ['Still to verify',totals.assurance_available ? totals.total-totals.verified : null,'amber']
  ];
  return `<div class="enrichment-summary">${metrics.map(([label,value,tone])=>`<article>
    <h3>${label}</h3><b>${count(value)}</b>${tone ? progress(label,value,totals.total,tone,value!=null) : ''}
  </article>`).join('')}</div>
  <details class="enrichment-dispositions" data-enrichment-detail="dispositions">
    <summary>Processing dispositions</summary>
    <dl class="enrichment-counts">
    ${description('No recorded attempt',count(totals.not_attempted))}
    ${description('Attempted without a recorded change',count(totals.attempted_without_update))}
    ${description('Academic matching inapplicable',count(totals.matching_na))}
    </dl>
    <p>Academic matching applicability follows the queue. The broken link, error and blocked access measures show the individual backlogs.</p>
  </details>`;
}

function batchView(batch) {
  if (!batch) return '<p>No hourly batch has been recorded.</p>';
  const status = {complete:'Complete',running:'Running',failed:'Failed'}[batch.status] || 'Unknown';
  return `<h4>${status} · ${timeElement(batch.started_at)}</h4>
    ${progress('Batch target reached',batch.attempted,batch.target,batch.status==='failed'?'red':'blue')}
    <dl class="enrichment-counts">
      ${description('Finished',timeElement(batch.finished_at))}
      ${description('Attempted / target',`${count(batch.attempted)} / ${count(batch.target)}`)}
      ${description('Distinct records',count(batch.distinct_records))}
      ${description('Improved',count(batch.updated))}
      ${description('Identity matched',count(batch.verified))}
      ${description('Failures',count(batch.failed))}
      ${description('Deferred',count(batch.deferred))}
      ${description('Retry dispositions',count(batch.retry_dispositions))}
      ${description('Exceptions',count(batch.exceptions))}
      ${description('Attempts per minute',count(batch.per_minute))}
      ${description('Last checkpoint',timeElement(batch.latest))}
      ${description('Queue at finish',count(batch.remaining))}
    </dl>
    ${batch.error ? `<p class="enrichment-error">${escape(batch.error)}</p>` : ''}`;
}

function operationsView({pipeline,windows,batches,errors,checkpoints,calculatedAt,hourlyCoverageSince,doiCoverageSince}) {
  const [state,tone] = states[pipeline.state] || ['Unavailable','grey'];
  const rangeLabel = days => days===1 ? 'Previous 24 hours' : `Previous ${days} days`;
  return `<section class="member-panel enrichment-section">
    <div class="enrichment-heading"><h3>Hourly processing</h3><span class="enrichment-status is-${tone}">${state}</span></div>
    <dl class="enrichment-counts">
      ${description('Next scheduled run',timeElement(pipeline.nextRun))}
      ${description('Last dispatch',timeElement(pipeline.lastDispatch))}
      ${description('Last completed batch',timeElement(pipeline.lastSuccess))}
      ${description('Hourly queue',count(pipeline.hourlyQueue))}
      ${description('DOI follow-up queue',count(pipeline.doiQueue))}
      ${description('Net queue reduction per hour',count(pipeline.netPerHour))}
      ${description('Estimated hourly queue clearance',pipeline.etaHours==null ? 'Insufficient rate history' :
        `${timeElement(new Date(Date.parse(calculatedAt)+pipeline.etaHours*3600000).toISOString())}`)}
      ${pipeline.providerRetryAfter ? description('Provider cooldown until',timeElement(pipeline.providerRetryAfter)) : ''}
    </dl>
    ${pipeline.scheduleActive === false ? '<p>The hourly schedule is disabled.</p>' : ''}
    <p class="enrichment-note">The queue estimate uses net reduction across recent completed batches. The formal verification backlog has its own progress measures.</p>
    <div class="enrichment-ops-rates">
      <article><h4>Completed batches · 7 days</h4>
        ${progress('Completed batches',pipeline.completedBatches,pipeline.batchRuns,'blue')}
        <p>${count(pipeline.completedBatches)} of ${count(pipeline.batchRuns)} finished batches completed successfully.</p></article>
      <article><h4>Batches that met target · 7 days</h4>
        ${progress('Batches that met target',pipeline.batchesAtTarget,pipeline.completedBatches,'blue')}
        <p>${count(pipeline.batchesAtTarget)} of ${count(pipeline.completedBatches)} completed batches reached their target.</p></article>
    </div>
    <div class="enrichment-latest"><h4>Latest batch</h4>${batchView(batches[0])}</div>
    <details data-enrichment-detail="batches"><summary>Recent batch history</summary>
    ${batches.length > 1 ? batches.slice(1).map(batch=>`<article class="enrichment-latest">${batchView(batch)}</article>`).join('') : '<p>No earlier batches available.</p>'}
    </details>
    <details data-enrichment-detail="errors"><summary>Recent errors and blocked checks</summary>
    ${errors.length ? `<ul class="enrichment-errors">${errors.map(error=>`<li>${timeElement(error.at)} ·
      ${escape(error.method)} · ${escape(error.status)}<br>${escape(error.note)}
      ${error.record_id ? `<small>Record ${escape(error.record_id)}</small>` : ''}${error.batch_id ? `<small>Batch ${escape(error.batch_id)}</small>` : ''}</li>`).join('')}</ul>`
      : '<p>No errors in the available logs for this view.</p>'}
    </details>
  </section>
  <section class="member-panel enrichment-section"><h3>Processing history</h3>
    <p>Hourly results recorded since ${timeElement(hourlyCoverageSince)}. DOI attempt and outcome audit recorded since ${timeElement(doiCoverageSince)}.</p>
    <div class="enrichment-windows">${windows.map(window=>{
      const complete = Date.parse(window.combined_since)<=Date.parse(calculatedAt)-window.days*86400000;
      return `<article class="enrichment-metric"><h4>${rangeLabel(window.days)}</h4>
        <p class="enrichment-note">${complete ? 'Recorded activity' : 'Partial history · earlier activity unavailable'}</p>
        <dl class="enrichment-counts">
          ${description('Attempts logged',count(window.logged_attempts))}
          ${description('Distinct records attempted',count(window.distinct_attempted))}
          ${description('Distinct records processed',count(window.distinct_processed))}
          ${description('Actually improved',count(window.improved))}
          ${description('Successful outcomes',count(window.successful))}
          ${description('Failed or blocked outcomes',count(window.failed))}
          ${description('Retry dispositions',count(window.deferred))}
          ${description('Distinct hourly records',count(window.hourly_distinct))}
          ${description('Last logged activity',timeElement(window.latest))}
        </dl>
        ${progress('Successful outcomes',window.successful,window.outcomes,'green')}
        <p>${count(window.successful)} of ${count(window.outcomes)} logged outcomes matched their source.</p>
      </article>`;
    }).join('')}</div>
    <p class="enrichment-note">Attempts include logged DOI claims and hourly results with a record ID. Batch totals can also include concurrent-change deferrals without a record result.</p>
    <details data-enrichment-detail="checkpoints"><summary>Daily database checkpoints</summary>
      ${checkpoints.length ? `<div class="admin-table-wrap"><table class="admin-table enrichment-table"><thead><tr><th scope="col">Date</th><th scope="col">Catalogue</th><th scope="col">Indexed</th><th scope="col">DOI verified</th><th scope="col">OpenAlex title matches</th><th scope="col">Publisher matches</th></tr></thead>
      <tbody>${checkpoints.map(cp=>`<tr><th scope="row">${escape(cp.as_of)}</th><td>${count(cp.catalogue_total)}</td><td>${count(cp.search_documents)}</td><td>${count(cp.doi_verified)}</td><td>${count(cp.non_doi_verified)}</td><td>${count(cp.publisher_verified)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p>No daily checkpoints are available.</p>'}
    </details>
  </section>`;
}

export function renderEnrichmentReport(report) {
  const day=report.windows.find(window=>window.days===1);
  const dayIsPartial=day && Date.parse(day.combined_since)>Date.parse(report.calculatedAt)-86400000;
  const daily=day ? `<article class="member-panel enrichment-daily">
    <div><h3>Previous 24 hours</h3>${dayIsPartial ? '<p class="enrichment-note">Partial audit history</p>' : ''}</div>
    <dl class="enrichment-counts">
      ${description('Attempts logged',count(day.logged_attempts))}
      ${description('Distinct records processed',count(day.distinct_processed))}
      ${description('Actually improved',count(day.improved))}
    </dl>
  </article>` : '';
  return summaryView(report.totals)+daily+operationsView(report)+sections.map(section=>`
    <section class="member-panel enrichment-section"><h3>${section}</h3>
    <div class="enrichment-metrics">${report.metrics.filter(metric=>metric.section===section)
      .map(metric=>metricView({...metric,calculatedAt:report.calculatedAt})).join('')}</div></section>`).join('');
}

export function enrichmentPanel() {
  return `<div class="enrichment-dashboard" data-enrichment-dashboard>
    <section class="member-panel">
      <div class="enrichment-heading"><h2>Live Enrichment</h2><button type="button" class="button button-outline button-small" data-enrichment-refresh>Refresh now</button></div>
      <p class="enrichment-note">Refreshes every 60 seconds. Times are shown in UK local time.</p>
      <p class="enrichment-refresh-status" data-enrichment-status role="status">Loading live database progress…</p>
    </section>
    <div data-enrichment-report></div>
  </div>`;
}

export function bindEnrichmentDashboard(root, load, {interval = 60000} = {}) {
  const refresh = root.querySelector('[data-enrichment-refresh]');
  const status = root.querySelector('[data-enrichment-status]');
  const content = root.querySelector('[data-enrichment-report]');
  let timer, observer, loading = false, stopped = false, cachedAt = null, initial = true;

  function cleanup() {
    stopped = true;
    clearTimeout(timer);
    observer?.disconnect();
    refresh.removeEventListener('click',read);
  }

  async function read() {
    if (stopped || loading || !root.isConnected) return;
    clearTimeout(timer);
    const started = Date.now();
    loading = true;
    refresh.setAttribute('aria-disabled','true');
    try {
      const request = load({initial});
      initial = false;
      const report = await request;
      if (stopped || !root.isConnected) return;
      if (!report.calculatedAt || !Array.isArray(report.metrics) || !Array.isArray(report.batches)
          || !Array.isArray(report.windows) || !Array.isArray(report.errors) || !Array.isArray(report.checkpoints)
          || !report.totals || !report.pipeline) throw Error('Incomplete enrichment report');
      const openDetails = new Set([...content.querySelectorAll('details[open]')].map(el=>el.dataset.enrichmentDetail));
      const focusedDetails = content.ownerDocument.activeElement?.closest('details')?.dataset.enrichmentDetail;
      content.innerHTML = renderEnrichmentReport(report);
      for (const detail of content.querySelectorAll('details')) {
        if (openDetails.has(detail.dataset.enrichmentDetail)) detail.open = true;
        if (focusedDetails === detail.dataset.enrichmentDetail) detail.querySelector('summary').focus({preventScroll:true});
      }
      cachedAt = report.calculatedAt;
      status.textContent = `Last successful refresh · ${timestamp(cachedAt)}`;
    } catch (error) {
      if (stopped || !root.isConnected) return;
      if ([401,403,409].includes(error.status)) {
        content.replaceChildren();
        status.textContent = 'Administrator access is required. Sign in again to view this dashboard.';
        cleanup();
      } else {
        status.textContent = cachedAt ? `Refresh delayed. Last successful refresh · ${timestamp(cachedAt)}`
          : 'Live progress is temporarily unavailable. Refresh to try again.';
      }
    } finally {
      loading = false;
      refresh.removeAttribute('aria-disabled');
      if (!stopped && root.isConnected) timer = setTimeout(read, Math.max(0, interval-(Date.now()-started)));
    }
  }

  refresh.addEventListener('click',read);
  observer = new MutationObserver(()=>{ if (!root.isConnected) cleanup(); });
  observer.observe(root.ownerDocument.body,{childList:true,subtree:true});
  void read();
  return cleanup;
}
