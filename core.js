export function clamp(v, low, high) { return Math.max(low, Math.min(high, v)); }
export function clip(box, width, height) {
  const x = clamp(box.x, 0, width), y = clamp(box.y, 0, height);
  return { ...box, x, y, w: Math.max(0, Math.min(width, box.x + box.w) - x), h: Math.max(0, Math.min(height, box.y + box.h) - y) };
}
export function coverage(box, margin, width, height) {
  const m = box.kind === 'auto' ? margin / 100 : 0;
  return clip({ ...box, x: Math.floor(box.x - box.w * m), y: Math.floor(box.y - box.h * m), w: Math.ceil(box.w * (1 + 2 * m)), h: Math.ceil(box.h * (1 + 2 * m)) }, width, height);
}
export function deduplicate(boxes) {
  const result = [];
  for (const b of [...boxes].sort((a,b) => b.score - a.score)) {
    if (result.some(a => {
      const intersection = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      return intersection / Math.min(a.w*a.h,b.w*b.h) > .55;
    })) continue;
    result.push(b);
  }
  return result;
}
export function paintMosaic(target, source, boxes, strength, margin, defaults = {}) {
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, target.width, target.height);
  const tiny = document.createElement('canvas');
  for (const b of boxes) {
    const settings={strength,margin,shape:'rect',effect:'mosaic',...defaults,...b.settings};
    const r = coverage(b, settings.margin, target.width, target.height);
    if (!r.w || !r.h) continue;
    const block = Math.max(2, Math.round(Math.min(b.w,b.h) * settings.strength / 100));
    ctx.save();ctx.beginPath();
    if(settings.shape==='ellipse')ctx.ellipse(r.x+r.w/2,r.y+r.h/2,r.w/2,r.h/2,0,0,Math.PI*2);
    else if(settings.shape==='circle'){const radius=Math.min(r.w,r.h)/2;ctx.arc(r.x+r.w/2,r.y+r.h/2,radius,0,Math.PI*2);}
    else ctx.rect(r.x,r.y,r.w,r.h);
    ctx.clip();
    if(settings.effect==='blur'){
      const blur=Math.max(2,Math.min(b.w,b.h)*settings.strength/150),pad=Math.ceil(blur*3);
      tiny.width=Math.ceil(r.w+pad*2);tiny.height=Math.ceil(r.h+pad*2);
      const t=tiny.getContext('2d');
      t.drawImage(target,r.x-pad,r.y-pad,tiny.width,tiny.height,0,0,tiny.width,tiny.height);
      ctx.filter=`blur(${blur}px)`;ctx.drawImage(tiny,r.x-pad,r.y-pad);ctx.restore();continue;
    }
    tiny.width = Math.max(1, Math.ceil(r.w / block)); tiny.height = Math.max(1, Math.ceil(r.h / block));
    const t = tiny.getContext('2d'); t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
    t.drawImage(target, r.x,r.y,r.w,r.h, 0,0,tiny.width,tiny.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny,0,0,tiny.width,tiny.height,r.x,r.y,r.w,r.h);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled = true;
}
export function exportSize(width,height,maxWidth,maxHeight){const scale=Math.min(1,maxWidth/width,maxHeight/height);return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
