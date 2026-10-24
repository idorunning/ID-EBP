#!/usr/bin/env python3
"""Read a catalogue XLSX without altering it; export discovery metadata only.

Usage: python3 scripts/export-research.py WORKBOOK.xlsx --version 32
No spreadsheet-writing dependencies. Original evidence narratives stay in XLSX.
"""
import argparse, collections, gzip, hashlib, json, re, zipfile
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ROOT = Path(__file__).resolve().parents[1]

def read_sheets(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(e.itertext()) for e in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS):
            target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(archive.read(target)).findall('s:sheetData/s:row', NS):
                values = {}
                for cell in row.findall('s:c', NS):
                    value = cell.find('s:v', NS)
                    value = value.text if value is not None else ''
                    if cell.attrib.get('t') == 's': value = strings[int(value)] if value else ''
                    elif cell.attrib.get('t') == 'inlineStr': value = ''.join(cell.find('s:is', NS).itertext())
                    # Dates exported by the workbook are ISO strings; Excel serials
                    # require explicit styles, never guess a date from a number.
                    values[re.sub(r'\d', '', cell.attrib['r'])] = value or ''
                rows.append((int(row.attrib['r']), values))
            sheets[sheet.attrib['name']] = rows
        return sheets

def safe_url(value):
    try:
        url = urlsplit(value)
        return url.scheme in ('http', 'https') and bool(url.hostname) and not url.username and not url.password and not re.search(r'[\x00-\x20]', value)
    except ValueError: return False

def terms(value):
    return list(dict.fromkeys(t.strip() for t in re.split(r';|\n', value) if t.strip()))

def date_text(value):
    # Keep original precision. Never turn a year into 1 January.
    return value[:10] if re.fullmatch(r'\d{4}-\d\d-\d\dT00:00:00(?:\.000)?Z', value) else value

def kind(value):
    v = value.casefold()
    if 'correction' in v or 'erratum' in v: return 'Correction'
    if 'project' in v: return 'Project'
    if re.search(r'\b(collection|index|directory|bibliography|archive|landing|support|centre page)\b', v) and 'listed' not in v: return 'Collection or index'
    return 'Research or resource'

def export(path, version, output):
    sheets = read_sheets(path)
    sources = {r['A']: {'id': r['A'], 'slug': r['D'], 'name': r['E']} for n, r in sheets['Source Register'] if n > 5 and r.get('A')}
    records, withheld, ids, seen_ids = [], [], [], set()
    for n, r in sheets['Research Catalogue']:
        if n <= 5 or not r.get('A'): continue
        rid = r['A']
        if rid in seen_ids: raise ValueError('Duplicate record ID: ' + rid)
        ids.append(rid)
        seen_ids.add(rid)
        if r.get('B') not in sources: raise ValueError('Unknown source for ' + rid)
        title = r.get('E', '').strip()
        reason = 'Title missing or placeholder' if not title or title.casefold() in ('not found', 'page not found', '404', '404 not found') else None
        if not safe_url(r.get('F', '')): reason = 'No safe resource URL'
        if reason:
            withheld.append({'id': rid, 'reason': reason})
            continue
        source = sources[r['B']]
        notes = r.get('Z', '')
        citation = re.search(r'Full bibliographic citation: (.*?) Stage 2 identified;', notes)
        record = dict(id=rid, sourceId=source['id'], sourceSlug=source['slug'], source=source['name'], title=title,
            url=r['F'], authors=r.get('G', ''), publicationDate=date_text(r.get('H', '')), publisher=r.get('I', ''),
            setting=r.get('J', ''), resourceType=r.get('K', ''), kind=kind(r.get('K', '')), topic=r.get('M', ''),
            availability=r.get('Q', ''), accessNotes=r.get('R', ''), recordedTags=terms(r.get('S', '')),
            searchTerms=terms(r.get('T', '')), checked=date_text(r.get('W', '')), independentAppraisal=False)
        if citation: record['citation'] = citation.group(1)
        # Different works may share an index URL; a URL alone is not a work ID.
        if re.search(r'listing identity:|no ?individual ?url|no individual item url|index listing only', notes, re.I): record['linkScope'] = 'Source listing; individual item access not established'
        records.append(record)
    reviewed = json.loads((ROOT / 'research/relationships.json').read_text())
    by_id = {r['id']: r for r in records}
    for relation in reviewed:
        for rid in relation['recordIds']:
            if rid not in by_id: raise ValueError('Reviewed relationship ID missing: ' + rid)
            by_id[rid].setdefault('relationships', []).append(relation)
    links = collections.Counter(r['url'] for r in records)
    for r in records:
        if links[r['url']] > 1: r['sharedLinkCount'] = links[r['url']]
    snapshot = {'schemaVersion': 1, 'checkpoint': version, 'catalogueRecordCount': len(ids), 'independentAppraisals': 0,
        'notice': 'Discovery catalogue in progress. Records are not counts of independent studies. Metadata and access checks remain incomplete; no independent evidence appraisals have been completed.',
        'tagNotice': 'Recorded catalogue tags and derived search terms are separate. Legacy recorded tags have not all been verified as publisher-assigned tags.',
        'sources': list(sources.values()), 'records': records}
    output.mkdir(parents=True, exist_ok=True)
    data = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n'
    (output / 'catalogue.json').write_text(data)
    (output / 'catalogue.json.gz').write_bytes(gzip.compress(data.encode(), mtime=0))
    manifest = {'schemaVersion': 1, 'checkpoint': version, 'workbook': path.name,
        'workbookLibraryId': 'libfile_7534ed8bdf248191b404c347f13d32ba', 'workbookSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'snapshotSha256': hashlib.sha256(data.encode()).hexdigest(), 'catalogueRecords': len(ids), 'publicRecords': len(records),
        'withheldRecords': withheld, 'independentAppraisals': 0, 'sourceCount': len(sources), 'recordIds': ids,
        'reviewedRelationshipGroups': len(reviewed),
        'sharedUrlGroups': sum(count > 1 for count in links.values()),
        'sharedUrlPolicy': 'Retain distinct citation/listing IDs and show shared-link counts. Shared URLs do not demonstrate duplicate works. Existing publication/version notes remain authoritative in the workbook.',
        'excludedFields': ['L: study design/method', 'N: summary', 'O: key findings', 'P: limitations/appraisal', 'U: excerpt', 'V: unchecked related links', 'Z: internal checking notes'],
        'resume': {'stage': 2, 'stage3Gate': 'Global Stage 2 completion required', 'nextProcessingOrders': [37, 38, 39],
            'nextSources': ['Norwegian Police University College', 'IACP Evidence to Action Directory', 'Police University College Finland'],
            'instruction': 'Resolve latest workbook before resuming; follow Progress B67 and Source Register notes if they have changed.'}}
    if version != 32:
        manifest['resume'] = {'stage': 2, 'stage3Gate': 'Global Stage 2 completion required', 'instruction': 'Read the latest Progress and Source Register remaining-work notes. Do not reuse the checkpoint-32 queue.', 'recordedNextWork': dict(sheets['Progress']).get(67, {}).get('B', '')}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in manifest.items() if k not in ('recordIds',)}, ensure_ascii=False, indent=2))
    return snapshot, manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--version', type=int, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'research')
    args = parser.parse_args()
    export(args.workbook, args.version, args.output)
