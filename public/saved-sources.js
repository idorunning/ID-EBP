// Guest saves stay separate from the signed-in collection. Only pending changes
// are kept on this device, scoped to the account that made them.
function defaultStorage(){try{return globalThis.localStorage;}catch{return null;}}
const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export class SavedSources {
  constructor({request,storage=defaultStorage(),onChange=()=>{}}){
    this.request=request;this.storage=storage;this.onChange=onChange;
    this.userId=null;this.generation=0;this.pending=new Map();this.ids=new Set(this.readGuest());this.status='device';this.running=null;this.pendingDurable=true;this.imported=new Set();
  }
  read(key,fallback){try{return JSON.parse(this.storage?.getItem(key))??fallback;}catch{return fallback;}}
  write(key,value){try{this.storage?.setItem(key,JSON.stringify(value));return Boolean(this.storage);}catch{return false;}}
  readGuest(){const list=this.read('pd-saved',[]);return Array.isArray(list)?list.filter(validSlug):[];}
  pendingKey(){return 'idebp-saved-pending:'+this.userId;}
  notify(){this.onChange(this);}
  setUser(user){
    const id=user?.id||null;
    if(id===this.userId)return this.sync();
    this.userId=id;this.generation++;this.running=null;this.pending=new Map();this.imported=new Set();this.pendingDurable=true;
    if(!id){this.ids=new Set(this.readGuest());this.status='device';this.notify();return Promise.resolve();}
    const entries=this.read(this.pendingKey(),[]);
    if(Array.isArray(entries))for(const entry of entries)if(Array.isArray(entry)&&validSlug(entry[0])&&typeof entry[1]==='boolean')this.pending.set(...entry);
    this.ids=new Set(this.readGuest());this.overlay();this.status='syncing';this.notify();return this.sync();
  }
  overlay(){for(const [slug,saved] of this.pending)saved?this.ids.add(slug):this.ids.delete(slug);}
  toggle(slug){
    if(!validSlug(slug))return Promise.resolve();
    const saved=!this.ids.has(slug);saved?this.ids.add(slug):this.ids.delete(slug);
    if(!this.userId){this.status=this.write('pd-saved',[...this.ids])?'device':'storage-error';this.notify();return Promise.resolve();}
    this.pending.set(slug,saved);this.pendingDurable=this.write(this.pendingKey(),[...this.pending]);this.status='syncing';this.notify();return this.sync();
  }
  sync(){
    if(!this.userId)return Promise.resolve();
    if(this.running)return this.running;
    const generation=this.generation,accountId=this.userId,live=()=>generation===this.generation;
    const request=(path,options={})=>this.request(path,{...options,accountId});
    const job=(async()=>{
      try{
        const guest=this.readGuest().filter(slug=>!this.imported.has(slug));
        if(guest.length){
          // Import is additive and idempotent; never replace another device's list.
          for(let n=0;n<guest.length;n+=200){if(!live())return;await request('/saved/import',{method:'POST',body:{slugs:guest.slice(n,n+200)}});}
          if(!live())return;
          guest.forEach(slug=>this.imported.add(slug));
          this.write('pd-saved',this.readGuest().filter(slug=>!guest.includes(slug)));
        }
        do{
          while(this.pending.size){
            const [slug,saved]=this.pending.entries().next().value;
            await request('/saved/'+slug,{method:saved?'PUT':'DELETE',body:{}});
            if(!live())return;
            if(this.pending.get(slug)===saved)this.pending.delete(slug);
            this.pendingDurable=this.write(this.pendingKey(),[...this.pending]);
          }
          const result=await request('/saved');if(!live())return;
          this.ids=new Set((result.saved||[]).filter(validSlug));this.overlay();
          // A click during the read is queued before declaring synchronisation.
        }while(this.pending.size);
        this.status='synced';
      }catch(error){if(live())this.status=[401,403,409].includes(error.status)?'sign-in-required':this.pending.size&&!this.pendingDurable?'memory-only':'pending';}
      finally{if(live()){this.running=null;this.notify();}}
    })();
    this.running=job;return job;
  }
  clearDevice(){
    try{this.storage?.removeItem('pd-saved');if(this.userId)this.storage?.removeItem(this.pendingKey());}catch{}
    this.pending.clear();if(!this.userId){this.ids.clear();this.status='device';this.notify();}else return this.sync();
  }
}
