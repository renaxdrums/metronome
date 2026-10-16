const fs=require('node:fs'),path=require('node:path');
// Test mirror of the immutable CDN assets; CDN reachability/hash is checked
// separately. This route is only for the development test environment.
exports.install=page=>page.route('https://cdn.jsdelivr.net/**',route=>{
 const file=new URL(route.request().url()).pathname.split('/').at(-1);
 return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:file.endsWith('.js')?'text/javascript':'application/octet-stream',body:fs.readFileSync(path.join(__dirname,'../.qa-cache/espeak',file))});
});
