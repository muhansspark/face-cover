const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.MOSAIC_PORT||4174);
const url=`http://127.0.0.1:${port}`;
function openApp(){
  console.log(`한번에 얼굴 가리기: ${url}`);
  if(!process.argv.includes('--open')||process.argv.includes('--no-browser'))return;
  require('node:child_process').execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},error=>{if(error)console.log(`브라우저 주소창에 ${url} 을 입력해주세요.`);});
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.tflite':'application/octet-stream'};
const allowed=new Set(['index.html','app.js','studio.js','studio.css','core.js','style.css','detector.js','sw.js','icon.svg']);
http.createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';}catch{res.writeHead(400);res.end();return;}
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||(!allowed.has(name)&&!name.startsWith('vendor/'))){res.writeHead(404);res.end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);});
}).listen(port,'127.0.0.1',()=>{openApp();console.log('사용하는 동안 이 창을 열어두세요. 종료하려면 창을 닫으세요.');}).on('error',async e=>{
  if(e.code==='EADDRINUSE'){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(3000)});
      const html=await response.text();
      if(response.ok&&html.includes('<title>한번에 얼굴 가리기</title>')){
        console.log('이미 실행 중인 한번에 얼굴 가리기를 엽니다. 이 실행 창은 닫아도 됩니다.');openApp();return;
      }
    }catch{}
    console.error(`${port}번 포트를 다른 프로그램이 사용 중입니다. 실행 중인 프로그램을 확인해주세요.`);
  }else console.error(e.message);
  process.exitCode=1;
});
