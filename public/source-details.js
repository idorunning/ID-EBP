// Public directory information is separate from approved account/ownership contacts.
import {safeUrl} from './ranking.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COPY={
 en:{summary:'Auto-generated summary',declared:'Source-provided summary',website:'Website',contactPage:'Contact page',publicContact:'Contact & links',evidence:'Published contact details',noEmail:'No public email confirmed in this review.',checked:'Website checked',redirected:'Redirect checked',restricted:'Automated access restricted',unreachable:'Link could not be verified',missing:'Page not found',date:'Checked',photo:'Professional profile photo',photoSource:'Photo source',correction:'If details are incorrect or you wish to be removed, email',auditDetail:'Link check details'},
 fr:{summary:'Résumé généré automatiquement',declared:'Résumé fourni par la source',website:'Site web',contactPage:'Page de contact',publicContact:'Contact et liens',evidence:'Coordonnées publiées',noEmail:'Aucune adresse électronique publique confirmée lors de cet examen.',checked:'Site vérifié',redirected:'Redirection vérifiée',restricted:'Accès automatisé restreint',unreachable:'Lien non vérifiable',missing:'Page introuvable',date:'Vérifié le',photo:'Photo de profil professionnel',photoSource:'Source de la photo',correction:'Si les informations sont incorrectes ou si vous souhaitez être retiré, écrivez à',auditDetail:'Détails de la vérification'},
 es:{summary:'Resumen generado automáticamente',declared:'Resumen proporcionado por la fuente',website:'Sitio web',contactPage:'Página de contacto',publicContact:'Contacto y enlaces',evidence:'Datos de contacto publicados',noEmail:'No se confirmó ningún correo público en esta revisión.',checked:'Sitio comprobado',redirected:'Redirección comprobada',restricted:'Acceso automatizado restringido',unreachable:'Enlace sin verificar',missing:'Página no encontrada',date:'Comprobado',photo:'Fotografía de perfil profesional',photoSource:'Fuente de la fotografía',correction:'Si los datos son incorrectos o desea que se retiren, escriba a',auditDetail:'Detalles de la comprobación'}
};
const copy=lang=>COPY[lang]||COPY.en;
const link=(url,label,cls='')=>safeUrl(url)?`<a${cls?` class="${cls}"`:''} href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';
export function summaryLabel(source,lang='en'){
 const generated=source.summaryGenerated??source.provenance!=='Source-declared';
 return `<span class="audit-summary-label">${esc(copy(lang)[generated?'summary':'declared'])}</span>`;
}
export function validPublicEmail(value){
 return typeof value==='string'&&value.length<=254&&/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(value)?value:null;
}
function socialLabel(url){
 const host=new URL(url).hostname.replace(/^www\./,'');
 return /(^|\.)linkedin\.com$/.test(host)?'LinkedIn':/^(x\.com|twitter\.com)$/.test(host)?'X':/facebook\.com$/.test(host)?'Facebook':/(youtube\.com|youtu\.be)$/.test(host)?'YouTube':host;
}
export function contactMarkup(source,lang='en'){
 const c=copy(lang),email=validPublicEmail(source.contactEmail);
 const social=[...new Set((source.social||[]).map(safeUrl).filter(Boolean))];
 const evidence=[...new Set((source.contactEvidence||[]).map(item=>typeof item==='string'?item:item.url).filter(safeUrl))];
 const website=link(source.url,c.website,'contact-website');
 const contact=source.contactPage&&source.contactPage!==source.url?link(source.contactPage,c.contactPage):'';
 return `<section class="profile-section source-public-contact"><h2>${esc(c.publicContact)}</h2>${portraitMarkup(source,lang)}${source.contactName?`<p class="contact-name">${esc(source.contactName)}</p>`:''}<div class="source-contact-links">${website}${email?`<a href="mailto:${esc(email)}">${esc(email)}</a>`:''}${contact}${social.map(url=>link(url,socialLabel(url),'contact-social')).join('')}</div>${!email?`<p class="small muted">${esc(c.noEmail)}</p>`:''}${evidence.length?`<details class="check-links"><summary>${esc(c.evidence)}</summary><ul>${evidence.map(url=>`<li>${link(url,url)}</li>`).join('')}</ul></details>`:''}</section>`;
}
export function portraitMarkup(source,lang='en',placement='profile'){
 const photo=source.portrait;
 if(!photo||!/^(\/assets\/people\/[a-z0-9-]+\.(webp|png|jpg|jpeg)|\/media\/sources\/[a-z0-9-]+\/portrait)$/.test(photo.path||'')||!safeUrl(photo.sourceUrl))return '';
 return `<figure class="source-portrait${placement==='card'?' source-card-portrait':''}"><img src="${esc(photo.path)}" alt="${esc(photo.alt||source.owner||source.name)}" loading="lazy" decoding="async" width="160" height="160"><figcaption>${link(photo.sourceUrl,photo.credit||copy(lang).photoSource)}</figcaption></figure>`;
}
export function linkAuditMarkup(source,lang='en'){
 const a=source.linkAudit;if(!a)return '';
 const c=copy(lang),labels={working:c.checked,redirected:c.redirected,restricted:c.restricted,unreachable:c.unreachable,'not-found':c.missing};
 const status=Object.hasOwn(labels,a.status)?a.status:'unreachable';
 const date=/^\d{4}-\d{2}-\d{2}/.test(a.checkedAt||'')?a.checkedAt.slice(0,10):'';
 const detail=a.note?`<details class="audit-check-detail"><summary>${esc(c.auditDetail)}</summary><p>${esc(a.note)}</p>${a.httpStatus?`<p class="small muted">HTTP ${esc(a.httpStatus)}</p>`:''}</details>`:'';
 return `<div class="source-link-audit"><span class="audit-status audit-status-${status}">${esc(labels[status])}</span>${date?`<span class="small muted">${esc(c.date)} <time datetime="${date}">${new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}</time></span>`:''}${detail}</div>`;
}
export function correctionNotice(lang='en'){
 return `<p class="source-correction">${esc(copy(lang).correction)} <a href="mailto:contact@id-ebp.org">contact@id-ebp.org</a>.</p>`;
}
