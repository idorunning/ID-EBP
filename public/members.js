import {TYPES, CONTENT, TOPICS, METHODS, BASE_COUNTRIES, LANGUAGES, COUNTRY_CODES} from './data.js';
import {LABELS} from './i18n.js';

// Account data stays in an HttpOnly, same-origin session. This module never stores
// credentials or pretends a local form submission has reached the service.
const COPY = {
  en: {
    community:'The ID-EBP community', account:'Your account', members:'Member workspace', sourceWorkspace:'Your sources', admin:'Administration',
    login:'Sign in', register:'Join the community', signOut:'Sign out', loading:'Checking the account service…',
    intro:'Help other people find useful research, practice and ideas. Add searchable tags, rate sources and manage the sources you represent.',
    loginIntro:'Use your email address. We will send a one-time code so you can sign in without a password.',
    registerIntro:'Create a member account to add tags and rate sources. If you represent a listed source, you can also request access to its profile.',
    setupTitle:'Account activation required', setupBody:'The account service is temporarily unavailable. You can still browse the directory. Nothing entered here is submitted while it is inactive.',
    setupShort:'Shared contributions are available when the account service is connected.', serviceUnavailable:'The account service could not be reached. Try again shortly.',
    email:'Email address', name:'Your name', nameHint:'Your account name is not a public source contact.', sendCode:'Send my sign-in code', sending:'Sending…',
    codeTitle:'Check your email', codeBody:'Enter the one-time code sent to {email}.', code:'Email verification code', verify:'Verify email and sign in',
    changeEmail:'Use another email address', resend:'Send another code', privacy:'Your sign-in email stays private. It is used to secure your account and check source ownership.',
    already:'Already a member?', create:'Create an account', accountOverview:'Your membership', confirmed:'Email confirmed', unconfirmed:'Email not confirmed',
    emailRequirement:'Confirm your email before making shared contributions or requesting source access.',
    memberBenefits:'Make the directory more useful', tagsBenefit:'Add searchable community tags', ratingsBenefit:'Rate the usefulness of sources', sourcesBenefit:'Manage a source you represent',
    browse:'Browse the sources', addTags:'Open a source profile to suggest a tag or give it a rating.',
    sourceIntro:'Manage your source block after confirming an approved contact email or completing an ownership review.',
    managed:'Sources you manage', noManaged:'You do not manage any sources yet.', findSource:'Find your source', selectSource:'Choose a listed source',
    claim:'Request source access', claimHint:'Use the source’s approved contact email. Other organisation addresses are checked by an administrator.',
    claimRequested:'Your claim has been recorded and is awaiting administrator review. You can check its progress in Your sources.',
    signInRequired:'Sign in to contribute', signInClaim:'Sign in using your source email address to request management access.',
    claimSource:'Request access to this source', claimSelected:'Source selected', claims:'Your source requests', pending:'Awaiting review', approved:'Approved', rejected:'Not approved',
    edit:'Edit source details', sourceName:'Source name', publisher:'Organisation or author', description:'Source description', descriptionHint:'Describe the source, rather than translating or reproducing its research. Maximum 600 characters.',
    topics:'Topics', methods:'Research methods', content:'What this source provides', choose:'Select any that apply', submitRevision:'Submit changes for review',
    revisionHelp:'Changes are reviewed before they appear publicly. Source access does not bypass the checks used for every listing.',
    revisionSubmitted:'Changes submitted — awaiting approval. Your changes will appear publicly once approved.', website:'Website', country:'Country', languages:'Source languages',
    communityTitle:'Help others find this source', communityIntro:'Members can add searchable tags and rate this source. Tags are checked before publication.',
    aggregateEmpty:'Not rated yet', aggregate:'{average} out of 5 · {count} ratings', yourRating:'Your rating', ratingHint:'Select a star to rate this source’s usefulness.',
    zeroStars:'0 stars', stars:'{count} stars', saveRating:'Save rating', removeRating:'Remove my rating', ratingSaved:'Your rating has been saved.', ratingRemoved:'Your rating has been removed.',
    ratingMissing:'Select a star rating.', tagLabel:'Suggest a searchable tag', tagPlaceholder:'For example, neighbourhood policing', tagHint:'Use a short topic, method or subject. Do not include personal information.',
    submitTag:'Submit tag', tagSubmitted:'Your tag has been submitted for review. It will become searchable when approved.', tags:'Community tags', noTags:'No community tags have been approved yet.',
    verifiedDomain:'Approved source contact confirmed', verifiedOrganisation:'Verified source owner', notVerified:'Source ownership not yet verified',
    ratingRank:'Community ratings and verified source ownership contribute to source rankings. They do not establish the quality of individual research studies.',
    contributions:'Your contributions', noContributions:'Your submitted tags will appear here.', status:'Status', openProfile:'Open public profile',
    adminIntro:'Review source requests, proposed profile changes and community tags. Approval is recorded and published through the account service.',
    adminOnly:'Administrator access is required.', adminLogin:'Sign in with an administrator account to open the review queue.',
    reviewQueue:'Review queue', noReviews:'There is nothing awaiting review.', tagReview:'Community tags', claimReview:'Source access requests', revisionReview:'Profile changes',
    approve:'Approve', reject:'Reject', reason:'Review note', reasonHint:'Explain the decision. This note is recorded with the review.', decisionSaved:'The review decision has been recorded.',
    source:'Source', submittedBy:'Submitted by', proposed:'Proposed details', viewSource:'View source', refresh:'Refresh',
    requestError:'We could not complete that request. Please try again.', rateLimited:'Too many requests. Please wait before trying again.',
    invalidCode:'That code is invalid or has expired. Request another code and try again.', invalidEmail:'Enter a valid email address.',
    unauthorised:'Your session has ended. Sign in again.', forbidden:'Your account cannot perform this action. Check your administrator or source access.',
    csrf:'Please refresh this page, then try again.', badRequest:'Please check the details you entered.', domainMismatch:'Your email domain could not establish source ownership. Your request needs administrator review.',
    sourceUnavailable:'This source could not be found.', saved:'Saved', back:'Back to your sources', ownRating:'Your current rating: {count} out of 5',
    claimState:'{source} · {state}', editorAdded:'Listed source', activation:'Activation', memberNavigation:'Member navigation',
    publicTags:'Approved tags are public and searchable. Your email is never included.', editUnavailable:'Source details are not available in this version of the catalogue.',
    available:'Available', closed:'Not connected', optional:'Optional', newSource:'Suggest a source', newSourceIntro:'Know a useful source that is missing? Submit its public website for review.',
    submitSource:'Submit source for review', sourceSubmitted:'Your source suggestion has been saved for review.', sourceReview:'New source suggestions',
  },
  fr: {
    community:'La communauté ID-EBP', account:'Votre compte', members:'Espace membre', sourceWorkspace:'Vos sources', admin:'Administration',
    login:'Se connecter', register:'Rejoindre la communauté', signOut:'Se déconnecter', loading:'Vérification du service de comptes…',
    intro:'Aidez chacun à trouver des recherches, des pratiques et des idées utiles. Ajoutez des mots-clés, évaluez les sources et gérez celles que vous représentez.',
    loginIntro:'Utilisez votre adresse électronique. Nous vous enverrons un code à usage unique pour vous connecter sans mot de passe.',
    registerIntro:'Créez un compte membre pour ajouter des mots-clés et évaluer les sources. Si vous représentez une source, vous pouvez demander à gérer sa fiche.',
    setupTitle:'Activation des comptes nécessaire', setupBody:'Les écrans peuvent être consultés. La connexion par courriel et les contributions partagées seront disponibles lorsque le service sécurisé sera connecté. Aucune saisie n’est envoyée tant qu’il est inactif.',
    setupShort:'Les contributions partagées seront disponibles lorsque le service de comptes sera connecté.', serviceUnavailable:'Le service de comptes est inaccessible. Réessayez dans un instant.',
    email:'Adresse électronique', name:'Votre nom', nameHint:'Le nom de votre compte n’est pas un contact public de la source.', sendCode:'Envoyer mon code de connexion', sending:'Envoi…',
    codeTitle:'Consultez votre messagerie', codeBody:'Saisissez le code à usage unique envoyé à {email}.', code:'Code de vérification', verify:'Vérifier et se connecter',
    changeEmail:'Utiliser une autre adresse', resend:'Envoyer un autre code', privacy:'Votre adresse de connexion reste privée. Elle protège votre compte et permet de vérifier votre lien avec une source.',
    already:'Déjà membre ?', create:'Créer un compte', accountOverview:'Votre adhésion', confirmed:'Adresse confirmée', unconfirmed:'Adresse non confirmée',
    emailRequirement:'Confirmez votre adresse avant de contribuer ou de demander la gestion d’une source.',
    memberBenefits:'Améliorez l’utilité de l’annuaire', tagsBenefit:'Ajouter des mots-clés recherchables', ratingsBenefit:'Évaluer l’utilité des sources', sourcesBenefit:'Gérer une source que vous représentez',
    browse:'Parcourir les sources', addTags:'Ouvrez une fiche pour proposer un mot-clé ou évaluer une source.',
    sourceIntro:'Gérez votre fiche après confirmation d’une adresse de contact approuvée ou examen de votre demande.',
    managed:'Sources que vous gérez', noManaged:'Vous ne gérez encore aucune source.', findSource:'Trouvez votre source', selectSource:'Choisir une source répertoriée',
    claim:'Demander la gestion', claimHint:'Utilisez l’adresse de contact approuvée de la source. Les autres adresses institutionnelles sont examinées par l’administration.',
    claimRequested:'Votre demande a été reçue. L’accès est confirmé avec l’adresse de contact approuvée de la source ; les autres demandes sont examinées par l’administration.',
    signInRequired:'Connectez-vous pour contribuer', signInClaim:'Connectez-vous avec l’adresse de votre source pour demander sa gestion.',
    claimSource:'Demander la gestion de cette source', claimSelected:'Source sélectionnée', claims:'Vos demandes de gestion', pending:'En attente', approved:'Approuvé', rejected:'Non approuvé',
    edit:'Modifier la fiche', sourceName:'Nom de la source', publisher:'Organisation ou auteur', description:'Description de la source', descriptionHint:'Décrivez la source sans traduire ni reproduire ses recherches. 600 caractères maximum.',
    topics:'Thèmes', methods:'Méthodes de recherche', content:'Contenus proposés', choose:'Sélectionnez les éléments pertinents', submitRevision:'Soumettre les modifications',
    revisionHelp:'Les modifications sont examinées avant publication. La gestion d’une source ne dispense pas des vérifications communes à toutes les fiches.',
    revisionSubmitted:'Vos modifications ont été enregistrées pour examen.', website:'Site web', country:'Pays', languages:'Langues de la source',
    communityTitle:'Aidez à trouver cette source', communityIntro:'Les membres peuvent ajouter des mots-clés et évaluer la source. Les mots-clés sont vérifiés avant publication.',
    aggregateEmpty:'Aucune évaluation', aggregate:'{average} sur 5 · {count} évaluations', yourRating:'Votre évaluation', ratingHint:'Sélectionnez une étoile pour évaluer l’utilité de cette source.',
    zeroStars:'0 étoile', stars:'{count} étoiles', saveRating:'Enregistrer la note', removeRating:'Retirer ma note', ratingSaved:'Votre note a été enregistrée.', ratingRemoved:'Votre note a été retirée.',
    ratingMissing:'Sélectionnez une note avec les étoiles.', tagLabel:'Proposer un mot-clé', tagPlaceholder:'Par exemple, police de proximité', tagHint:'Utilisez un thème, une méthode ou un sujet court, sans informations personnelles.',
    submitTag:'Soumettre le mot-clé', tagSubmitted:'Votre mot-clé sera recherchable après approbation.', tags:'Mots-clés de la communauté', noTags:'Aucun mot-clé approuvé pour le moment.',
    verifiedDomain:'Contact approuvé de la source confirmé', verifiedOrganisation:'Organisation confirmée', notVerified:'Gestion de la source non vérifiée',
    ratingRank:'Les évaluations et la vérification de gestion contribuent au classement des sources. Elles ne déterminent pas la qualité des études individuelles.',
    contributions:'Vos contributions', noContributions:'Vos mots-clés soumis apparaîtront ici.', status:'Statut', openProfile:'Voir la fiche publique',
    adminIntro:'Examinez les demandes de gestion, modifications et mots-clés. Les décisions sont enregistrées et publiées par le service de comptes.',
    adminOnly:'Accès administrateur nécessaire.', adminLogin:'Connectez-vous avec un compte administrateur pour ouvrir la file d’examen.',
    reviewQueue:'Éléments à examiner', noReviews:'Aucun élément en attente.', tagReview:'Mots-clés', claimReview:'Demandes de gestion', revisionReview:'Modifications de fiches',
    approve:'Approuver', reject:'Refuser', reason:'Note de décision', reasonHint:'Expliquez la décision. Cette note sera enregistrée.', decisionSaved:'La décision a été enregistrée.',
    source:'Source', submittedBy:'Soumis par', proposed:'Détails proposés', viewSource:'Voir la source', refresh:'Actualiser',
    requestError:'La demande n’a pas pu être traitée. Réessayez.', rateLimited:'Trop de demandes. Veuillez patienter.',
    invalidCode:'Ce code est invalide ou expiré. Demandez un nouveau code.', invalidEmail:'Saisissez une adresse valide.',
    unauthorised:'Votre session est terminée. Reconnectez-vous.', forbidden:'Votre compte ne peut pas effectuer cette action.',
    csrf:'Actualisez cette page, puis réessayez.', badRequest:'Vérifiez les informations saisies.', domainMismatch:'Votre domaine ne suffit pas à vérifier votre droit de gestion. Un examen est nécessaire.',
    sourceUnavailable:'Cette source est introuvable.', saved:'Enregistré', back:'Retour à vos sources', ownRating:'Votre note actuelle : {count} sur 5',
    claimState:'{source} · {state}', editorAdded:'Source répertoriée', activation:'Activation', memberNavigation:'Navigation membre',
    publicTags:'Les mots-clés approuvés sont publics et recherchables. Votre adresse n’est jamais incluse.', editUnavailable:'Les détails de cette source ne sont pas disponibles dans cette version de l’annuaire.',
    available:'Disponible', closed:'Non connecté', optional:'Facultatif', newSource:'Proposer une source', newSourceIntro:'Une source utile manque ? Soumettez son site public pour examen.',
    submitSource:'Soumettre la source', sourceSubmitted:'Votre proposition a été enregistrée pour examen.', sourceReview:'Nouvelles sources proposées',
  },
  es: {
    community:'La comunidad ID-EBP', account:'Tu cuenta', members:'Espacio de miembros', sourceWorkspace:'Tus fuentes', admin:'Administración',
    login:'Iniciar sesión', register:'Unirse a la comunidad', signOut:'Cerrar sesión', loading:'Comprobando el servicio de cuentas…',
    intro:'Ayuda a encontrar investigaciones, prácticas e ideas útiles. Añade etiquetas, valora fuentes y gestiona las que representas.',
    loginIntro:'Utiliza tu correo electrónico. Te enviaremos un código de un solo uso para entrar sin contraseña.',
    registerIntro:'Crea una cuenta para añadir etiquetas y valorar fuentes. Si representas una fuente, también puedes solicitar la gestión de su ficha.',
    setupTitle:'Es necesario activar las cuentas', setupBody:'Puedes revisar las pantallas. El acceso por correo y las contribuciones compartidas estarán disponibles cuando se conecte el servicio seguro. No se envía ningún dato mientras está inactivo.',
    setupShort:'Las contribuciones compartidas estarán disponibles cuando se conecte el servicio de cuentas.', serviceUnavailable:'No se ha podido conectar con el servicio de cuentas. Inténtalo más tarde.',
    email:'Correo electrónico', name:'Tu nombre', nameHint:'El nombre de tu cuenta no es un contacto público de la fuente.', sendCode:'Enviar mi código', sending:'Enviando…',
    codeTitle:'Revisa tu correo', codeBody:'Introduce el código de un solo uso enviado a {email}.', code:'Código de verificación', verify:'Verificar correo y entrar',
    changeEmail:'Utilizar otro correo', resend:'Enviar otro código', privacy:'Tu correo de acceso es privado. Se utiliza para proteger tu cuenta y comprobar tu relación con una fuente.',
    already:'¿Ya eres miembro?', create:'Crear una cuenta', accountOverview:'Tu membresía', confirmed:'Correo confirmado', unconfirmed:'Correo sin confirmar',
    emailRequirement:'Confirma tu correo antes de contribuir o solicitar la gestión de una fuente.',
    memberBenefits:'Haz más útil el directorio', tagsBenefit:'Añadir etiquetas que se puedan buscar', ratingsBenefit:'Valorar la utilidad de las fuentes', sourcesBenefit:'Gestionar una fuente que representas',
    browse:'Explorar las fuentes', addTags:'Abre una ficha para proponer una etiqueta o valorar una fuente.',
    sourceIntro:'Gestione su ficha tras confirmar un correo de contacto aprobado o completar una revisión de titularidad.',
    managed:'Fuentes que gestionas', noManaged:'Todavía no gestionas ninguna fuente.', findSource:'Encuentra tu fuente', selectSource:'Elegir una fuente del directorio',
    claim:'Solicitar la gestión', claimHint:'Utiliza el correo de contacto aprobado de la fuente. La administración revisa las demás direcciones institucionales.',
    claimRequested:'Se ha recibido tu solicitud. El acceso se confirma con el correo de contacto aprobado de la fuente; la administración revisa las demás solicitudes.',
    signInRequired:'Inicia sesión para contribuir', signInClaim:'Entra con el correo de tu fuente para solicitar su gestión.',
    claimSource:'Solicitar acceso a esta fuente', claimSelected:'Fuente seleccionada', claims:'Tus solicitudes de gestión', pending:'Pendiente de revisión', approved:'Aprobado', rejected:'No aprobado',
    edit:'Editar la ficha', sourceName:'Nombre de la fuente', publisher:'Organización o autor', description:'Descripción de la fuente', descriptionHint:'Describe la fuente, sin traducir ni reproducir sus investigaciones. Máximo 600 caracteres.',
    topics:'Temas', methods:'Métodos de investigación', content:'Qué ofrece esta fuente', choose:'Selecciona lo que corresponda', submitRevision:'Enviar cambios a revisión',
    revisionHelp:'Los cambios se revisan antes de publicarse. El acceso a una fuente no evita las comprobaciones de todas las fichas.',
    revisionSubmitted:'Tus cambios se han guardado para su revisión.', website:'Sitio web', country:'País', languages:'Idiomas de la fuente',
    communityTitle:'Ayuda a encontrar esta fuente', communityIntro:'Los miembros pueden añadir etiquetas y valorar esta fuente. Las etiquetas se comprueban antes de publicarse.',
    aggregateEmpty:'Sin valoraciones', aggregate:'{average} de 5 · {count} valoraciones', yourRating:'Tu valoración', ratingHint:'Seleccione una estrella para valorar la utilidad de esta fuente.',
    zeroStars:'0 estrellas', stars:'{count} estrellas', saveRating:'Guardar valoración', removeRating:'Retirar mi valoración', ratingSaved:'Se ha guardado tu valoración.', ratingRemoved:'Se ha retirado tu valoración.',
    ratingMissing:'Seleccione una valoración con estrellas.', tagLabel:'Proponer una etiqueta', tagPlaceholder:'Por ejemplo, policía de proximidad', tagHint:'Utiliza un tema, método o asunto breve, sin información personal.',
    submitTag:'Enviar etiqueta', tagSubmitted:'Tu etiqueta se podrá buscar cuando sea aprobada.', tags:'Etiquetas de la comunidad', noTags:'Todavía no hay etiquetas aprobadas.',
    verifiedDomain:'Contacto aprobado de la fuente confirmado', verifiedOrganisation:'Organización confirmada', notVerified:'Gestión de la fuente sin verificar',
    ratingRank:'Las valoraciones y la verificación contribuyen al orden de las fuentes. No determinan la calidad de las investigaciones individuales.',
    contributions:'Tus contribuciones', noContributions:'Tus etiquetas enviadas aparecerán aquí.', status:'Estado', openProfile:'Ver ficha pública',
    adminIntro:'Revisa solicitudes de gestión, cambios de fichas y etiquetas. Las decisiones se registran y publican mediante el servicio de cuentas.',
    adminOnly:'Se necesita acceso de administración.', adminLogin:'Entra con una cuenta de administración para abrir la cola de revisión.',
    reviewQueue:'Cola de revisión', noReviews:'No hay elementos pendientes.', tagReview:'Etiquetas', claimReview:'Solicitudes de gestión', revisionReview:'Cambios de fichas',
    approve:'Aprobar', reject:'Rechazar', reason:'Nota de revisión', reasonHint:'Explica la decisión. Esta nota quedará registrada.', decisionSaved:'Se ha registrado la decisión.',
    source:'Fuente', submittedBy:'Enviado por', proposed:'Detalles propuestos', viewSource:'Ver fuente', refresh:'Actualizar',
    requestError:'No se ha podido completar la solicitud. Inténtalo de nuevo.', rateLimited:'Demasiadas solicitudes. Espera antes de intentarlo de nuevo.',
    invalidCode:'El código no es válido o ha caducado. Solicita otro código.', invalidEmail:'Introduce un correo válido.',
    unauthorised:'Tu sesión ha terminado. Vuelve a entrar.', forbidden:'Tu cuenta no tiene permiso para esta acción.',
    csrf:'Actualiza la página e inténtalo de nuevo.', badRequest:'Comprueba los datos introducidos.', domainMismatch:'Tu dominio no permite verificar la gestión. Tu solicitud necesita revisión.',
    sourceUnavailable:'No se ha encontrado esta fuente.', saved:'Guardado', back:'Volver a tus fuentes', ownRating:'Tu valoración actual: {count} de 5',
    claimState:'{source} · {state}', editorAdded:'Fuente del directorio', activation:'Activación', memberNavigation:'Navegación de miembros',
    publicTags:'Las etiquetas aprobadas son públicas y se pueden buscar. Nunca se incluye tu correo.', editUnavailable:'Los detalles de esta fuente no están disponibles en esta versión del directorio.',
    available:'Disponible', closed:'Sin conectar', optional:'Opcional', newSource:'Proponer una fuente', newSourceIntro:'¿Falta una fuente útil? Envía su sitio público para su revisión.',
    submitSource:'Enviar fuente a revisión', sourceSubmitted:'Tu propuesta se ha guardado para su revisión.', sourceReview:'Nuevas fuentes propuestas',
  },
};

Object.assign(COPY.en,{type:'Source type',emailSetupTitle:'Email sign-in is being connected',emailSetupBody:'New sign-ins and registrations are not yet available. Existing signed-in members can continue to use their accounts.',duplicateContribution:'You have already submitted this contribution.',claimEmail:'Source representative email',claimEvidence:'Ownership evidence',managedAccess:'You manage this source'});
Object.assign(COPY.fr,{type:'Type de source',emailSetupTitle:'Connexion par courriel en préparation',emailSetupBody:'Les nouvelles connexions et inscriptions ne sont pas encore disponibles. Les membres déjà connectés peuvent continuer à utiliser leur compte.',duplicateContribution:'Vous avez déjà soumis cette contribution.',claimEmail:'Courriel du représentant',claimEvidence:'Justificatifs de gestion',managedAccess:'Accès à la gestion confirmé'});
Object.assign(COPY.es,{type:'Tipo de fuente',emailSetupTitle:'Se está conectando el acceso por correo',emailSetupBody:'Todavía no están disponibles los nuevos accesos y registros. Los miembros con sesión abierta pueden seguir utilizando sus cuentas.',duplicateContribution:'Ya has enviado esta contribución.',claimEmail:'Correo del representante',claimEvidence:'Pruebas de gestión',managedAccess:'Acceso de gestión confirmado'});
const LANGUAGE_CODES={English:'en',French:'fr',Spanish:'es',Arabic:'ar',Portuguese:'pt',German:'de',Dutch:'nl',Italian:'it',Polish:'pl',Welsh:'cy',Irish:'ga',Swedish:'sv',Norwegian:'no',Danish:'da',Finnish:'fi',Romanian:'ro',Greek:'el',Hungarian:'hu',Czech:'cs',Ukrainian:'uk',Turkish:'tr',Russian:'ru',Hindi:'hi',Urdu:'ur',Bengali:'bn','Mandarin Chinese':'zh',Japanese:'ja',Korean:'ko',Indonesian:'id',Malay:'ms',Thai:'th',Vietnamese:'vi',Swahili:'sw',Zulu:'zu',Afrikaans:'af','Māori':'mi'};
const state = {workflows:null,sourceReport:null,analytics:null,adminTab:'sources',claimDrafts:new Map(),people:null,team:new Map(),status:null, session:{user:null}, unavailable:false, init:null, claimTarget:'', pendingEmail:'', createAccount:false, displayName:'', reviews:null, recovering:false, resetVerified:false, profiles:new Map(), communities:new Map(), publicCommunity:{}};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr = (lang,key,values={}) => (COPY[lang]?.[key] ?? COPY.en[key] ?? key).replace(/\{(\w+)\}/g, (_,name) => String(values[name] ?? ''));
const i = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({member:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',source:'<path d="M4 3h12l4 4v14H4zM15 3v5h5M8 12h8M8 16h6"/>',shield:'<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6"/>',tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'})[name] || ''}</svg>`;

export function normaliseRating(value) {
  if (value === null || value === undefined || value === '') return null;
  if(typeof value !== 'number' && (typeof value !== 'string' || !/^[0-5]$/.test(value.trim()))) return null;
  const number = typeof value === 'number' ? value : Number(value.trim());
  return Number.isInteger(number) && number >= 0 && number <= 5 ? number : null;
}

export function memberCopy(lang='en') { return {...(COPY[lang] || COPY.en)}; }
export function getMemberSession() { return state.session; }
export function publicDirectoryIsAuthoritative(){return state.directoryAuthoritative===true;}
export function getContributionSummary(sourceId) {
  const info=state.communities.get(sourceId);
  return info ? {ratingAverage:info.rating?.average ?? null,ratingCount:info.rating?.count || 0,tags:(info.tags || []).map(tag=>tag.label),domainConfirmed:Boolean(info.verification?.domainConfirmed),organisationConfirmed:Boolean(info.verification?.organisationConfirmed)} : (state.publicCommunity[sourceId] || {ratingAverage:null,ratingCount:0,tags:[],domainConfirmed:false,organisationConfirmed:false});
}
export function isMemberPath(path) { return ['/login','/register','/reset-password','/account','/members','/source-workspace','/source-preview','/admin','/admin-preview'].includes(path); }

export async function accountApi(path,{method='GET',body,accountId}={}) {
  const headers = {'Accept':'application/json'};
  if(accountId)headers['X-IDEBP-Account']=accountId;
  if (body !== undefined) headers['Content-Type']='application/json';
  if (method !== 'GET' && state.session.csrfToken) headers['X-CSRF-Token']=state.session.csrfToken;
  const response = await fetch(`/api${path}`,{method,headers,credentials:'same-origin',cache:'no-store',...(body !== undefined?{body:JSON.stringify(body)}:{})});
  const type=response.headers.get('Content-Type') || '';
  const data=type.includes('application/json') ? await response.json() : {};
  if (!response.ok) { const error=new Error(data.error?.code || (response.status===404?'unavailable':'request_failed')); error.code=data.error?.code; error.status=response.status; throw error; }
  return data;
}
const api=accountApi;

export async function initialiseMembers({refresh=false}={}) {
  if(!state.pendingEmail)try{const draft=JSON.parse(globalThis.sessionStorage?.getItem('idebp-login-draft')||'null');if(draft){state.pendingEmail=draft.email||'';state.recovering=Boolean(draft.recovering);state.createAccount=Boolean(draft.createAccount);state.displayName=draft.displayName||'';}}catch{}
  if (state.init && !refresh) return state.init;
  state.init=(async()=>{
    try {
      state.status=await api('/status'); state.unavailable=false;
      if(state.status.configured) {
        try {state.session=await api('/session');}
        catch(error) {if([401,403].includes(error.status))state.session={user:null};else state.unavailable=true;}
      }
    } catch { state.unavailable=true; state.status=state.status||{configured:false,mode:'setup_required'}; }
    return {status:state.status,session:state.session};
  })();
  return state.init;
}

export async function loadPublicContributions() {
  try { const result=await api('/community'); state.directoryAuthoritative=result.authoritative===true; state.publicCommunity=result.sources || {}; return state.publicCommunity; }
  catch { return null; }
}

function banner(lang) {
  if (!state.status) return `<div class="member-service member-service-loading" role="status">${i('info')}<p>${esc(tr(lang,'loading'))}</p></div>`;
  if(state.status.configured && state.unavailable) return `<div class="member-service" role="status">${i('info')}<p>${esc(tr(lang,'serviceUnavailable'))}</p></div>`;
  if (state.status.configured) return state.status.email===false ? `<div class="member-service" role="note">${i('mail')}<div><strong>${esc(tr(lang,'emailSetupTitle'))}</strong><p>${esc(tr(lang,'emailSetupBody'))}</p></div></div>` : '';
  return `<div class="member-service" role="note">${i('info')}<div><strong>${esc(tr(lang,state.unavailable?'serviceUnavailable':'setupTitle'))}</strong><p>${esc(tr(lang,'setupBody'))}</p></div></div>`;
}
const canWrite = () => Boolean(state.status?.configured && state.session.user?.emailConfirmed);
const disabled = () => state.status?.configured && state.status.email!==false ? '' : ' disabled';
const safeId = value => encodeURIComponent(String(value || ''));
const field = (label,name,value='',extra='') => `<label class="member-field"><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${extra}></label>`;
const messageRegion = () => '<p class="member-message" data-member-message role="status" aria-live="polite"></p>';

function nav(lang,path) {
  return `<nav class="member-nav" aria-label="${esc(tr(lang,'memberNavigation'))}">${[['/account','member','members'],['/source-workspace','source','sourceWorkspace'],['/admin','shield','admin']].map(([href,icon,key])=>`<a href="#${href}" ${path===href||path==='/members'&&href==='/account'?'aria-current="page"':''}>${i(icon)}${esc(tr(lang,key))}</a>`).join('')}</nav>`;
}

function benefits(lang) {
  return `<div class="member-benefits"><h2>${esc(tr(lang,'memberBenefits'))}</h2>${[['tag','tagsBenefit'],['star','ratingsBenefit'],['source','sourcesBenefit']].map(([icon,key])=>`<p><span>${i(icon)}</span>${esc(tr(lang,key))}</p>`).join('')}</div>`;
}

function passwordChangeView(recovery=false){return `<section class="member-panel"><h2>${recovery?'Reset your password':'Choose your new password'}</h2><p>${recovery?'Your email has been verified. Choose a unique password of at least 12 characters.':'Before using administration, replace the temporary password with a unique password of at least 12 characters.'}</p>${messageRegion()}<form data-member-form="password-change">${field('New password','password','','type="password" autocomplete="new-password" minlength="12" maxlength="128" required')}${field('Confirm new password','confirmation','','type="password" autocomplete="new-password" minlength="12" maxlength="128" required')}<button class="button">Save new password</button></form></section>`;}
function teamView(source){
 const team=state.team.get(source.slug);return `<section class="member-panel"><h2>People who manage this source</h2><p>You are the approved owner. Invite editors for this source only. They must sign in and verify the invited email address. Editors cannot invite others or transfer ownership. Every profile change still needs administrator review.</p><form data-member-form="invite-editor" data-source="${esc(source.slug)}">${field('Colleague’s email address','email','','type="email" maxlength="254" required')}<button class="button">Invite editor</button></form>${team?`<ul class="member-list">${team.members.filter(m=>m.role==='editor').map(m=>`<li>${esc(m.email)}<button class="text-button" data-member-action="revoke-editor" data-source="${esc(source.slug)}" data-user-id="${esc(m.userId)}">Remove access</button></li>`).join('')}${team.invitations.map(m=>`<li>${esc(m.email)} · awaiting acceptance<button class="text-button" data-member-action="revoke-invitation" data-source="${esc(source.slug)}" data-invitation-id="${esc(m.id)}">Cancel invitation</button></li>`).join('')}</ul>`:''}</section>`;
}
function peopleView(){
 const data=state.people;if(!data)return '';
 return `<section class="member-panel"><h2>Members and source access</h2><p>Suspension stops contributions and removes source access. Ownership transfers require a new independent review.</p><ul class="member-list">${data.members.map(m=>`<li><span>${esc(m.email)} · ${esc(m.admin?'administrator':m.state)}</span>${!m.admin&&m.state==='active'?`<form data-member-form="admin-action" data-operation="suspend_member" data-user-id="${esc(m.id)}">${field('Reason for suspension','reason','','minlength="10" maxlength="1000" required')}<button class="button button-outline button-small">Suspend member</button></form>`:!m.admin&&m.state==='suspended'?`<form data-member-form="admin-action" data-operation="reinstate_member" data-user-id="${esc(m.id)}">${field('Reason for reinstatement','reason','','minlength="10" maxlength="1000" required')}<p>Previous source roles and removed ratings are not restored automatically.</p><button class="button button-outline button-small">Reinstate member</button></form>`:''}</li>`).join('')}</ul><h3>Source representatives</h3><ul class="member-list">${data.managers.map(m=>`<li><span>${esc(m.sourceName)} · ${esc(m.email)} · ${esc(m.role)}</span><form data-member-form="admin-action" data-operation="revoke_manager" data-user-id="${esc(m.userId)}" data-source="${esc(m.slug)}">${field('Reason for removing access','reason','','minlength="10" maxlength="1000" required')}<button class="button button-outline button-small">Remove source access</button></form></li>`).join('')}</ul><details><summary>Invite another administrator</summary><p>This grants website-wide authority. The invited person must verify their email and set a password.</p><form data-member-form="admin-action" data-operation="invite_admin">${field('Administrator email','email','','type="email" required')}${field('Reason for invitation','reason','','minlength="10" maxlength="1000" required')}<button class="button">Invite administrator</button></form></details></section><section class="member-panel"><h2>Recent decisions</h2><ul class="member-list">${data.audit.map(a=>`<li><span><strong>${esc(a.action.replaceAll('_',' '))}</strong> · ${dateLabel(a.created_at)}<br>${esc(a.actor||'System')} ${a.source?'· '+esc(a.source):''}<br>${esc(a.reason)}</span></li>`).join('')}</ul></section>`;
}
function authView({path,lang}) {
  const register=path==='/register',reset=path==='/reset-password';
  if(reset&&(state.resetVerified||state.session.recoveryVerified))return passwordChangeView(true);
  if(state.session.user&&!reset) return `<div class="member-panel"><h2>${esc(tr(lang,'accountOverview'))}</h2><p>${esc(state.session.user.displayName || state.session.user.email)}</p><a class="button" href="/account">${esc(tr(lang,'members'))}${i('arrow')}</a></div>`;
  const codeStep=Boolean(state.pendingEmail);
  return `<div class="member-auth-grid"><div><h2>${reset?'Reset your password':esc(tr(lang,codeStep?'codeTitle':register?'register':'login'))}</h2><p>${reset?(codeStep?`If an account exists for ${esc(state.pendingEmail)}, a reset code is on its way. Enter it below, then choose a new password.`:'Enter the email address registered to your account. We will send a one-time password-reset code.'):esc(tr(lang,codeStep?'codeBody':register?'registerIntro':'loginIntro',{email:state.pendingEmail}))}</p>${benefits(lang)}</div><div class="member-panel">${messageRegion()}${codeStep?`<form data-member-form="verify">${field(tr(lang,'code'),'token','','type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required')}<button class="button member-full" type="submit"${disabled()}>${reset?'Verify reset code':esc(tr(lang,'verify'))}</button></form><div class="member-auth-links"><button type="button" class="text-button" data-member-action="change-email">${esc(tr(lang,'changeEmail'))}</button><button type="button" class="text-button" data-member-action="resend"${disabled()}>${esc(tr(lang,'resend'))}</button></div>`:`<form data-member-form="request" data-create-account="${register}" data-recovery="${reset}">${register?field(tr(lang,'name'),'displayName','','type="text" autocomplete="name" maxlength="100" required')+`<p class="member-hint">${esc(tr(lang,'nameHint'))}</p>`:''}${field(tr(lang,'email'),'email','','type="email" autocomplete="email" maxlength="254" required')}<button class="button member-full" type="submit"${disabled()}>${i('mail')}${reset?'Send password-reset email':esc(tr(lang,'sendCode'))}</button></form>${!register&&!reset?`<details class="member-password-login"><summary>Sign in with a password</summary><p>On your first visit, verify your email using the code above. Administrators must change their temporary password before opening the review queue.</p><form data-member-form="password">${field('Email address','email','','type="email" autocomplete="username" required')}${field('Password','password','','type="password" autocomplete="current-password" maxlength="200" required')}<button class="button">Sign in</button></form><p><a href="/reset-password">Forgot your password?</a></p></details><p><a href="/reset-password">Reset your password by email</a></p>`:''}<p class="member-hint">${esc(tr(lang,'privacy'))}</p><p class="member-auth-links">${esc(tr(lang,register?'already':'create'))} <a href="/${register?'login':'register'}">${esc(tr(lang,register?'login':'register'))}</a></p>`}</div></div>`;
}

function accountSettings(user){
 if(!user)return '';
 return `<section class="member-panel member-span"><h2>Account settings</h2><form data-member-form="account-details">${field('Display name','displayName',user.displayName,'maxlength="120" autocomplete="name"')}<button class="button">Save account details</button></form><p><a href="/reset-password">Reset your password by email</a></p><button class="button button-outline" data-member-action="export-account">Download my account and saved sources</button><details><summary>Change account email</summary><p>Verify both mailboxes within ten minutes. Changing your account email pauses source-management access until an administrator checks the new address.</p><form data-member-form="account-email">${field('New email address','email','','type="email" maxlength="254" required autocomplete="email"')}<button type="button" class="button button-outline" data-member-action="account-code" data-kind="email_current">Send code to current email</button><button type="button" class="button button-outline" data-member-action="account-code" data-kind="email_new">Send code to new email</button>${field('Code from current email','currentCode','','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required')}${field('Code from new email','newCode','','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required')}<button class="button">Verify and change email</button></form></details><details><summary>Request account deletion</summary>${state.session.deletionRequested?'<p role="status">Your deletion request is awaiting administrator handling. Contact contact@id-ebp.org about the request.</p>':`<p>This sends a request to the administrator for review. It does not immediately delete your account or public source listings.</p><form data-member-form="account-deletion"><button type="button" class="button button-outline" data-member-action="account-code" data-kind="deletion">Send verification code to my email</button>${field('Code from your account email','code','','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required')}<label class="member-check"><input type="checkbox" required> I want to request deletion of my member account.</label><button class="button">Send deletion request</button></form>`}</details></section>`;
}
function accountView({lang}) {
  const user=state.session.user;
  return `${messageRegion()}${(state.session.teamInvitations||[]).map(inv=>`<section class="member-panel"><h2>Invitation to edit ${esc(inv.name)}</h2><p>This invitation is linked to your verified email. You will be able to propose changes to this source; publication requires review.</p><form data-member-form="accept-editor" data-source="${esc(inv.slug)}" data-invitation-id="${esc(inv.id)}"><button class="button">Accept invitation</button></form></section>`).join('')}<div class="member-dashboard"><div class="member-panel member-account-card"><span class="member-avatar">${i('member')}</span><h2>${esc(user?.displayName || tr(lang,'accountOverview'))}</h2>${user?`<p>${esc(user.email)}</p><span class="member-badge ${user.emailConfirmed?'is-verified':''}">${i(user.emailConfirmed?'check':'info')}${esc(tr(lang,user.emailConfirmed?'confirmed':'unconfirmed'))}</span>${!user.emailConfirmed?`<p>${esc(tr(lang,'emailRequirement'))}</p>`:''}<button class="button button-outline" data-member-action="logout">${esc(tr(lang,'signOut'))}</button>`:`<p>${esc(tr(lang,'intro'))}</p><a class="button" href="/login">${esc(tr(lang,'login'))}</a>`}</div><div class="member-panel"><h2>${esc(tr(lang,'communityTitle'))}</h2><p>${esc(tr(lang,'addTags'))}</p>${benefits(lang)}<a class="button" href="/directory">${esc(tr(lang,'browse'))}${i('arrow')}</a></div><div class="member-panel member-span"><h2>${esc(tr(lang,'contributions'))}</h2>${state.session.tagSuggestions?.length?`<ul class="member-list">${state.session.tagSuggestions.map(tag=>`<li><strong>${esc(tag.label)}</strong><span class="member-badge">${esc(reviewState(lang,tag.state || tag.status))}</span></li>`).join('')}</ul>`:`<p>${esc(tr(lang,'noContributions'))}</p>`}</div>${accountSettings(user)}</div>`;
}

function sourceFor(sources,slug) { return sources.find(source => source.id===slug || source.slug===slug); }
function sourceSlug(source) { return source.slug || source.id; }
function reviewState(lang,value) { return tr(lang,({pending:'pending',review:'pending',approved:'approved',accepted:'approved',rejected:'rejected',denied:'rejected'})[value] || 'pending'); }
function optionLabel(value,lang) {
  if(COUNTRY_CODES[value]) return new Intl.DisplayNames([lang],{type:'region'}).of(COUNTRY_CODES[value]);
  if(LANGUAGE_CODES[value]) return new Intl.DisplayNames([lang],{type:'language'}).of(LANGUAGE_CODES[value]);
  return LABELS[lang]?.[value] || value;
}
function selectOptions(values,selected=[],lang='en') { return values.map(value=>`<option value="${esc(value)}" ${selected.includes(value)?'selected':''}>${esc(optionLabel(value,lang))}</option>`).join(''); }

function sourceEditor(source,lang) {
 if(!source)return `<p>${esc(tr(lang,'editUnavailable'))}</p>`;
 const d={...source,...source.publicDetails}, country=Object.entries(COUNTRY_CODES).find(([name,code])=>code===source.country)?.[0]||source.country;
 const languages=(source.languages||[]).map(value=>Object.entries(LANGUAGE_CODES).find(([name,code])=>code===value)?.[0]||value);
 return `<form data-member-form="revision" data-source="${esc(sourceSlug(source))}">${field(tr(lang,'sourceName'),'name',source.name,'required maxlength="160"')}${field(tr(lang,'publisher'),'publisher',source.publisher||source.owner||'','maxlength="160"')}${field('Official website','url',source.url||'','type="url" pattern="https://.+" maxlength="2048" required')}<label class="member-field"><span>${esc(tr(lang,'description'))}</span><textarea name="about" rows="5" required minlength="20" maxlength="600">${esc(source.about)}</textarea></label><div class="member-form-grid"><label class="member-field"><span>Country</span><select name="country" required>${selectOptions(BASE_COUNTRIES,[country],lang)}</select></label><label class="member-field"><span>Research languages</span><select name="languages" multiple size="5" required>${selectOptions(LANGUAGES,languages,lang)}</select></label>${[['topics',TOPICS,source.topics],['methods',METHODS,source.methods],['contentTypes',CONTENT,source.contentTypes||source.content]].map(([name,values,selected])=>`<label class="member-field"><span>${esc(tr(lang,name==='contentTypes'?'content':name))}</span><select name="${name}" multiple size="5" ${name==='contentTypes'?'required':''}>${selectOptions(values,selected||[],lang)}</select></label>`).join('')}</div><h3>Public contacts</h3><p>Use professional contact details that may be published on the source profile. Your private account email is separate.</p>${field('Public contact name','contactName',d.contactName||'','maxlength="160"')}${field('Public contact email','contactEmail',d.contactEmail||'','type="email" maxlength="254"')}${field('Public contact page','contactPage',d.contactPage||'','type="url" pattern="https://.+" maxlength="2048"')}<label class="member-field"><span>Social profile links — one HTTPS address per line, up to ten</span><textarea name="social" rows="3" maxlength="10000">${esc((d.social||[]).join('\n'))}</textarea></label><h3>Logo and photograph</h3><p>Provide public PNG, JPEG or WebP image addresses. Photographs need a public provenance page. An administrator reviews these before publication.</p>${field('Logo image address','logoUrl',d.logoUrl||'','type="url" pattern="https://.+" maxlength="2048"')}${field('Photograph image address','portraitUrl',d.portraitUrl||'','type="url" pattern="https://.+" maxlength="2048"')}${field('Photograph provenance page','portraitSourceUrl',d.portraitSourceUrl||'','type="url" pattern="https://.+" maxlength="2048"')}<p class="member-hint">Leave image addresses blank to keep existing directory images. Select removal below to clear an image.</p><label class="member-check"><input type="checkbox" name="removeLogo"> Remove current logo</label><label class="member-check"><input type="checkbox" name="removePortrait"> Remove current photograph</label>${field('Photograph description / credit','portraitAlt',d.portraitAlt||'','maxlength="300"')}<label class="member-check"><input type="checkbox" name="imagePermission" ${d.imagePermission?'checked':''}> I have permission to publish the images I provide.</label><p class="member-hint">${esc(tr(lang,'revisionHelp'))}</p><button class="button" ${canWrite()?'':'disabled'}>${esc(tr(lang,'submitRevision'))}</button>${messageRegion()}</form>`;
}

function claimDraft(slug){
 if(state.claimDrafts.has(slug))return state.claimDrafts.get(slug);
 let draft={};try{draft=JSON.parse(globalThis.sessionStorage?.getItem('idebp-claim:'+slug)||'{}');}catch{}
 state.claimDrafts.set(slug,draft);return draft;
}
function saveClaimDraft(form){
 const data=new FormData(form),slug=String(data.get('source')||'');
 const draft={...claimDraft(slug),email:String(data.get('email')||''),evidence:String(data.get('evidence')??claimDraft(slug).evidence??''),evidenceUrl:String(data.get('evidenceUrl')??claimDraft(slug).evidenceUrl??'')};
 state.claimDrafts.set(slug,draft);try{globalThis.sessionStorage?.setItem('idebp-claim:'+slug,JSON.stringify(draft));}catch{}return {slug,draft};
}
function claimForm({lang,sources,params}) {
 const selected=params?.get('claim')||state.claimTarget||'',draft=claimDraft(selected),source=sourceFor(sources,selected);
 const managed=state.session.managedSources?.some(item=>item.slug===selected);
 const claim=state.session.claims?.find(item=>item.slug===selected&&['pending','review'].includes(item.state));
 if(managed)return `<div class="claim-status" role="status"><p class="member-badge is-verified">${i('shield')}You manage this source</p><h3>${esc(source?.name||selected)}</h3><a class="button" href="/source-workspace?edit=${safeId(selected)}">${esc(tr(lang,'edit'))}</a></div>`;
 if(claim)return `<div class="claim-status" role="status"><p class="member-badge">Awaiting review</p><h3>${esc(source?.name||claim.name||selected)}</h3><p>Your email has been verified and your claim is with an administrator. You do not need to send it again.</p><button class="button button-outline" data-member-action="refresh-claim">Check claim status</button></div>`;
 const sent=Boolean(draft.sentTo);
 return `<form data-member-form="claim" data-claim-step="${sent?'code':'email'}"><ol class="claim-progress" aria-label="Claim progress"><li ${!sent?'aria-current="step"':''}>1. Email</li><li ${sent?'aria-current="step"':''}>2. Code and send</li><li>3. Review</li></ol>${source?`<input type="hidden" name="source" value="${esc(selected)}"><h3>${esc(source.name)}</h3>`:`<label class="member-field"><span>${esc(tr(lang,'selectSource'))}</span><select name="source" required><option value="">Choose a source</option>${sources.filter(s=>s.status!=='hidden').slice().sort((a,b)=>a.name.localeCompare(b.name)).map(source=>`<option value="${esc(sourceSlug(source))}" ${sourceSlug(source)===selected?'selected':''}>${esc(source.name)}</option>`).join('')}</select></label>`}<p>Enter an email you use to represent this source. An administrator will review ownership before granting access.</p>${field('Source contact email','email',draft.email||'','type="email" autocomplete="email" maxlength="254" required')}${sent?`<p class="member-hint" role="status">Code sent to ${esc(draft.sentTo)}.</p>${field('Code from your email','token','','type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required')}<p class="member-hint">You can leave this tab or switch apps to get the code. Your form stays here. Codes last 10 minutes; requesting another keeps your details.</p><details ${draft.evidence||draft.evidenceUrl?'open':''}><summary>Supporting information (optional)</summary><p>The more information you provide, the easier it is to check your claim.</p><label class="member-field"><span>Your role or anything that helps us check (optional)</span><textarea name="evidence" maxlength="2000" rows="4">${esc(draft.evidence||'')}</textarea></label>${field('Public staff, website or contact page (optional)','evidenceUrl',draft.evidenceUrl||'','type="url" pattern="https://.+" maxlength="2048"')}</details><p><button type="button" class="text-link" data-member-action="claim-code"${disabled()}>Send another code</button></p>`:''}<p class="member-hint">Your email stays private. If you are new, verifying it also creates your member account.</p><button class="button" type="submit"${disabled()}>${sent?'Send claim':'Send verification code'}</button></form>`;
}

function sourceSuggestion(lang) {
  return `<details class="member-panel member-suggestion"><summary>${esc(tr(lang,'newSource'))}</summary><p>${esc(tr(lang,'newSourceIntro'))}</p><form data-member-form="new-source">${field(tr(lang,'sourceName'),'name','','required maxlength="160"')}${field(tr(lang,'website'),'url','','type="url" placeholder="https://" pattern="https://.+" required maxlength="2048"')}<label class="member-field"><span>${esc(tr(lang,'description'))}</span><textarea name="about" rows="4" minlength="20" maxlength="600" required></textarea></label><div class="member-form-grid"><label class="member-field"><span>${esc(tr(lang,'country'))}</span><select name="country" required><option value="">—</option>${selectOptions(BASE_COUNTRIES,[],lang)}</select></label><label class="member-field"><span>${esc(tr(lang,'languages'))}</span><select name="languages" multiple size="4" required>${selectOptions(LANGUAGES,[],lang)}</select></label><label class="member-field"><span>${esc(tr(lang,'type'))}</span><select name="types" multiple size="4" required>${selectOptions(TYPES,[],lang)}</select></label></div><button class="button" type="submit" ${canWrite()?'':'disabled'}>${esc(tr(lang,'submitSource'))}</button></form></details>`;
}

function sourceWorkspaceView(context) {
  const {lang,sources,params}=context;
  const managed=state.session.managedSources || [];
  const selected=params?.get('edit');
  const owned=managed.find(s=>s.slug===selected || s.id===selected);
  return `${messageRegion()}<div class="member-source-layout"><div><section class="member-panel"><h2>${esc(tr(lang,'managed'))}</h2>${managed.length?`<div class="member-source-cards">${managed.map(item=>`<article><span class="member-icon">${i('source')}</span><div><h3>${esc(item.name || sourceFor(sources,item.slug)?.name || item.slug)}</h3><p class="member-badge is-verified">${i('shield')}${esc(tr(lang,'managedAccess'))}</p></div><div class="member-source-links"><a href="/source/${safeId(item.slug || item.id)}">${esc(tr(lang,'openProfile'))}</a><a class="button button-outline button-small" href="/source-workspace?edit=${safeId(item.slug || item.id)}">${esc(tr(lang,'edit'))}</a></div></article>`).join('')}</div>`:`<p>${esc(tr(lang,'noManaged'))}</p>`}</section>${selected?`<section class="member-panel"><h2>${esc(tr(lang,'edit'))}</h2>${owned?sourceEditor(state.profiles.get(owned.slug || owned.id) || sourceFor(sources,owned.slug || owned.id),lang)+(owned.role==='owner'?teamView(owned):''):`<p>${esc(tr(lang,'forbidden'))}</p>`}</section>`:''}${state.status?.features?.sourceSuggestions || !state.status?.configured?sourceSuggestion(lang):''}</div><aside><section class="member-panel"><h2>${esc(tr(lang,'findSource'))}</h2><p>${esc(tr(lang,'sourceIntro'))}</p>${claimForm(context)}</section>${state.session.claims?.length?`<section class="member-panel"><h2>${esc(tr(lang,'claims'))}</h2><ul class="member-list">${state.session.claims.map(claim=>`<li><strong>${esc(claim.sourceName || claim.name || sourceFor(sources,claim.sourceSlug || claim.slug)?.name || claim.sourceSlug || claim.slug || tr(lang,'source'))}</strong><span class="member-badge">${esc(reviewState(lang,claim.state || claim.status))}</span></li>`).join('')}</ul></section>`:''}</aside></div>`;
}

function reviewCard(item,kind,lang,sources) {
  const slug=item.sourceSlug || item.slug || item.source_id;
  const name=item.sourceName || item.profile?.name || sourceFor(sources,slug)?.name || slug || tr(lang,'source');
  const proposed=item.patch || item.proposed || item.changes || item.profile || (kind==='submission'?item:{});
  return `<article class="member-review"><div><span class="member-badge">${esc(tr(lang,kind==='tag'?'tagReview':kind==='claim'?'claimReview':kind==='submission'?'sourceReview':'revisionReview'))}</span><h3>${esc(kind==='tag'?item.label:name)}</h3>${slug?`<a href="/source/${safeId(slug)}">${esc(name)}</a>`:''}${item.requestedByName || item.submittedBy?`<p class="member-hint">${esc(tr(lang,'submittedBy'))}: ${esc(item.requestedByName || item.submittedBy)}</p>`:''}</div>${kind==='claim'?`<dl><dt>${esc(tr(lang,'claimEmail'))}</dt><dd>${esc(item.evidence?.contactEmail || item.email || '')}</dd>${item.evidence?`<dt>${esc(tr(lang,'claimEvidence'))}</dt><dd>${esc(item.evidence.statement||'No additional information supplied.')}</dd><dt>Email code verified</dt><dd>${dateLabel(item.evidence.mailboxVerifiedAt||item.createdAt)} · ${esc(item.evidence.contactEmail||item.evidence.verifiedEmail||'')}</dd>${adminUrl(item.evidence.publicEvidenceUrl)?`<dt>Suggested public page</dt><dd><a href="${esc(adminUrl(item.evidence.publicEvidenceUrl))}" target="_blank" rel="noopener noreferrer">${esc(item.evidence.publicEvidenceUrl)}</a></dd>`:''}`:''}</dl>`:''}${kind==='revision'||kind==='submission'?`<details><summary>${esc(tr(lang,'proposed'))}</summary><dl>${Object.entries(proposed).map(([key,value])=>`<dt>${esc(tr(lang,key==='about'?'description':key==='contentTypes'?'content':key))}</dt><dd>${esc(Array.isArray(value)?value.join(', '):typeof value==='object'?JSON.stringify(value):value)}</dd>`).join('')}</dl></details>`:''}<form data-member-form="review" data-kind="${kind}" data-review-id="${esc(item.id)}"><label class="member-field"><span>${esc(tr(lang,'reason'))}</span><textarea name="reason" rows="2" maxlength="1000"></textarea><small>${esc(tr(lang,'reasonHint'))}</small></label>${kind==='claim'?`${field('Website or verification reference','verificationUrl',sourceFor(sources,slug)?.url||'','type="url" pattern="https://.+" maxlength="2048"')}<label class="member-check"><input name="independentCheck" type="checkbox"> I have checked the claimant’s authority to represent this source.</label><p class="member-hint">Administrators can review their own source claims. The decision and reviewer are recorded. Existing ownership must be resolved before approving a different owner.</p>`:''}<div class="member-actions"><button class="button button-small" type="submit" name="decision" value="approve">${i('check')}${esc(tr(lang,'approve'))}</button><button class="button button-outline button-small member-reject" type="submit" name="decision" value="reject">${esc(tr(lang,'reject'))}</button></div></form></article>`;
}

const dateLabel=value=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
const adminUrl=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url.href:'';}catch{return '';}};
function exportAdminRows(name,rows){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),[name]:rows},null,2)],{type:'application/json'}));a.href=url;a.download=`id-ebp-${name}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function filterAdminRows(host){const query=(host.querySelector('[data-admin-search]')?.value||'').toLowerCase(),filter=host.querySelector('[data-admin-filter]')?.value||'';host.querySelectorAll('[data-admin-record]').forEach(row=>{row.hidden=!row.dataset.adminRecord.includes(query)||Boolean(filter&&row.dataset.verified!==filter);});}
function adminSourceActions(record){
 const claims=(state.reviews?.claims||[]).filter(c=>(c.sourceSlug||c.slug)===record.slug);
 const action=(operation,label,extra='')=>`<form data-member-form="admin-action" data-operation="${operation}" data-source="${esc(record.slug)}">${extra}${field('Decision reason','reason','','minlength="10" maxlength="1000" required')}<button class="button button-outline button-small">${label}</button></form>`;
 return `<details><summary>Source administration</summary>${record.duplicateOf?`<p>Duplicate of ${esc(record.duplicateOf)}. Ratings and ownership stay separate.</p>${action('undo_duplicate','Undo duplicate decision')}`:action(record.status==='published'?'hide_source':'publish_source',record.status==='published'?'Hide source':'Restore source')}${!record.duplicateOf?action('merge_duplicate','Record as duplicate',`<p>This hides this listing and redirects it to the retained source. Saved collections also receive the retained source. Ratings and ownership are preserved separately. The decision can be undone.</p><label class="member-field"><span>Retained source</span><select name="targetSlug" required><option value="">Choose retained source</option>${(state.sourceReport?.sources||[]).filter(r=>r.slug!==record.slug&&r.status==='published').map(r=>`<option value="${esc(r.slug)}">${esc(r.name)}</option>`).join('')}</select></label>`):''}${claims.length?action('resolve_ownership','Replace current ownership after review',`<p>This removes existing managers and pending editor invitations for this source and grants ownership to the independently checked claimant.</p><label class="member-field"><span>Replacement claim</span><select name="claimId" required>${claims.map(c=>`<option value="${esc(c.id)}">${esc(c.contactEmail||c.email||c.id)}</option>`).join('')}</select></label>${field('Independent public verification page','verificationUrl','','type="url" pattern="https://.+" required')}<label class="member-check"><input name="independentCheck" type="checkbox" required> I independently checked authority to represent this source.</label>`):''}${action('queue_maintenance','Queue a fresh source check')}</details>`;
}
function workflowsView(){const w=state.workflows;if(!w)return '<section class="member-panel"><h2>Workflow reports</h2><p>Refresh to load reports.</p></section>';return `<section class="member-panel"><h2>Account deletion requests</h2><p>Review requests privately and contact the member using the recorded account address before completing the deletion process. Public source records and audit retention need separate consideration.</p>${w.accountRequests.length?w.accountRequests.map(r=>`<article><strong>${esc(r.email)}</strong><p>Requested ${dateLabel(r.createdAt)}</p><form data-member-form="admin-action" data-operation="cancel_deletion_request" data-request-id="${esc(r.id)}">${field('Reason for closing without deletion','reason','','minlength="10" maxlength="1000" required')}<button class="button button-outline">Close request without deletion</button></form></article>`).join(''):'<p>No pending requests.</p>'}</section><section class="member-panel"><h2>Transactional notifications</h2><p>Claim receipts, decisions and editor invitations generated by new actions. Uncertain deliveries are held for investigation to avoid duplicate mail.</p><ul class="member-list">${w.notifications.map(n=>`<li><span>${esc(n.event_key.split(':')[0].replaceAll('-',' '))} · ${esc(n.state)} · ${dateLabel(n.sent_at||n.created_at)}</span></li>`).join('')||'<li>No notifications yet.</li>'}</ul></section><section class="member-panel"><h2>Automated source checks</h2><p>Checks run weekly and after a source is added or its website changes. Suggested descriptions, contacts and logos require review; ownership is checked separately.</p>${w.maintenance.map(m=>`<details><summary>${esc(m.name)} · ${esc(m.result.status||'Queued')}</summary><p>Last check: ${dateLabel(m.checkedAt)} · next due ${dateLabel(m.dueAt)}</p><p>${esc(m.result.note||'Awaiting automated check.')}</p><dl>${Object.entries(m.result.suggestions||{}).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(Array.isArray(value)?value.join(', '):value)}</dd>`).join('')}<dt>Sources on the same domain</dt><dd>${Number(m.result.duplicateCandidates)||0}</dd></dl></details>`).join('')}</section>`;}
function sourceManagerView(sources){
 const records=state.sourceReport?.sources||[];const verified=records.filter(s=>s.verified).length;
 return `<section class="member-panel"><div class="member-section-head"><h2>Source manager</h2><button class="button button-outline button-small" data-member-action="export-sources">Download source records</button></div><p>${records.length} sources · ${verified} with verified ownership · ${records.reduce((n,s)=>n+Number(s.pendingClaims||0),0)} claims awaiting review</p><div class="admin-filters"><label class="member-field"><span>Find a source, email or representative</span><input type="search" data-admin-search placeholder="Search source records"></label><label class="member-field"><span>Ownership</span><select data-admin-filter><option value="">All sources</option><option value="true">Verified owner</option><option value="false">Unverified</option></select></label></div><div class="admin-source-list">${records.map(record=>{const local=sourceFor(sources,record.slug),v=record.verifications?.filter(v=>v.state==='confirmed').sort((a,b)=>String(b.verifiedAt).localeCompare(String(a.verifiedAt)))[0],search=[record.name,record.contactEmail,...(record.representatives||[]).flatMap(r=>[r.accountEmail,r.contactEmail])].join(' ').toLowerCase();return `<details class="admin-source-record" data-admin-record="${esc(search)}" data-verified="${record.verified}"><summary><span><strong>${esc(record.name)}</strong><small>${esc(record.status)}${record.pendingClaims?` · ${record.pendingClaims} pending claim${record.pendingClaims===1?'':'s'}`:''}</small></span><span class="verification-badge ${record.verified?'is-verified':''}">${record.verified?i('shield'):i('info')}${record.verified?'Verified source owner':'Unverified'}</span><span class="admin-source-date">${record.verified?dateLabel(v?.verifiedAt):'Awaiting ownership verification'}</span></summary><div class="admin-source-detail"><a href="/source/${esc(record.slug)}">Open source profile</a> · <a href="${esc(adminUrl(record.url))}" target="_blank" rel="noopener noreferrer">Official website</a><dl><dt>Public contact</dt><dd>${esc(record.contactEmail||local?.contactEmail||'See the source profile for published contacts')}</dd><dt>Source last updated</dt><dd>${dateLabel(record.updatedAt)}</dd><dt>Community rating</dt><dd>${record.ratingCount?`${Number(record.ratingAverage).toFixed(1)} / 5 · ${record.ratingCount} ratings`:'No ratings'}</dd></dl>${adminSourceActions(record)}<h3>Representatives and contact details</h3>${record.representatives?.length?record.representatives.map(r=>`<div class="admin-representative"><strong>${esc(r.role)}</strong><dl><dt>Member account</dt><dd>${esc(r.accountEmail)}</dd><dt>Source contact email</dt><dd>${esc(r.contactEmail)}</dd><dt>Access granted</dt><dd>${dateLabel(r.grantedAt)}</dd><dt>Granted by</dt><dd>${esc(r.grantedBy||v?.verifiedBy||'Recorded in verification history')}</dd><dt>Account email still matches</dt><dd>${r.emailMatches?'Yes':'No — access blocked'}</dd></dl></div>`).join(''):'<p>No approved representatives.</p>'}<h3>Verification history</h3>${record.verifications?.length?record.verifications.map(v=>`<p><strong>${esc(v.state)}</strong> · ${dateLabel(v.verifiedAt)} · ${esc(v.verifiedBy||'Reviewer not recorded')}<br>${esc(v.contactEmail||'')}<br>${esc(v.note||'')}${adminUrl(v.reference)?`<br><a href="${esc(adminUrl(v.reference))}" target="_blank" rel="noopener noreferrer">Verification reference</a>`:''}</p>`).join(''):'<p>No ownership checks recorded.</p>'}</div></details>`;}).join('')}</div></section>`;
}
function memberDirectoryView(){const members=state.people?.members||[];return `<section class="member-panel"><div class="member-section-head"><h2>Member records</h2><button class="button button-outline button-small" data-member-action="export-members">Download member records</button></div><p>${members.length} member${members.length===1?'':'s'}. Sign-in dates are recorded by the account service; they are separate from anonymous visitor traffic.</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Email / role</th><th>Joined</th><th>Last sign-in</th><th>Email verified</th><th>Sources / claims / ratings</th></tr></thead><tbody>${members.map(m=>`<tr><td><strong>${esc(m.email)}</strong><br>${esc(m.admin?'Administrator':m.state)}</td><td>${dateLabel(m.createdAt)}</td><td>${dateLabel(m.lastSignIn)}</td><td>${dateLabel(m.emailConfirmedAt)}</td><td>${m.sourceCount} / ${m.claimCount} / ${m.ratingCount}</td></tr>`).join('')}</tbody></table></div></section>${peopleView()}`;}
function analyticsView(){const data=state.analytics||{},cf=data.cloudflare||{},ga=data.google||{};return `<section class="member-panel"><h2>People visiting ID-EBP</h2><p>Browser visits and Google users are separate measures. Raw Cloudflare request totals include crawlers and are excluded from this view.</p><div class="admin-traffic-grid"><article><h3>Cloudflare browser traffic</h3><p class="member-badge">${cf.status==='connected'?'Connected':cf.status==='snapshot'?'Latest retrieved figures':'Collection enabled'}</p>${cf.retrievedAt?`<p>Updated ${dateLabel(cf.retrievedAt)} · ${Number(cf.days)||7} days</p>`:''}${cf.pageViews!==undefined?`<dl><dt>Browser page views</dt><dd>${cf.pageViews}</dd><dt>Visits</dt><dd>${cf.visits}</dd></dl>`:''}<p>Visits are not distinct people. Browser analytics avoid ordinary crawlers that do not run the page, but cannot prove that every visit is human.</p><a class="button button-outline" href="https://dash.cloudflare.com/50b17fc7d1884367a1b2df1c400f8cf2/web-analytics/overview?siteTag=82c11ee74be04ada92d26a698609f874" target="_blank" rel="noopener noreferrer">Open live Cloudflare traffic</a>${!['connected','snapshot'].includes(cf.status)?'<p class="member-hint">The site is collecting browser traffic. In-page live reports need a read-only Cloudflare analytics credential.</p>':''}</article><article><h3>Google Analytics and search</h3><p class="member-badge">${ga.status==='connected'?'Connected':'Setup required'}</p>${ga.totalUsers!==undefined?`<dl><dt>Distinct users (GA4 estimate)</dt><dd>${ga.totalUsers}</dd><dt>Engaged sessions</dt><dd>${ga.engagedSessions}</dd></dl>`:''}<p>GA4 users provide an estimate of distinct users. Search Console shows search queries, impressions, clicks and indexing. These services are not yet linked to this site's reporting service.</p><p><a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Google Analytics</a> · <a href="https://search.google.com/search-console?resource_id=sc-domain%3Aid-ebp.org" target="_blank" rel="noopener noreferrer">Search Console</a></p><p class="member-hint">The connected GSC Wizard account currently requires an active subscription. No Google traffic figures are invented.</p></article></div></section>`;}

function adminView({lang,sources}) {
 if(!state.session.user?.admin)return `<div class="member-panel member-lock">${i('shield')}<h2>${esc(tr(lang,'adminOnly'))}</h2><p>${esc(tr(lang,'adminLogin'))}</p><a class="button" href="/login">Sign in</a></div>`;
 if(state.session.passwordChangeRequired)return passwordChangeView();
 const reviews=state.reviews,list=reviews?[...(reviews.tags||[]).map(item=>[item,'tag']),...(reviews.claims||[]).map(item=>[item,'claim']),...(reviews.revisions||[]).map(item=>[item,'revision']),...(reviews.submissions||[]).map(item=>[item,'submission'])]:[];
 return `${messageRegion()}<div class="member-section-head"><nav class="admin-tabs" aria-label="Administration sections">${[['sources','Source manager'],['reviews',`Review queue (${list.length})`],['members','Members & decisions'],['workflows','Checks & notifications'],['traffic','Traffic & search']].map(([tab,label])=>`<button type="button" data-member-action="admin-tab" data-tab="${tab}" ${state.adminTab===tab?'aria-current="page"':''}>${esc(label)}</button>`).join('')}</nav><button class="button button-outline button-small" data-member-action="refresh-admin">Refresh</button></div>${state.adminTab==='sources'?sourceManagerView(sources):state.adminTab==='members'?memberDirectoryView():state.adminTab==='traffic'?analyticsView():state.adminTab==='workflows'?workflowsView():`<section class="member-panel"><h2>Review queue</h2>${!reviews?'<p>Loading…</p>':list.length?`<div class="member-review-list">${list.map(([item,kind])=>reviewCard(item,kind,lang,sources)).join('')}</div>`:'<p>There is nothing awaiting review.</p>'}</section>`}`;
}

function pageContent(context) {
  const {path,lang}=context;
  const auth=path==='/login'||path==='/register'||path==='/reset-password';
  const sources=path==='/source-workspace'||path==='/source-preview';
  const admin=path==='/admin'||path==='/admin-preview';
  const title=auth?(path==='/reset-password'?'resetPassword':path==='/register'?'register':'login'):sources?'sourceWorkspace':admin?'admin':'members';
  return `<section class="container member-page-head"><p class="eyebrow">${esc(tr(lang,'community'))}</p><h1>${esc(tr(lang,title))}</h1>${!auth?`<p>${esc(tr(lang,admin?'adminIntro':sources?'sourceIntro':'intro'))}</p>`:''}</section><div class="container member-layout">${!auth?nav(lang,sources?'/source-workspace':admin?'/admin':'/account'):''}${banner(lang)}${auth?authView(context):sources?sourceWorkspaceView(context):admin?adminView(context):accountView(context)}</div>`;
}

export function renderMemberPage({path='/account',params=new URLSearchParams(),lang='en',sources=[]}={}) {
  return `<div class="members-app" data-member-page data-member-path="${esc(path)}" data-member-query="${esc(params.toString())}">${pageContent({path,params,lang,sources})}</div>`;
}

function errorText(lang,error) {
  const code=error.code || '';
  const denied={own_source_rating:'Source representatives cannot rate their own source.',account_suspended:'Your account is suspended. Contact contact@id-ebp.org to have access reviewed.',admin_required:'This action requires an active administrator account.',source_access_required:'Your account does not have approved management access to this source.',ownership_conflict:'This claim conflicts with existing ownership, or the account email has changed. An administrator must resolve it first.',password_change_required:'Choose a new account password before using administration.',account_changed:'The signed-in account has changed. Sign in again before synchronising your saved sources.'};
  if(denied[code])return denied[code];
  const key=({setup_required:'setupShort',rate_limited:'rateLimited',invalid_email:'invalidEmail',invalid_code:'invalidCode',otp_expired:'invalidCode',otp_invalid:'invalidCode',unauthenticated:'unauthorised',authentication_required:'unauthorised',forbidden:'forbidden',csrf_failed:'csrf',csrf_invalid:'csrf',invalid_csrf:'csrf',bad_request:'badRequest',validation_error:'badRequest',invalid_rating:'ratingMissing',source_not_found:'sourceUnavailable',not_found:'sourceUnavailable',sign_in_required:'unauthorised',confirmed_email_required:'emailRequirement',invalid_details:'badRequest',auth_email_unavailable:'emailSetupBody',request_code_first:'invalidCode',already_submitted:'duplicateContribution',domain_mismatch:'domainMismatch',email_not_confirmed:'emailRequirement'})[code] || (error.status===401?'unauthorised':error.status===403?'forbidden':error.status===429?'rateLimited':error.status===400?'badRequest':'requestError');
  return tr(lang,key);
}

function showMessage(host,text,error=false) {
  const region=host.querySelector('[data-member-message]');
  if(!region) return;
  region.textContent=text; region.classList.toggle('is-error',error);
  region.setAttribute('role',error?'alert':'status');
}

async function refreshSession() { const previousId=state.session.user?.id;state.session=await api('/session');if(previousId!==state.session.user?.id){state.communities.clear();state.profiles.clear();state.reviews=null;state.people=null;state.sourceReport=null;state.analytics=null;}return state.session; }

export async function completeMutation({submit,refresh=async()=>{},confirm=async()=>false}) {
 let result;
 try{result=await submit();}
 catch(error){
  // A lost response is uncertain. Read recorded state before suggesting a retry.
  if(!error.status||error.status>=500){try{if(await confirm())return {confirmed:true,refreshPending:false};}catch{}error.uncertain=true;}
  throw error;
 }
 try{await refresh();return {result,refreshPending:Boolean(result?.sessionRefreshPending)};}
 catch{return {result,refreshPending:true};}
}
const refreshNotice=' Your change was saved. The latest screen could not be refreshed; use Refresh to update it. Do not submit it again.';
function requestMessage(lang,error){return error.uncertain?'We could not confirm the result. Check the current status before sending it again. Your form details have been kept.':errorText(lang,error);}


export function bindMemberPage({root=globalThis.document,lang='en',sources=[],onChange=()=>{}}={}) {
  const host=root.querySelector('[data-member-page]'); if(!host || host.dataset.memberBound) return;
  host.dataset.memberBound='true';
  const context={path:host.dataset.memberPath,params:new URLSearchParams(host.dataset.memberQuery || ''),lang,sources};
  if(context.params.get('claim')) state.claimTarget=context.params.get('claim');
  const refresh=()=>{if(host.isConnected) host.innerHTML=pageContent(context);};
  const loadReviews=async()=>{
    if(state.session.passwordChangeRequired)return;
    if(state.session.user?.admin && ['/admin','/admin-preview'].includes(context.path)) {
      try{const reports=await Promise.allSettled([api('/admin/review'),api('/admin/people'),api('/admin/sources'),api('/admin/analytics'),api('/admin/workflows')]);for(const [n,key] of ['reviews','people','sourceReport','analytics','workflows'].entries())if(reports[n].status==='fulfilled')state[key]=reports[n].value;state.reportRefreshPending=reports.some(r=>r.status==='rejected');if(reports.every(r=>r.status==='rejected'))throw reports[0].reason;if(state.sourceReport)state.sourceReport.sources=state.sourceReport.sources.map(record=>{const local=sourceFor(sources,record.slug);return {...record,publicContact:{name:record.contactName||local?.contactName||'',email:record.contactEmail||local?.contactEmail||'',page:local?.contactPage||'',website:record.url,social:local?.social||[]}};});}
      catch(error){if(error.code==='password_change_required'){await refreshSession();return;}throw error;}
    }
  };
  const finish=async(submit,message,{update=async()=>{await refreshSession();await loadReviews();},confirm}={})=>{
    const outcome=await completeMutation({submit,refresh:update,confirm});
    refresh();showMessage(host,message+(outcome.refreshPending||state.reportRefreshPending?refreshNotice:''));
    Promise.resolve(onChange()).catch(()=>{});return outcome;
  };
  const requestClaimCode=async form=>{
    if(!form.querySelector('[name=email]').reportValidity()||!form.querySelector('[name=source]').value)return;
    const {slug,draft}=saveClaimDraft(form);
    await api(`/sources/${safeId(slug)}/claim-code`,{method:'POST',body:{email:draft.email.trim()}});
    draft.sentTo=draft.email.trim().toLowerCase();state.claimDrafts.set(slug,draft);
    try{globalThis.sessionStorage?.setItem('idebp-claim:'+slug,JSON.stringify(draft));}catch{}
    refresh();host.querySelector('[name=token]')?.focus();showMessage(host,'Code sent. You can switch to your email and return to this form.');
  };
  initialiseMembers().then(async()=>{
    try{
      if(context.path==='/reset-password')state.recovering=true;else if(!state.resetVerified)state.recovering=false;
      await loadReviews();
      const selected=context.params.get('edit');
      if(selected && state.session.managedSources?.some(item=>item.slug===selected || item.id===selected)) {
        const {profile}=await api(`/sources/${safeId(selected)}/profile`);
        if(state.session.managedSources.find(x=>x.slug===selected)?.role==='owner')state.team.set(selected,await api(`/sources/${safeId(selected)}/team`));
        if(profile) state.profiles.set(selected,{...sourceFor(sources,selected),...profile,id:selected});
      }
    }catch(error){refresh();showMessage(host,requestMessage(lang,error),true);return;}refresh();
  });
  host.addEventListener('input',event=>{const form=event.target.closest('[data-member-form=claim]');if(form&&event.target.name!=='source')saveClaimDraft(form);filterAdminRows(host);});
  host.addEventListener('change',event=>{const form=event.target.closest('[data-member-form=claim]');if(form){state.claimTarget=String(new FormData(form).get('source')||'');if(event.target.name==='source')refresh();else saveClaimDraft(form);}filterAdminRows(host);});
  host.addEventListener('click',async event=>{
    const button=event.target.closest('[data-member-action]'); if(!button) return;
    try {
      if(['revoke-editor','revoke-invitation'].includes(button.dataset.memberAction)){await finish(()=>api(`/sources/${safeId(button.dataset.source)}/revoke-editor`,{method:'POST',body:{userId:button.dataset.userId||null,invitationId:button.dataset.invitationId||null}}),'Source access has been updated.',{update:async()=>{state.team.set(button.dataset.source,await api(`/sources/${safeId(button.dataset.source)}/team`));}});}
      if(button.dataset.memberAction==='export-account'){const content=await api('/account/export');const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='id-ebp-account.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      if(button.dataset.memberAction==='account-code'){const form=button.closest('form'),emailInput=form.querySelector('[name=email]');if(button.dataset.kind==='email_new'&&!emailInput.reportValidity())return;button.disabled=true;try{await api('/account/verification',{method:'POST',body:{kind:button.dataset.kind,email:emailInput?.value}});showMessage(host,'Verification code sent. It expires in ten minutes. Keep this form open while checking your email.');}finally{button.disabled=false;}}
      if(button.dataset.memberAction==='change-email') {state.pendingEmail='';try{globalThis.sessionStorage?.removeItem('idebp-login-draft');}catch{}refresh();}
      if(button.dataset.memberAction==='logout') {await api('/auth/logout',{method:'POST',body:{}});state.session={user:null};state.communities.clear();state.resetVerified=false;state.profiles.clear();state.reviews=null;refresh();onChange();}
      if(button.dataset.memberAction==='resend') {await api('/auth/request',{method:'POST',body:{email:state.pendingEmail,createAccount:state.createAccount,purpose:state.recovering?'reset':'signin',...(state.displayName?{displayName:state.displayName}:{})}});showMessage(host,tr(lang,'codeBody',{email:state.pendingEmail}));}
      if(button.dataset.memberAction==='refresh-admin') {await loadReviews();refresh();}
      if(button.dataset.memberAction==='admin-tab'){state.adminTab=button.dataset.tab;refresh();}
      if(button.dataset.memberAction==='export-sources')exportAdminRows('sources',state.sourceReport?.sources||[]);
      if(button.dataset.memberAction==='export-members')exportAdminRows('members',state.people?.members||[]);
      if(button.dataset.memberAction==='claim-code'){button.disabled=true;try{await requestClaimCode(button.closest('form'));}finally{button.disabled=false;}}
      if(button.dataset.memberAction==='refresh-claim'){await refreshSession();refresh();onChange();}
    } catch(error) {showMessage(host,requestMessage(lang,error),true);}
  });
  host.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-member-form]'); if(!form) return; event.preventDefault();if(form.dataset.submitting)return;
    if(!state.status?.configured) {showMessage(host,tr(lang,'setupShort'),true);return;}
    const data=new FormData(form), kind=form.dataset.memberForm, submitter=event.submitter;
    if(kind==='revision')showMessage(form,'');
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);form.dataset.submitting='true';
    try {
      if(kind==='account-details'){await finish(()=>api('/account',{method:'PATCH',body:{displayName:String(data.get('displayName')||'').trim()}}),'Your account details have been saved.');
      }else if(kind==='account-email'){await finish(()=>api('/account/email',{method:'POST',body:{currentCode:String(data.get('currentCode')),newCode:String(data.get('newCode'))}}),'Your account email has been updated. Source access may need review.');
      }else if(kind==='account-deletion'){await finish(()=>api('/account/deletion-request',{method:'POST',body:{token:String(data.get('code'))}}),'Your deletion request has been recorded for administrator review.');
      }else if(kind==='password'){
        state.session=await api('/auth/password',{method:'POST',body:{email:String(data.get('email')),password:String(data.get('password'))}});globalThis.location.href=state.session.user?.admin?'/admin':'/account';onChange();
      }else if(kind==='password-change'){
        if(data.get('password')!==data.get('confirmation')){showMessage(host,'The passwords do not match.',true);return;}
        const recovered=state.resetVerified;await finish(async()=>{state.session=await api('/auth/password-change',{method:'POST',body:{password:String(data.get('password'))}});state.resetVerified=false;state.recovering=false;},'Your new password has been saved.');if(recovered)globalThis.location.href=state.session.user?.admin?'/admin':'/account';
      }else if(kind==='invite-editor'||kind==='accept-editor'){
        await finish(()=>api(`/sources/${safeId(form.dataset.source)}/${kind}`,{method:'POST',body:{email:String(data.get('email')||'').trim(),invitationId:form.dataset.invitationId}}),kind==='invite-editor'?'Invitation recorded. A service email is queued for your colleague, with instructions to sign in using this exact address and accept it.':'Invitation accepted. Open Your sources to propose changes.',{update:async()=>{await refreshSession();if(kind==='invite-editor')state.team.set(form.dataset.source,await api(`/sources/${safeId(form.dataset.source)}/team`));}});
      }else if(kind==='admin-action'){
        await finish(()=>api('/admin/manage',{method:'POST',body:{operation:form.dataset.operation,userId:form.dataset.userId,slug:form.dataset.source,targetSlug:String(data.get('targetSlug')||''),claimId:String(data.get('claimId')||''),independentCheck:data.get('independentCheck')==='on',verificationUrl:String(data.get('verificationUrl')||'').trim(),requestId:form.dataset.requestId,email:String(data.get('email')||'').trim(),reason:String(data.get('reason')||'').trim()}}),'The change has been recorded.',{update:async()=>{await loadReviews();}});
      }else if(kind==='request') {
        const email=String(data.get('email') || '').trim(); const displayName=String(data.get('displayName') || '').trim(); const createAccount=form.dataset.createAccount==='true';const recovering=form.dataset.recovery==='true';
        await api('/auth/request',{method:'POST',body:{email,createAccount,purpose:recovering?'reset':'signin',...(displayName?{displayName}:{})}});
        state.pendingEmail=email;state.recovering=recovering;state.createAccount=createAccount;state.displayName=displayName;try{globalThis.sessionStorage?.setItem('idebp-login-draft',JSON.stringify({email,recovering,createAccount,displayName}));}catch{}refresh();host.querySelector('[name="token"]')?.focus();
      } else if(kind==='verify') {
        let verified;try{verified=await api('/auth/verify',{method:'POST',body:{email:state.pendingEmail,token:String(data.get('token') || '').trim()}});}catch(error){if(!error.status||error.status>=500){const session=await api('/session').catch(()=>null);if(session?.user&&session.user.email?.toLowerCase()===state.pendingEmail.toLowerCase()&&(!state.recovering||session.recoveryVerified))verified=session;}if(!verified)throw error;}state.session=verified;state.pendingEmail='';try{globalThis.sessionStorage?.removeItem('idebp-login-draft');}catch{}if(state.recovering&&(verified.recovery||verified.recoveryVerified)){state.resetVerified=true;refresh();return;}onChange();const destination=state.claimTarget?`/source-workspace?claim=${safeId(state.claimTarget)}`:state.session.user?.admin?'/admin':'/account';state.claimTarget='';globalThis.location.href=destination;
      } else if(kind==='claim') {
        if(form.dataset.claimStep==='email'){await requestClaimCode(form);return;}
        const {slug,draft}=saveClaimDraft(form);
        if(draft.email.trim().toLowerCase()!==draft.sentTo){await requestClaimCode(form);return;}
        await finish(async()=>{
          const result=await api(`/sources/${safeId(slug)}/claim`,{method:'POST',body:{email:draft.email.trim(),token:String(data.get('token')||'').trim(),evidence:draft.evidence.trim(),evidenceUrl:draft.evidenceUrl.trim()}});
          if(result.session&&!result.sessionRefreshPending)state.session=result.session;else if(result.session)state.session={...state.session,...result.session};
          if(!state.session.claims?.some(c=>c.slug===slug))state.session.claims=[...(state.session.claims||[]).filter(c=>c.slug!==slug),{...result.claim,slug,name:sourceFor(sources,slug)?.name,state:result.claim?.state||'review'}];
          return result;
        },tr(lang,'claimRequested'),{confirm:async()=>{await refreshSession();return state.session.managedSources?.some(c=>c.slug===slug)||state.session.claims?.some(c=>c.slug===slug&&['pending','review','accepted','approved'].includes(c.state));}});
        state.claimDrafts.delete(slug);try{globalThis.sessionStorage?.removeItem('idebp-claim:'+slug);}catch{}

      } else if(kind==='revision') {
        await api(`/sources/${safeId(form.dataset.source)}/profile`,{method:'PATCH',body:{name:String(data.get('name') || '').trim(),about:String(data.get('about') || '').trim(),publisher:String(data.get('publisher') || '').trim(),topics:data.getAll('topics'),methods:data.getAll('methods'),contentTypes:data.getAll('contentTypes'),url:String(data.get('url')||'').trim(),country:COUNTRY_CODES[data.get('country')],languages:data.getAll('languages').map(name=>LANGUAGE_CODES[name]).filter(Boolean),publicDetails:{...Object.fromEntries(['contactName','contactEmail','contactPage','portraitSourceUrl','portraitAlt'].map(key=>[key,String(data.get(key)||'').trim()])),...(String(data.get('logoUrl')||'').trim()||data.get('removeLogo')?{logoUrl:data.get('removeLogo')?'':String(data.get('logoUrl')).trim()}:{}),...(String(data.get('portraitUrl')||'').trim()||data.get('removePortrait')?{portraitUrl:data.get('removePortrait')?'':String(data.get('portraitUrl')).trim()}:{}),social:String(data.get('social')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),imagePermission:data.get('imagePermission')==='on'}}});
        showMessage(form,tr(lang,'revisionSubmitted'));
        form.querySelector('[data-member-message]')?.scrollIntoView({block:'nearest'});
      } else if(kind==='new-source') {
        await api('/sources',{method:'POST',body:{name:String(data.get('name') || '').trim(),url:String(data.get('url') || '').trim(),about:String(data.get('about') || '').trim(),country:COUNTRY_CODES[data.get('country')],languages:data.getAll('languages').map(name=>LANGUAGE_CODES[name]).filter(Boolean),types:data.getAll('types')}});form.reset();showMessage(host,tr(lang,'sourceSubmitted'));
      } else if(kind==='review') {
        const review={kind:form.dataset.kind,id:form.dataset.reviewId,decision:submitter?.value,reason:String(data.get('reason') || '').trim(),independentCheck:data.get('independentCheck')==='on',verificationUrl:String(data.get('verificationUrl')||'').trim()};
        await finish(async()=>{const result=await api('/admin/review',{method:'POST',body:review});const key={tag:'tags',claim:'claims',revision:'revisions',submission:'submissions'}[review.kind];if(state.reviews?.[key])state.reviews[key]=state.reviews[key].filter(item=>item.id!==review.id);return result;},tr(lang,'decisionSaved'),{confirm:async()=>{const recorded=await api('/admin/review-status?'+new URLSearchParams({kind:review.kind,id:review.id}));if(!['approved','accepted','applied','rejected','denied'].includes(recorded.state))return false;const approved=['approved','accepted','applied'].includes(recorded.state);if(approved!==(review.decision==='approve'))return false;await loadReviews();return true;}});


      }
    } catch(error) {showMessage(kind==='revision'?form:host,requestMessage(lang,error),true);} finally {delete form.dataset.submitting;buttons.forEach(button=>button.disabled=false);}
  });
}

function ratingSummary(rating,lang,{can=false,managed=false}={}) {
 const count=Number(rating?.count)||0,average=count?Number(rating?.average):0,own=normaliseRating(rating?.own);
 return `<div class="member-rating-summary"><div class="instant-stars" role="group" aria-label="Rate this source from 1 to 5 stars">${[1,2,3,4,5].map(star=>`<button type="button" class="instant-star ${average>=star-.5?'is-filled':''}" data-rate="${star}" value="${star}" aria-label="${star} ${star===1?'star':'stars'} — click to rate" aria-pressed="${own===star}" ${managed?'disabled':''}>★</button>`).join('')}</div><strong>${count?`${average.toFixed(1)} / 5 · ${count} ${count===1?'rating':'ratings'}`:esc(tr(lang,'aggregateEmpty'))}</strong></div><p class="member-hint">${managed?'Source representatives cannot rate their own source.':can?'Click a star to rate. Click another whenever you want to change your rating.':'Sign in to rate this source.'}</p>`;
}

function contributionContent(source,lang) {
  const slug=sourceSlug(source), info=state.communities.get(slug), can=canWrite(), own=normaliseRating(info?.rating?.own);
  const tags=info?.tags || (state.publicCommunity[slug]?.tags || []).map(label=>({label}));
  const rating=info?.rating || {average:state.publicCommunity[slug]?.ratingAverage ?? null,count:state.publicCommunity[slug]?.ratingCount || 0};
  const verified=info?.verification || state.publicCommunity[slug] || {};
  return `<div class="member-contribution-head"><span class="member-icon">${i('tag')}</span><div><h2>${esc(tr(lang,'communityTitle'))}</h2><p>${esc(tr(lang,'communityIntro'))}</p></div></div>${messageRegion()}${ratingSummary(rating,lang,{can,managed:info?.managed})}<p class="member-verification ${verified.domainConfirmed||verified.organisationConfirmed?'is-verified':''}">${i('shield')}${esc(tr(lang,verified.organisationConfirmed?'verifiedOrganisation':verified.domainConfirmed?'verifiedDomain':'notVerified'))}</p>${!state.status?.configured?`<p class="member-hint">${esc(tr(lang,state.status?'setupShort':'loading'))}</p>`:!state.session.user?`<p><a href="/login">${esc(tr(lang,'signInRequired'))}</a></p>`:!state.session.user.emailConfirmed?`<p>${esc(tr(lang,'emailRequirement'))}</p>`:''}<div class="member-community-tags"><h3>${esc(tr(lang,'tags'))}</h3>${tags.length?`<div class="tags">${tags.map(tag=>`<a class="tag" href="/directory?query=${safeId(tag.label)}">${esc(tag.label)}</a>`).join('')}</div>`:`<p class="member-hint">${esc(tr(lang,'noTags'))}</p>`}</div><form data-contribution-form="tag"><label class="member-field"><span>${esc(tr(lang,'tagLabel'))}</span><input type="text" name="label" minlength="2" maxlength="60" required placeholder="${esc(tr(lang,'tagPlaceholder'))}" ${can?'':'disabled'}><small>${esc(tr(lang,'tagHint'))}</small></label><button class="button button-outline button-small" type="submit" ${can?'':'disabled'}>${esc(tr(lang,'submitTag'))}</button></form><p class="member-hint">${esc(tr(lang,'publicTags'))}</p><p class="member-ranking-note">${esc(tr(lang,'ratingRank'))}</p><a class="member-claim-link" href="/source-workspace?claim=${safeId(slug)}">${i('source')}${esc(tr(lang,info?.managed?'managedAccess':'claimSource'))}${i('arrow')}</a>`;
}

export function renderContributionWidget(source,{lang='en'}={}) {
  return `<section class="member-contribution" data-contribution-source="${esc(sourceSlug(source))}">${contributionContent(source,lang)}</section>`;
}

export function bindContributionWidgets({root=globalThis.document,lang='en',sources=[],onChange=()=>{}}={}) {
  root.querySelectorAll('[data-contribution-source]').forEach(host=>{
    if(host.dataset.contributionBound) return;host.dataset.contributionBound='true';
    const slug=host.dataset.contributionSource, source=sourceFor(sources,slug) || {id:slug};
    const refresh=()=>{if(host.isConnected) host.innerHTML=contributionContent(source,lang);};
    const load=async()=>{state.communities.set(slug,await api(`/sources/${safeId(slug)}/community`));};
    initialiseMembers().then(async()=>{try{await load();}catch{/* The source remains browsable when contributions are unavailable. */}refresh();});
    host.addEventListener('submit',async event=>{
      const form=event.target.closest('[data-contribution-form]');if(!form) return;event.preventDefault();
      if(!canWrite()) {showMessage(host,tr(lang,state.status?.configured?'signInRequired':'setupShort'),true);return;}
      const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
      try {
        const data=new FormData(form);
        if(form.dataset.contributionForm==='rating') {
          const stars=normaliseRating(data.get('rating'));if(stars===null) {showMessage(host,tr(lang,'ratingMissing'),true);return;}
          const outcome=await completeMutation({submit:()=>api(`/sources/${safeId(slug)}/rating`,{method:'PUT',body:{stars}}),refresh:load});refresh();showMessage(host,tr(lang,'ratingSaved')+(outcome.refreshPending?refreshNotice:''));onChange();
        } else {
          await api(`/sources/${safeId(slug)}/tags`,{method:'POST',body:{label:String(data.get('label') || '').trim()}});form.reset();showMessage(host,tr(lang,'tagSubmitted'));
        }
      } catch(error){showMessage(host,requestMessage(lang,error),true);}finally{buttons.forEach(button=>button.disabled=false);}
    });
    host.addEventListener('click',async event=>{
      const star=event.target.closest('[data-rate]');if(star){if(!canWrite()){globalThis.location.href='/login';return;}if(host.dataset.ratingBusy)return;host.dataset.ratingBusy='true';try{const outcome=await completeMutation({submit:async()=>{const result=await api(`/sources/${safeId(slug)}/rating`,{method:'PUT',body:{stars:Number(star.dataset.rate)}});state.communities.set(slug,{...state.communities.get(slug),...result});return result;},refresh:load,confirm:async()=>{await load();return state.communities.get(slug)?.rating?.own===Number(star.dataset.rate);}});refresh();showMessage(host,tr(lang,'ratingSaved')+(outcome.refreshPending?refreshNotice:''));Promise.resolve(onChange()).catch(()=>{});}catch(error){showMessage(host,requestMessage(lang,error),true);}finally{delete host.dataset.ratingBusy;}return;}
      if(!event.target.closest('[data-contribution-action="remove-rating"]')) return;
      try{const outcome=await completeMutation({submit:()=>api(`/sources/${safeId(slug)}/rating`,{method:'DELETE',body:{}}),refresh:load});refresh();showMessage(host,tr(lang,'ratingRemoved')+(outcome.refreshPending?refreshNotice:''));onChange();}
      catch(error){showMessage(host,requestMessage(lang,error),true);}
    });
  });
}

Object.assign(COPY.en,{rateSource:"Rate this source"});
Object.assign(COPY.fr,{rateSource:"\u00c9valuer cette source"});
Object.assign(COPY.es,{rateSource:"Valorar esta fuente"});

Object.assign(COPY.en,{sourceIntro:'Claim a source using an email code. Supporting information is optional; an administrator reviews ownership.',claimHint:'Use an email you can access to represent the source. Suggested supporting details help the review.',claimRequested:'Your email has been verified and your claim has been sent for administrator review.'});
Object.assign(COPY.fr,{sourceIntro:'Demandez la gestion d’une source avec un code reçu par courriel. Les justificatifs sont facultatifs ; une personne administratrice vérifie votre autorité.',claimHint:'Utilisez une adresse accessible pour représenter la source. Des informations complémentaires facilitent la vérification.',claimRequested:'Votre courriel a été vérifié et votre demande a été transmise pour examen administratif.',setupBody:'Le service de comptes est temporairement indisponible. Vous pouvez consulter le répertoire. Aucune saisie n’est envoyée tant que le service est inactif.'});
Object.assign(COPY.es,{sourceIntro:'Solicita gestionar una fuente con un código por correo. La información de apoyo es opcional; la administración revisa la titularidad.',claimHint:'Usa un correo al que tengas acceso para representar la fuente. La información adicional facilita la revisión.',claimRequested:'Tu correo se ha verificado y tu solicitud se ha enviado a revisión administrativa.',setupBody:'El servicio de cuentas no está disponible temporalmente. Puedes consultar el directorio. No se envía ningún dato mientras está inactivo.'});

Object.assign(COPY.en,{resetPassword:'Reset password'});Object.assign(COPY.fr,{resetPassword:'Réinitialiser le mot de passe'});Object.assign(COPY.es,{resetPassword:'Restablecer contraseña'});
