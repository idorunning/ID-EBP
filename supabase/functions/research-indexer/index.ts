import {handleResearchIndexer} from '../../../backend/research-indexer.mjs';
Deno.serve(request=>handleResearchIndexer(request,{
 SUPABASE_URL:Deno.env.get('SUPABASE_URL')||'',
 SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}));
