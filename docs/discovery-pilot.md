# ID-EBP discovery pilot

The pilot stages discoveries for editorial review. It uses live web search for discovery and compares discoveries with the public ID-EBP catalogue. The script reads research records and published source profiles with the same public access used by the site.

## Four weekly runs

The pilot is scheduled for Monday at 06:17 Europe/London on 23 November, 30 November, 7 December and 14 December 2026. Search UK coverage every week. Rotate through Latin America, continental Europe, Africa and Asia-Pacific. Use local-language queries and search older collection gaps in the first run of each month. Overlap the recent search window by 21 days to cover late indexing. Stage up to 50 verified candidates per run.

Run the source, research and practice search agents independently. A fresh verification pass checks original pages and attributes, especially the credited creator, date scope, link, evaluation status and proposed labels. Open the official publication or repository where possible. Use Crossref or DOI resolution as a second check when a DOI is present. Preserve the original title and date precision.

## Run with agent results

Requirements are Python 3.10 or later and Node.js. Use a fresh directory for each dated run.

```sh
python3 scripts/discover-ebp.py --candidates candidates.json --output discovery-out/2026-11-23 --date 2026-11-23
```

The candidate input is a JSON array. Each row uses the fields in `FIELDS` and `LIST_FIELDS` near the top of the script, plus an `evidence` array. Its elements use `url`, `fields` and `note`. For example, a repository can support the field names `title`, `creators`, `publication` and `url`. Use `track` values `source`, `research` or `practice`. Put known alternative source URLs in `alternate_urls`. Set `verification` to `verified` when the separate verification pass supports the entry and explain partial checks or ambiguity in `verification_note`. Empty values identify unsupported facts. Use the most precise verified publication date in ISO form, with no filler month or day.

Repeat `--prior path/to/results.json` for previous runs, including the initial dry run. Their staged records participate in duplicate checks. For standalone API execution, use `--live-api` in place of `--candidates` and set `OPENAI_API_KEY` in the environment. The API path uses GPT-6.1 Sol at high effort for search and verification and GPT-6 Astra at max for up to three difficult conflicts. The output directory checkpoints successful agent calls so a retry can resume. API runs return token and search-call usage.

## Check the output

- `review.csv` is the review list with metadata, source evidence and the reason for each hold or match.
- `results.json` is the record of all candidates and dispositions. Carry it forward as the next run’s duplicate checkpoint.
- `staged.json` contains independently verified discoveries with no identified catalogue match.
- `publication-preview.json` maps supported records into the website's field names and flags works whose collection has no clear catalogue mapping. Source profiles still need editorial slug and access choices. Review related versions, proof notes and tags against the original sources before release.
- `report.json` counts the decisions, coverage and public catalogue rows checked.

The script writes files locally. The release decision is made during editorial review after checking the proposed entries and their search labels.
