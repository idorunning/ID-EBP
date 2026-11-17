#!/usr/bin/env python3
"""Discover and stage ID-EBP catalogue candidates for editorial review."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PILOT_START = date(2026, 11, 23)
REGIONS = (
    "Spanish- and Portuguese-speaking Latin America",
    "continental Europe, including French and German sources",
    "Africa, including French-language sources",
    "Asia-Pacific, including local-language sources",
)
ROLES = {
    "source": "Discover policing research institutes, evidence-based policing societies, and durable official collections.",
    "research": "Discover policing studies, systematic reviews, evaluations, trials, research reports and theses.",
    "practice": "Discover operational practice examples, interventions, toolkits and guidance. Record documented evaluation.",
}
FIELDS = (
    "track", "title", "publisher", "publication", "url", "resource_url", "doi",
    "country", "study_location", "resource_type", "method", "evaluation", "access",
    "summary", "catalogue_source", "verification", "verification_note",
)
LIST_FIELDS = ("creators", "languages", "aliases", "tags")
EVIDENCE_FIELDS = ("url", "fields", "note")
SOURCE_PROOF = {"title", "url", "resource_url", "country"}
WORK_PROOF = {"title", "url", "creators", "publication", "resource_type", "tags"}
API = "https://api.openai.com/v1/responses"
SOL = "gpt-6.1-sol"
ASTRA = "gpt-6-astra"


def request_json(url, headers=None, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(url, data=body, headers=headers or {})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=100 if body else 25) as response:
                return json.load(response), response.headers
        except (HTTPError, URLError, TimeoutError) as error:
            if isinstance(error, HTTPError) and error.code not in (408, 429, 500, 502, 503, 504):
                raise RuntimeError(f"{urlsplit(url).hostname} returned HTTP {error.code}") from error
            if attempt == 2:
                raise RuntimeError(f"{urlsplit(url).hostname} was unavailable after retries") from error
            time.sleep(2 ** attempt)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def modkey(value):
    value = unicodedata.normalize("NFKD", value.casefold())
    return " ".join(re.findall(r"[^\W_]+", "".join(c for c in value if not unicodedata.combining(c))))


def urlkey(value):
    try:
        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
            return ""
        host = url.hostname.removeprefix("www.").lower()
    except ValueError:
        return ""
    path = unquote(url.path).rstrip("/")
    # Retain the query to distinguish item IDs of the same repository application.
    query = urlencode(sorted(
        (k, v) for k, v in parse_qsl(url.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in {"trk", "fbclid", "gclid"}
    ))
    return host + path + (f"?{query}" if query else "")


def doikey(value):
    match = re.search(r"10\.\d{4,9}/[^\s?#\"<>]+", unquote(value).lower())
    return match.group(0) if match else ""


def catalogue():
    backend = (ROOT / "backend/research.mjs").read_text()
    origin = re.search(r"RESEARCH_ORIGIN\s*=\s*'([^']+)'", backend).group(1)
    key = re.search(r"RESEARCH_KEY\s*=\s*'(sb_publishable_[^']+)'", backend).group(1)
    if urlsplit(origin).hostname != "hvwmystbqlocjixvwgfl.supabase.co":
        raise ValueError("Unexpected public catalogue host")

    def read_table(table, select, filters=None):
        def page(offset):
            query = urlencode({"select": select, "order": "id.asc", "limit": 1000, "offset": offset, **(filters or {})})
            rows, headers = request_json(f"{origin}/rest/v1/{table}?{query}", {"apikey": key, "Prefer": "count=exact"})
            return rows, int(headers["Content-Range"].rsplit("/", 1)[1])

        first, total = page(0)
        with ThreadPoolExecutor(max_workers=4) as pool:
            pages = list(pool.map(page, range(len(first), total, len(first)))) if first else []
        rows = first + [row for part, _ in pages for row in part]
        if any(count != total for _, count in pages) or len({row["id"] for row in rows}) != total or total == 0:
            raise RuntimeError(f"{table} snapshot changed or is incomplete. Retry the run.")
        return rows

    return {
        "research": read_table("research_records", "id,title,url,doi,authors,publication,source_slug"),
        "sources": read_table("sources", "id,slug,name,website_url,country_code,publisher", {"status": "eq.published"}),
    }


def taxonomy():
    program = (
        "const {SEARCH_TOPICS} = await import('./public/search-topics.js'); "
        "process.stdout.write(JSON.stringify(SEARCH_TOPICS));"
    )
    data = subprocess.check_output(["node", "--input-type=module", "-e", program], cwd=ROOT, text=True)
    topics = json.loads(data)
    return topics, {
        modkey(alias): topic["label"] for topic in topics
        for alias in [topic["id"], topic["label"], *topic.get("aliases", [])]
    }


def object_schema(properties):
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def model_call(model, effort, instruction, prompt, limit):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY is needed for --live-api; --candidates uses external agent results.")
    string = {"type": "string"}
    array = {"type": "array", "items": string}
    evidence = object_schema({"url": string, "fields": array, "note": string})
    item = object_schema({
        **dict.fromkeys(FIELDS, string),
        **dict.fromkeys(LIST_FIELDS, array),
        "evidence": {"type": "array", "items": evidence},
    })
    data, _ = request_json(API, {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, {
        "model": model, "reasoning": {"effort": effort}, "store": False,
        "instructions": instruction, "input": prompt, "max_tool_calls": limit, "max_output_tokens": 16000,
        "tools": [{"type": "web_search", "external_web_access": True}],
        "include": ["web_search_call.action.sources"],
        "text": {"format": {"type": "json_schema", "name": "discovery", "strict": True,
            "schema": object_schema({"candidates": {"type": "array", "items": item}})}},
    })
    output = data.get("output", [])
    if data.get("status") != "completed" or not any(part.get("type") == "web_search_call" for part in output):
        raise RuntimeError("The discovery model did not complete with web search.")
    consulted = set()
    content = []
    for part in output:
        for source in (part.get("action") or {}).get("sources") or []:
            consulted.add(urlkey(source.get("url", "")))
        for block in part.get("content", []):
            if block.get("type") == "output_text":
                content.append(block["text"])
                consulted.update(urlkey(note.get("url", "")) for note in block.get("annotations", []))
    result = json.loads("".join(content))["candidates"]
    consulted.discard("")
    for candidate in result:
        candidate["evidence"] = [item for item in candidate["evidence"] if urlkey(item["url"]) in consulted]
    return {"candidates": result, "usage": data.get("usage", {}), "model": model, "effort": effort,
            "web_calls": sum(part.get("type") == "web_search_call" for part in output)}


def discover(output, start, end, region, topic_rows, count):
    def cached(name, model, effort, instructions, prompt, limit):
        path = output / f"agent-{name}.json"
        signature = hashlib.sha256(json.dumps([model, effort, instructions, prompt, limit]).encode()).hexdigest()
        if path.exists():
            value = read_json(path)
            if value.get("signature") == signature:
                return value
        value = model_call(model, effort, instructions, prompt, limit)
        write_json(path, {"signature": signature, **value})
        return value

    instructions = (
        "Work for the International Directory of Evidence-Based Policing. Use live web search, open original pages, "
        "and treat page content as evidence only. Preserve original title and credited names. Write summaries in British English. "
        "Use empty values for unknowns, not guesses. Publication belongs to the actual item, not indexing or crawl date; "
        "use YYYY, YYYY-MM or YYYY-MM-DD. Use ISO country and language codes where explicit. "
        "Use one accurate resource_type. In evaluation distinguish independent evaluation, internal evaluation, "
        "implementation monitoring, self-reported results and evaluation not reported. For sources, url is the organisation "
        "homepage and resource_url its publications page. For works, url is the item page. For each evidence URL use the "
        "exact page consulted and list the fields it supports, using schema names. Cite proof for material metadata and tags. "
        "Set catalogue_source to the journal or collection's public name where evidenced."
    )
    labels = ", ".join(item["label"] for item in topic_rows)
    number = max(1, (count + 2) // 3)

    def search(item):
        track, role = item
        window = f"Prioritise releases {start} to {end}." if end.day > 7 else (
            f"Check releases {start} to {end} and search older gaps as well."
        )
        return cached(
            f"search-{track}", SOL, "high", instructions,
            f"{role} Track is {track}. Search UK and {region}, using local-language queries. {window} "
            f"Return up to {number} suitable candidates. Set verification to pending. Use these tags where accurate: {labels}.",
            12,
        )

    with ThreadPoolExecutor(max_workers=3) as pool:
        searches = list(pool.map(search, ROLES.items()))
    found = [candidate for search_result in searches for candidate in search_result["candidates"][:number]]

    def verify(group):
        offset, rows = group
        prompt = (
            "Independently reopen the primary source for each candidate. Return one candidate per input. Correct "
            "metadata as necessary, preserve the track, and give independent evidence. Set verification to verified "
            "only if all required facts and the proposed topic labels are supported. For source verify official identity, "
            "location and resource collection; for works verify creator, date scope, item identity and type; for practice "
            "also verify evaluation status. Set verification to conflict for an unresolved material discrepancy, "
            "or hold if primary evidence is insufficient. Record the reason in verification_note. "
            "Check Crossref or the DOI landing page where a DOI is reported. Candidates: " +
            json.dumps([{key: value for key, value in row.items() if key != "evidence"} for row in rows], ensure_ascii=False)
        )
        result = cached(f"verify-{offset}", SOL, "high", instructions, prompt, 20)
        if len(result["candidates"]) != len(rows):
            raise RuntimeError("The verifier returned a different number of records from the input.")
        return result

    groups = [(i, found[i:i+4]) for i in range(0, len(found), 4)]
    with ThreadPoolExecutor(max_workers=3) as pool:
        verified = list(pool.map(verify, groups))
    final = [row for batch in verified for row in batch["candidates"]]
    escalations = []
    for i, row in enumerate(final):
        if row["verification"] == "conflict" and len(escalations) < 3:
            outcome = cached(
                f"conflict-{i}", ASTRA, "max", instructions,
                "Resolve the material conflict through primary sources. Return exactly one candidate with verification "
                "set to verified only when the conflict is resolved, or hold otherwise. " + json.dumps(row, ensure_ascii=False), 10,
            )
            if len(outcome["candidates"]) != 1:
                raise RuntimeError("The conflict verifier did not return one record.")
            escalations.append(outcome)
            final[i] = outcome["candidates"][0]
    usage = [{key: batch[key] for key in ("model", "effort", "usage", "web_calls")}
             for batch in searches + verified + escalations]
    return final, usage


def identities(row, is_source):
    names = [row.get("title") or row.get("name") or "", *row.get("aliases", [])] if is_source else []
    urls = [row.get("url") or row.get("website_url") or ""]
    if is_source:
        urls.append(row.get("resource_url") or "")
        urls.extend(row.get("alternate_urls", []))
    keys = {("url", parsed) for url in urls if (parsed := urlkey(url))}
    if is_source:
        country = row.get("country") or row.get("country_code") or ""
        keys.update(("name", (modkey(name), country.upper())) for name in names if modkey(name))
    else:
        keys.update(("doi", parsed) for value in [row.get("doi") or "", *urls] if (parsed := doikey(value)))
    return keys


def fingerprint(row):
    creators = row.get("creators") or (row.get("authors") or "").split(";")
    first = modkey(creators[0]) if creators else ""
    return modkey(row.get("title") or ""), first, str(row.get("publication") or "")[:4]


def publication_precision(value, today):
    try:
        formats = {4: ("%Y", "year"), 7: ("%Y-%m", "month"), 10: ("%Y-%m-%d", "day")}
        fmt, precision = formats[len(value)]
        parsed = datetime.strptime(value, fmt).date()
        return precision if parsed <= today and re.fullmatch(r"\d{4}(-\d{2}){0,2}", value) else ""
    except (KeyError, ValueError):
        return ""


def stage(candidates, snapshot, prior, aliases, today, cap):
    keys = {"source": defaultdict(list), "work": defaultdict(list)}
    titles = defaultdict(list)
    domains = defaultdict(set)

    def register(row, group, label):
        for identity in identities(row, group == "source"):
            keys[group][identity].append(label)
            if group == "source" and identity[0] == "url":
                domains[identity[1].partition("/")[0].partition("?")[0]].add(label)
        if group == "work":
            title, creator, year = fingerprint(row)
            if title:
                titles[title].append((creator, year, label))

    for group, rows in (("source", snapshot["sources"]), ("work", snapshot["research"])):
        for row in rows:
            register(row, group, row.get("slug") or row["id"])
    for row in prior:
        register(row, "source" if row["track"] == "source" else "work", "prior-pilot")

    results = []
    for candidate in candidates:
        row = {field: str(candidate.get(field) or "").strip() for field in FIELDS}
        row.update({field: list(dict.fromkeys(str(item).strip() for item in candidate.get(field, []) if str(item).strip()))
                    for field in LIST_FIELDS})
        row["evidence"] = [item for item in candidate.get("evidence", []) if urlkey(item.get("url", ""))]
        row["alternate_urls"] = [item for item in candidate.get("alternate_urls", []) if urlkey(item)]
        row["doi"] = doikey(row["doi"]) if row["doi"] else doikey(row["url"])
        row["tags"] = list(dict.fromkeys(aliases.get(modkey(tag), tag) for tag in row["tags"]))
        row["checked"] = today.isoformat()
        row["publication_precision"] = publication_precision(row["publication"], today)
        group = "source" if row["track"] == "source" else "work"
        matches = {match for key in identities(row, group == "source") for match in keys[group][key]}
        issues = []
        if not matches and group == "source":
            host = urlkey(row["url"]).partition("/")[0].partition("?")[0]
            if host in domains:
                issues.append("Existing source on the same host: " + ", ".join(sorted(domains[host])))
        if not matches and group == "work":
            title, creator, year = fingerprint(row)
            for old_creator, old_year, label in titles.get(title, []):
                if title and creator and year and (creator, year) == (old_creator, old_year):
                    matches.add(label)
                else:
                    issues.append(f"Exact title with different or missing attribution/date: {label}")
            # Similar titles by the same credited creator may be a preprint or revised edition.
            if not matches and creator and year.isdigit() and len(title) >= 22:
                for old_title, entries in titles.items():
                    if old_title == title or abs(len(old_title) - len(title)) > max(20, len(title) // 3):
                        continue
                    for old_creator, old_year, label in entries:
                        if old_creator == creator and old_year.isdigit() and abs(int(old_year) - int(year)) <= 2:
                            if SequenceMatcher(None, title, old_title).ratio() >= .86:
                                issues.append(f"Possible version or near duplicate: {label}")
        if row["track"] not in ROLES:
            issues.append("Unknown discovery track")
        if not row["title"] or not urlkey(row["url"]) or not row["resource_type"] or not row["summary"] or not row["languages"]:
            issues.append("Missing title, original URL, type, summary or language")
        required_proof = set(SOURCE_PROOF if group == "source" else WORK_PROOF)
        if group == "source":
            if not urlkey(row["resource_url"]) or not re.fullmatch(r"[A-Z]{2}", row["country"]):
                issues.append("Missing collection URL or valid ISO country")
        elif not (row["creators"] and row["publication_precision"] and row["publisher"] and row["tags"] and row["access"]):
            issues.append("Missing credited creator, valid publication date, publisher, tags or access status")
        if row["track"] == "practice":
            required_proof.add("evaluation")
            if not row["evaluation"]:
                issues.append("Missing evaluation status")
        if row["doi"]:
            required_proof.add("doi")
        proved = {field for item in row["evidence"] for field in item.get("fields", [])}
        if required_proof - proved:
            issues.append("Missing evidence for " + ", ".join(sorted(required_proof - proved)))
        if row["verification"] != "verified":
            issues.append("Independent verification is incomplete")
        if matches:
            status = "catalogue_match"
        elif issues:
            status = "review"
        elif sum(item["status"] == "staged" for item in results) >= cap:
            status = "reserve"
        else:
            status = "staged"
        row.update(status=status, issues=list(dict.fromkeys(issues)), matches=sorted(matches))
        results.append(row)
        if status == "staged":
            register(row, group, "same-pilot")
    return results


def publication_preview(rows, sources):
    source_names = defaultdict(list)
    for source in sources:
        for name in {source['slug'], source['name']}:
            source_names[modkey(name)].append(source['slug'])
    preview = {'sources': [], 'research_records': [], 'source_mapping_required': []}
    for row in rows:
        if row['status'] != 'staged':
            continue
        if row['track'] == 'source':
            # Slugs and access classifications are reviewed with the source profile.
            preview['sources'].append({
                'name': row['title'], 'website_url': row['url'], 'publisher': row['publisher'],
                'country_code': row['country'], 'research_languages': row['languages'],
                'about': row['summary'], 'description_language': 'en', 'kinds': [row['resource_type']],
                'topics': row['tags'], 'provenance': 'editor_added', 'status': 'review',
                'public_details': {'aliases': row['aliases'], 'resourcesUrl': row['resource_url']},
            })
            continue
        name = row['catalogue_source'] or row['publisher']
        matches = set(source_names[modkey(name)])
        if len(matches) != 1:
            preview['source_mapping_required'].append({'title': row['title'], 'url': row['url'], 'source': name})
            continue
        identity = row['doi'] or urlkey(row['url'])
        identifier = 'IDEBP-WEB-' + hashlib.sha256(identity.encode()).hexdigest()[:24].upper()
        preview['research_records'].append({
            'id': identifier, 'source': name, 'source_slug': matches.pop(), 'title': row['title'],
            'url': row['url'], 'authors': '; '.join(row['creators']), 'publication': row['publication'],
            'kind': row['resource_type'], 'summary': row['summary'], 'access': row['access'],
            'status': 'Discovery pilot', 'checked': row['checked'], 'tags': row['tags'],
            'related_terms': '; '.join(filter(None, (row['method'], row['evaluation'], row['study_location']))),
            'doi': row['doi'] or None,
        })
    return preview


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--candidates", type=Path, help="JSON candidate array from external search and verification agents")
    mode.add_argument("--live-api", action="store_true", help="Run search and verification using OPENAI_API_KEY")
    parser.add_argument("--prior", type=Path, action="append", default=[], help="Prior results.json, repeat as needed")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--date", type=date.fromisoformat, default=datetime.now(ZoneInfo("Europe/London")).date())
    parser.add_argument("--region")
    parser.add_argument("--limit", type=int, choices=range(1, 51), default=50, metavar="1–50")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    end = args.date
    week = max(0, (end - PILOT_START).days // 7)
    region = args.region or REGIONS[week % len(REGIONS)]
    # Overlap search windows to catch late indexing; previous proposed entries participate in duplicate checks.
    start = end - timedelta(days=21)
    topic_rows, aliases = taxonomy()
    usage = []
    if args.live_api:
        candidates, usage = discover(args.output, start, end, region, topic_rows, args.limit)
    else:
        candidates = read_json(args.candidates)
        if not isinstance(candidates, list):
            parser.error("--candidates must contain a JSON array")
    prior = [row for path in args.prior for row in read_json(path) if row["status"] == "staged"]
    snapshot = catalogue()
    rows = stage(candidates, snapshot, prior, aliases, end, args.limit)
    preview = publication_preview(rows, snapshot['sources'])
    report = {
        "checked": end.isoformat(), "window_start": start.isoformat(), "region": region,
        "research_records_checked": len(snapshot["research"]), "published_sources_checked": len(snapshot["sources"]),
        "counts": dict(Counter(row["status"] for row in rows)),
        "staged_by_track": dict(Counter(row["track"] for row in rows if row["status"] == "staged")),
        "staged_by_country": dict(Counter(row["country"] or "unspecified" for row in rows if row["status"] == "staged")),
        "staged_by_language": dict(Counter(language for row in rows if row["status"] == "staged" for language in row["languages"])),
        "website_preview": {name: len(records) for name, records in preview.items()},
        "api_usage": usage, "mode": "live-api" if args.live_api else "external-agents",
    }
    write_json(args.output / "results.json", rows)
    write_json(args.output / "staged.json", [row for row in rows if row["status"] == "staged"])
    write_json(args.output / "report.json", report)
    write_json(args.output / "publication-preview.json", preview)
    fields = ("status", "track", "title", "publisher", "publication", "publication_precision", "url", "resource_url",
              "doi", "creators", "languages", "country", "study_location", "resource_type", "method", "evaluation",
              "access", "tags", "summary", "evidence", "matches", "issues", "verification_note", "checked")
    with (args.output / "review.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            cells = {field: json.dumps(row[field], ensure_ascii=False) if isinstance(row[field], list) else row[field]
                     for field in fields}
            # Treat cells that look like formulas as plain text in spreadsheet viewers.
            writer.writerow({key: "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value
                             for key, value in cells.items()})
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
