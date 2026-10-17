// Native scrolling remains available without these optional navigation controls.
export function bindSourceCarousels(root=document) {
  const abort=new AbortController();
  const observers=[];
  for(const section of root.querySelectorAll('[data-source-carousel]')) {
    const track=section.querySelector('.source-track');
    const previous=section.querySelector('[data-scroll="previous"]');
    const next=section.querySelector('[data-scroll="next"]');
    if(!track||!previous||!next) continue;
    const update=()=>{
      const end=track.scrollWidth-track.clientWidth;
      previous.disabled=track.scrollLeft<=2;
      next.disabled=track.scrollLeft>=end-2;
      section.classList.toggle('has-overflow',end>2);
    };
    const move=direction=>{
      const card=track.querySelector('.source-row');
      const gap=parseFloat(getComputedStyle(track).columnGap)||16;
      const step=(card?.getBoundingClientRect().width||280)+gap;
      track.scrollBy({left:direction*Math.max(1,Math.floor(track.clientWidth/step))*step,
        behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    };
    previous.addEventListener('click',()=>move(-1),{signal:abort.signal});
    next.addEventListener('click',()=>move(1),{signal:abort.signal});
    track.addEventListener('scroll',update,{passive:true,signal:abort.signal});
    track.addEventListener('keydown',event=>{
      if(event.target!==track) return;
      if(event.key==='ArrowRight'||event.key==='ArrowLeft') {event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
      if(event.key==='Home'||event.key==='End') {event.preventDefault();track.scrollTo({left:event.key==='Home'?0:track.scrollWidth,behavior:'instant'});}
    },{signal:abort.signal});
    if(typeof ResizeObserver!=='undefined') {const observer=new ResizeObserver(update);observer.observe(track);observers.push(observer);}
    update();
  }
  return ()=>{abort.abort();observers.forEach(observer=>observer.disconnect());};
}
