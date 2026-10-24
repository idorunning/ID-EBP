"""Export public catalogue metadata from the coordinator workbook; retain stable IDs."""
import sys,json,re,datetime,pathlib,collections
import openpyxl
w=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)
rows=list(w['Research Catalogue'].values)[5:]
def val(v):return v.isoformat()[:10] if isinstance(v,(datetime.datetime,datetime.date)) else str(v or '').strip()
def terms(v):return list(dict.fromkeys(t.strip() for t in re.split(r';|\n',val(v)) if 1<len(t.strip())<150))
records=[];excluded=[]
for r in rows:
 if not r[0]:continue
 if not r[4] or 'candidate metadata' in val(r[24]).lower():excluded.append(val(r[0]));continue
 item=dict(zip(['id','source','source_slug','title','url','authors','publication','kind','summary','access','status','checked','related_terms'],[val(r[0]),val(r[2]),val(r[3]).rstrip('/').split('/')[-1],val(r[4]),val(r[5]),val(r[6]),val(r[7]),val(r[10]),val(r[13]),val(r[16]),val(r[24]),val(r[22]),val(r[19])]))
 item['tags']=terms(r[18]); records.append(item)
root=pathlib.Path('research/import-batches')
for i in range(0,len(records),750):
 payload=json.dumps(records[i:i+750],ensure_ascii=False,separators=(',',':')).replace("'","''")
 sql="insert into public.research_records (id,source,source_slug,title,url,authors,publication,kind,summary,access,status,checked,related_terms,tags) select id,source,source_slug,title,url,authors,publication,kind,summary,access,status,checked,related_terms,tags from jsonb_to_recordset('"+payload+"'::jsonb) as r(id text,source text,source_slug text,title text,url text,authors text,publication text,kind text,summary text,access text,status text,checked text,related_terms text,tags text[]) on conflict (id) do nothing;"
 (root/f'{i//750:03}.sql').write_text(sql)
pathlib.Path('research/publication-manifest.json').write_text(json.dumps({'workbook_version':35,'catalogued':len(records)+len(excluded),'published':len(records),'withheld':len(excluded),'withheld_ids':excluded,'catalogue_checked':'2026-10-23','note':'Public metadata and signposts. No independent study appraisals completed. Explicit candidate records and records without titles withheld.'},indent=2))
print(json.dumps({'publish':len(records),'withheld':len(excluded),'batches':(len(records)+749)//750,'bytes':sum(p.stat().st_size for p in root.glob('*.sql'))}))
