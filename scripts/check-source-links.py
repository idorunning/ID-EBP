#!/usr/bin/env python3
"""Read-only GET audit of ID-EBP source links, using Python's standard library.

No login, form submission, messaging or image download is performed. Public
contact/social links are unreviewed candidates, not verified contact details.
403/429/challenges, timeouts and transport errors are never called dead links.
"""
import argparse
import concurrent.futures
import datetime as dt
import html
from html.parser import HTMLParser
import json
import pathlib
import re
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_title = False
        self.title_done = False
        self.title = []
        self.links = []
        self.meta_refresh = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title' and not self.title_done:
            self.in_title = True
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag == 'meta' and a.get('http-equiv', '').lower() == 'refresh':
            self.meta_refresh = a.get('content')

    def handle_endtag(self, tag):
        if tag == 'title' and self.in_title:
            self.in_title = False
            self.title_done = True

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def host(url):
    return (urllib.parse.urlparse(url).hostname or '').lower().removeprefix('www.')


def candidates(parser, final_url):
    found = {'emails': [], 'contactPages': [], 'social': []}
    social_domains = {'linkedin.com', 'x.com', 'twitter.com', 'facebook.com',
                      'youtube.com', 'instagram.com', 'bsky.app'}
    for link in parser.links:
        link = html.unescape(link.strip())
        if link.lower().startswith('mailto:'):
            email = urllib.parse.unquote(link[7:].split('?')[0]).strip()
            if email and email not in found['emails']:
                found['emails'].append(email)
            continue
        url = urllib.parse.urljoin(final_url, link).split('#')[0]
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in {'https', 'http'}:
            continue
        domain = host(url)
        if any(domain == x or domain.endswith('.' + x) for x in social_domains):
            if url not in found['social']:
                found['social'].append(url)
        if domain == host(final_url) and re.search(r'contact|staff|people|our.team', parsed.path, re.I):
            if url not in found['contactPages']:
                found['contactPages'].append(url)
    return {k: v[:40] for k, v in found.items()}


def check(url, timeout):
    started = time.monotonic()
    result = {'checkedUrl': url, 'checkedAt': now(), 'method': 'GET',
              'statusCode': None, 'finalUrl': None, 'title': None,
              'outcome': 'unverified', 'error': None, 'candidates': None}
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; ID-EBP public directory link review)',
        'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5',
    })
    response = None
    try:
        try:
            response = urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            response = exc
        result['statusCode'] = response.code
        result['finalUrl'] = response.url
        result['contentType'] = response.headers.get('Content-Type', '')
        result['challengeHeaders'] = {k: v for k, v in response.headers.items()
                                      if k.lower() in ('cf-mitigated', 'x-amzn-waf-action', 'retry-after')}
        result['redirected'] = url.rstrip('/') != response.url.rstrip('/')
        result['urlIssues'] = (['stale_error_or_tracking_query']
                               if re.search(r'[?&](error|code)=', url) else [])
        # Limit bandwidth, keeping enough HTML for titles and public links.
        raw = response.read(2_000_000)
        result['bodyBytesRead'] = len(raw)
        text = raw.decode(response.headers.get_content_charset() or 'utf-8', errors='replace')
        parser = PageParser()
        if 'html' in result['contentType'] or text.lstrip().lower().startswith(('<!doctype', '<html')):
            parser.feed(text)
            result['title'] = re.sub(r'\s+', ' ', ''.join(parser.title)).strip() or None
            result['candidates'] = candidates(parser, response.url)
            result['metaRefresh'] = parser.meta_refresh
        lower = text.lower()
        title = (result['title'] or '').lower()
        status = result['statusCode']
        challenge = any(x in title for x in ('just a moment', 'access denied', 'attention required',
                                             'robot check', 'security check', 'verify you are human'))
        challenge = challenge or ('cf-chl-' in lower and 'challenge' in lower)
        challenge = challenge or ('captcha' in title)
        challenge = challenge or any('challenge' in v.lower() for v in result['challengeHeaders'].values())
        challenge = challenge or (title == 'loading' and result['statusCode'] in (200, 202, 302))
        if status in (401, 403, 407, 423, 429, 451) or challenge:
            result['outcome'] = 'access_restricted_or_challenge'
        elif status in (404, 410):
            result['outcome'] = 'broken_http'
        elif 500 <= status < 600:
            result['outcome'] = 'server_error_recheck'
        elif 200 <= status < 400:
            if re.search(r'\b(404|page not found|not found|page cannot be found|page doesn.t exist|page unavailable|site unavailable)\b', title):
                result['outcome'] = 'suspected_soft_404'
            elif any(x in lower[:200_000] for x in ('this domain is for sale', 'buy this domain',
                                                    'domain has expired', 'domain is parked')):
                result['outcome'] = 'suspected_parked_domain'
            elif result['redirected'] and host(url) != host(response.url):
                result['outcome'] = 'working_cross_domain_redirect_review'
            elif result['redirected'] and urllib.parse.urlparse(url).path.strip('/') and not urllib.parse.urlparse(response.url).path.strip('/'):
                result['outcome'] = 'working_redirect_to_homepage_review'
            elif (len(raw) < 100 and 'html' in result['contentType']) or (status == 202 and len(raw) < 1000):
                result['outcome'] = 'empty_html_response_review'
            else:
                result['outcome'] = 'working'
        else:
            result['outcome'] = 'http_response_review'
    except (urllib.error.URLError, TimeoutError, socket.timeout, ssl.SSLError, OSError, ValueError) as exc:
        result['error'] = f'{type(exc).__name__}: {exc}'
        result['outcome'] = 'transport_error_unverified'
    except Exception as exc:
        result['error'] = f'{type(exc).__name__}: {exc}'
        result['outcome'] = 'parse_or_read_error_unverified'
    finally:
        if response:
            response.close()
        result['elapsedSeconds'] = round(time.monotonic() - started, 3)
    return result


def collect_sources(sources, main_only):
    urls = {}
    def add(source, value, role):
        if isinstance(value, dict):
            value = value.get('url')
        if isinstance(value, str) and value.startswith(('http://', 'https://')):
            urls.setdefault(value, []).append({'sourceId': source['id'], 'sourceName': source['name'], 'role': role})
    for source in sources:
        add(source, source.get('url'), 'primary')
    if not main_only:
        for source in sources:
            for field in ('verificationUrls', 'social', 'publicationLinks'):
                for value in source.get(field, []) or []:
                    add(source, value, field)
            add(source, source.get('contactPage'), 'contactPage')
    return urls


def save(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('input', type=pathlib.Path)
    ap.add_argument('output', type=pathlib.Path)
    ap.add_argument('--workers', type=int, default=10)
    ap.add_argument('--timeout', type=int, default=18)
    ap.add_argument('--main-only', action='store_true')
    args = ap.parse_args()
    source_text = args.input.read_text()
    if args.input.suffix == '.js':
        # public/data.js is a JSON array export; parse data without executing JS.
        source_text = source_text.split('export const SOURCES=', 1)[1].lstrip()
        sources, _ = json.JSONDecoder().raw_decode(source_text)
    else:
        sources = json.loads(source_text)
    urls = collect_sources(sources, args.main_only)
    data = {'auditStartedAt': now(), 'input': str(args.input), 'sourceCount': len(sources),
            'uniqueUrlCount': len(urls), 'workers': args.workers, 'timeoutSeconds': args.timeout,
            'limitations': ['Access blocks and transport errors do not establish that a link is dead.',
                            'HTTP success does not establish relevance; redirected and soft-error pages need review.',
                            'Extracted contacts and social accounts are public-page candidates, requiring relevance review.',
                            'Images are not downloaded or reused by this script.'], 'results': []}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(check, url, args.timeout): url for url in urls}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            result['references'] = urls[futures[future]]
            data['results'].append(result)
            save(args.output, data)
            print(f"{len(data['results'])}/{len(urls)} {result['outcome']} {result['checkedUrl']}", flush=True)
    data['auditCompletedAt'] = now()
    counts = {}
    for r in data['results']:
        counts[r['outcome']] = counts.get(r['outcome'], 0) + 1
    data['outcomeCounts'] = counts
    primary_counts = {}
    for result in data['results']:
        n = sum(r['role'] == 'primary' for r in result['references'])
        if n:
            primary_counts[result['outcome']] = primary_counts.get(result['outcome'], 0) + n
    data['primaryOutcomeCounts'] = primary_counts
    save(args.output, data)
    candidate_output = args.output.with_name(args.output.stem.replace('results', 'candidates') + '.json')
    save(candidate_output, {
        'auditCompletedAt': data['auditCompletedAt'],
        'note': 'Unreviewed public-page candidates; relevance and ownership must be reviewed before directory use.',
        'pages': [{'checkedUrl': r['checkedUrl'], 'finalUrl': r['finalUrl'],
                   'checkedAt': r['checkedAt'], 'references': r['references'],
                   'candidates': r['candidates']}
                  for r in data['results'] if r.get('candidates') and any(r['candidates'].values())],
    })
    print(json.dumps(counts, indent=2))


if __name__ == '__main__':
    main()
