// Decorative count-up uses real totals; assistive technology receives final values.
let celebrated=false;
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function play(container){
 const counters=[...container.querySelectorAll('[data-count]')];
 if(reduced()){for(const el of counters)el.textContent=el.dataset.count;return;}
 const start=performance.now(),duration=1600;
 const frame=now=>{
  const progress=Math.max(0,Math.min(1,(now-start)/duration)),eased=1-Math.pow(1-progress,3);
  for(const el of counters)el.textContent=Math.round(Number(el.dataset.count)*eased).toLocaleString(document.documentElement.lang);
  if(progress<1&&container.isConnected)requestAnimationFrame(frame);
 };
 requestAnimationFrame(frame);
 container.classList.remove('celebrating');
 requestAnimationFrame(()=>container.classList.add('celebrating'));
}
export function bindReach(){
 const container=document.querySelector('.reach-feature');if(!container)return;
 document.querySelector('#replay-reach')?.addEventListener('click',()=>play(container));
 if(celebrated||reduced())return;
 if(!('IntersectionObserver' in window)){celebrated=true;play(container);return;}
 const observer=new IntersectionObserver(entries=>{
  if(entries.some(e=>e.isIntersecting)){celebrated=true;play(container);observer.disconnect();}
 },{threshold:.25});observer.observe(container);
}
