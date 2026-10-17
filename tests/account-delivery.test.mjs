import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.mjs';
test('verification codes are delivered by the trusted Worker and never returned to browser JavaScript',async()=>{
 const previous=globalThis.fetch;const sent=[];
 globalThis.fetch=async()=>Response.json({sent:true,internalDelivery:{email:'member@example.test',code:'123456',purpose:'reset'}},{headers:{'Set-Cookie':'__Host-idebp_login=opaque; Secure; HttpOnly; Path=/'}});
 try{
  const env={DIRECTORY_API_URL:'https://fixture.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'fixture-proxy-secret',AUTH_EMAIL_ENABLED:'true',EMAIL:{send:async mail=>sent.push(mail)}};
  let r=await worker.fetch(new Request('https://www.id-ebp.org/api/auth/request',{method:'POST',headers:{Origin:'https://www.id-ebp.org','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{sent:true});assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.equal(sent.length,1);assert.equal(sent[0].to,'member@example.test');assert.match(sent[0].text,/123456/);assert.match(sent[0].subject,/password-reset/);
  r=await worker.fetch(new Request('https://www.id-ebp.org/api/auth/request',{method:'POST'}),{...env,EMAIL:{send:async()=>{throw Error('Delivery failed');}}});assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/123456|internalDelivery/);
 }finally{globalThis.fetch=previous;}
});
