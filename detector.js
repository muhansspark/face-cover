const modules = Promise.all([import('./vendor/vision_bundle.mjs'), import('./core.js')]);
let detector;
self.onmessage = async ({data}) => {
  const { bitmap, id } = data;
  try {
    const [{ FaceDetector, FilesetResolver }, { clip, deduplicate }] = await modules;
    if (!detector) {
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href);
      detector = await FaceDetector.createFromOptions(files, {baseOptions:{modelAssetPath:new URL('./vendor/face_detector.tflite',self.location.href).href,delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:.45,minSuppressionThreshold:.3});
    }
    const width=bitmap.width, height=bitmap.height;
    const tiles=[{x:0,y:0,w:width,h:height}];
    if (Math.max(width,height)>900) {
      const n=Math.max(width,height)>2000?5:3, fraction=n===5?.26:.42;
      const w=Math.round(width*fraction), h=Math.round(height*fraction);
      for(let row=0;row<n;row++) for(let col=0;col<n;col++) tiles.push({x:Math.round((width-w)*col/(n-1)),y:Math.round((height-h)*row/(n-1)),w,h});
    }
    const canvas=new OffscreenCanvas(1,1), ctx=canvas.getContext('2d');
    const boxes=[];
    for (const tile of tiles) {
      const scale=Math.min(1,1024/Math.max(tile.w,tile.h));
      canvas.width=Math.max(1,Math.round(tile.w*scale)); canvas.height=Math.max(1,Math.round(tile.h*scale));
      ctx.drawImage(bitmap,tile.x,tile.y,tile.w,tile.h,0,0,canvas.width,canvas.height);
      const found = detector.detect(canvas).detections;
      for (const detection of found) {
        const b=detection.boundingBox;
        const box=clip({x:tile.x+b.originX*tile.w/canvas.width,y:tile.y+b.originY*tile.h/canvas.height,w:b.width*tile.w/canvas.width,h:b.height*tile.h/canvas.height,score:detection.categories[0].score,kind:'auto'},width,height);
        if(box.w>3 && box.h>3) boxes.push(box);
      }
    }
    self.postMessage({id,boxes:deduplicate(boxes)});
  } catch(error) { self.postMessage({id,error:String(error.message||error)}); }
  finally { bitmap.close(); }
};
