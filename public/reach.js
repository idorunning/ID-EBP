// Homepage coverage counters. Each figure counts up in turn when the panel
// scrolls into view, with a bar that fills beneath it. Screen readers get the
// final values from the hidden labels; reduced-motion users see final values.
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt=n=>Math.round(n).toLocaleString(document.documentElement.lang||'en-GB');
const display=el=>el.dataset.count===''?'—':fmt(Number(el.dataset.count));
const ease=x=>x>=1?1:1-Math.pow(2,-10*x); // ease-out-expo: fast start, gentle landing
let played=false;

function play(panel){
 const counters=[...panel.querySelectorAll('[data-count]')];
 if(reduced()){for(const el of counters)el.textContent=display(el);panel.classList.add('is-visible');return;}
 for(const el of counters)el.textContent=el.dataset.count===''?'—':'0';
 panel.classList.add('is-visible','stats-animating');
 const start=performance.now(),duration=1800,stagger=220;
 const frame=now=>{
  let running=false;
  counters.forEach((el,index)=>{
   const progress=Math.max(0,Math.min(1,(now-start-index*stagger)/duration));
   el.textContent=el.dataset.count===''?'—':fmt(Number(el.dataset.count)*ease(progress));
   if(progress<1)running=true;
  });
  if(running&&panel.isConnected)requestAnimationFrame(frame);
  else{for(const el of counters)el.textContent=display(el);panel.classList.remove('stats-animating');}
 };
 requestAnimationFrame(frame);
}

export function bindReach(){
 const panel=document.querySelector('[data-stats]');if(!panel)return;
 if(played||reduced()||!('IntersectionObserver' in window)){panel.classList.add('is-visible');return;}
 const observer=new IntersectionObserver(entries=>{
  if(entries.some(e=>e.isIntersecting)){played=true;play(panel);observer.disconnect();}
 },{threshold:.35});
 observer.observe(panel);
}
