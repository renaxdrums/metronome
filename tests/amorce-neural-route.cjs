const fs=require('node:fs'),path=require('node:path');
exports.install=async (context,testURL)=>{
 const root=process.env.NEURAL_TEST_ROOT;
 if(!root)throw new Error('Set NEURAL_TEST_ROOT to the development runtime/assets directory.');
 // Serve large models through the app origin, avoiding cross-origin redirects and CDP buffer copies.
 const assetURL=testURL+'/.qa-cache/neural-assets';
 exports.assetURL=assetURL;
 await context.route('https://cdn.jsdelivr.net/**',route=>{
  const url=new URL(route.request().url());let file;
  if(url.pathname.includes('/@huggingface/transformers@'))file=path.join(__dirname,'../node_modules/@huggingface/transformers/dist',url.pathname.split('/').at(-1));
  else if(url.pathname.includes('/onnxruntime-web@'))file=path.join(__dirname,'../node_modules/onnxruntime-web/dist',url.pathname.split('/').at(-1));
  else file=path.join(root,'espeak',url.pathname.split('/').at(-1));
  return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:file.endsWith('.wasm')?'application/wasm':/\.(mjs|js)$/.test(file)?'text/javascript':'application/octet-stream',body:fs.readFileSync(file)});
 });
 await context.route('https://huggingface.co/**',route=>{
  const url=new URL(route.request().url()),relative=url.pathname.split('/resolve/')[1]?.split('/').slice(1).join('/');
  if(!relative)return route.abort();
  if(url.pathname.includes('/rhasspy/piper-voices/'))return route.fulfill({headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(process.env.PIPER_ASSETS,'fr_FR-siwis-medium.onnx'))});
  return route.fulfill({status:307,headers:{location:assetURL+'/'+relative,'access-control-allow-origin':'*'},body:''});
 });
 return ()=>{};
};
