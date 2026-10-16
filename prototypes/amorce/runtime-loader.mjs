// Immutable upstream revision, GPL-3.0. Labels are synthesized on the device;
// the CDN receives asset requests only, never the entered text.
const root='https://cdn.jsdelivr.net/gh/echogarden-project/espeak-ng-emscripten@7ab07eba2d966ce45040c88d9be953e1d68640e7/';
const browser=typeof window!=='undefined';
export default async function load(options){
 const local=browser?null:new URL(process.env.ESPEAK_RUNTIME?('file:///'+process.env.ESPEAK_RUNTIME.replaceAll('\\','/')):'../../.qa-cache/espeak/espeak-ng.js',import.meta.url);
 const {default:initialize}=await import(browser?root+'espeak-ng.js':local.href);
 return initialize(browser?{...options,locateFile:path=>root+path}:{...options,locateFile:path=>new URL(path,local).pathname.replace(/^\/(\w:)/,'$1')});
}
