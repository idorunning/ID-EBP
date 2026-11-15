let loading,active;
const failure=()=>Object.assign(new Error('Verification could not be completed. Please try again.'),{code:'human_check_failed',status:400});
function loadChallenge(){
 if(globalThis.turnstile)return Promise.resolve(globalThis.turnstile);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  const timer=setTimeout(()=>{script.remove();loading=null;reject(failure());},15000);
  script.onload=()=>{clearTimeout(timer);if(globalThis.turnstile)resolve(globalThis.turnstile);else{loading=null;reject(failure());}};
  script.onerror=()=>{clearTimeout(timer);script.remove();loading=null;reject(failure());};document.head.append(script);
 });return loading;
}
export async function verifyHuman(sitekey){
 if(active)throw failure();active=true;let dialog,widget,service,timer;
 try{
  service=await loadChallenge();dialog=document.createElement('dialog');dialog.className='member-human-check';dialog.setAttribute('aria-labelledby','human-check-heading');
  dialog.innerHTML='<h2 id="human-check-heading">Quick verification</h2><p>This check helps keep email sign-in available for everyone.</p><div data-human-widget></div><button type="button" class="button button-outline">Cancel</button>';
  document.body.append(dialog);dialog.showModal();
  return await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(failure()),180000);
   const finish=token=>{clearTimeout(timer);token?resolve(token):reject(failure());};
   dialog.addEventListener('cancel',()=>finish(null),{once:true});dialog.querySelector('button').addEventListener('click',()=>finish(null),{once:true});
   widget=service.render(dialog.querySelector('[data-human-widget]'),{sitekey,action:'auth_email',size:'flexible',callback:finish,'error-callback':()=>finish(null),'expired-callback':()=>finish(null),'timeout-callback':()=>finish(null)});
  });
 }finally{clearTimeout(timer);if(widget!==undefined)service?.remove(widget);dialog?.close();dialog?.remove();active=false;}
}
