export const TYPES=['EBP society','University','Researcher','Academic','Official','Professional society','Charity','Independent','Blog','Company','Research collection','Practice collection','Learning provider'];
export const CONTENT=['Original research','Evidence reviews','Research summaries','Practice examples','Implementation guides','Learning resources','Commentary','Practitioner stories','Datasets'];
export const METHODS=['Randomised controlled trials','Quasi-experimental','Systematic reviews','Qualitative research','Observational studies','Mixed methods','Process evaluation','Economic evaluation'];
export const TOPICS=['Crime prevention','Neighbourhood policing','Investigations','Safeguarding','Violence prevention','Police wellbeing','Leadership','Technology'];
export const regionCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
// Keep these labels stable across Node and browser ICU versions.
const stableRegions={HK:'Hong Kong',MO:'Macao'};
export const BASE_COUNTRIES=regionCodes.map(code=>stableRegions[code]||regionNames.of(code)).sort();
export const COUNTRIES=['International','Africa','Asia','Europe','North America','South America','Oceania','England and Wales','Scotland','Northern Ireland',...BASE_COUNTRIES];
export const LANGUAGES=['English','French','Spanish','Arabic','Portuguese','German','Dutch','Italian','Polish','Welsh','Irish','Swedish','Norwegian','Danish','Finnish','Romanian','Greek','Hungarian','Czech','Ukrainian','Turkish','Russian','Hindi','Urdu','Bengali','Mandarin Chinese','Japanese','Korean','Indonesian','Malay','Thai','Vietnamese','Swahili','Zulu','Afrikaans','Māori'];
// Canonical language values shared by source metadata, translated labels and SQL.
export const LANGUAGE_CODES={Afrikaans:'af',Arabic:'ar',Bengali:'bn',Bosnian:'bs',Czech:'cs',Danish:'da',Dutch:'nl',English:'en',Estonian:'et',Farsi:'fa',Finnish:'fi',French:'fr',German:'de',Greek:'el',Hebrew:'he',Hindi:'hi',Hungarian:'hu',Indonesian:'id',Irish:'ga',Italian:'it',Japanese:'ja',Korean:'ko',Lao:'lo',Latvian:'lv',Malay:'ms','Mandarin Chinese':'zh',Mongolian:'mn','Māori':'mi',Norwegian:'no',Polish:'pl',Portuguese:'pt',Romanian:'ro',Russian:'ru',Slovenian:'sl',Spanish:'es',Swahili:'sw',Swedish:'sv',Thai:'th',Turkish:'tr',Ukrainian:'uk',Urdu:'ur',Vietnamese:'vi',Welsh:'cy',Zulu:'zu'};

export const ORIENTATIONS=['Academic research','Operational practice','Policy','Education and training'];
export const REVIEW_TYPES=['Peer-reviewed material','Internal professional review','External review','Editorial review','Self-published','Mixed','Not specified'];

export const COUNTRY_CODES=Object.fromEntries(regionCodes.map(code=>[stableRegions[code]||regionNames.of(code),code]));
