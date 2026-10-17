/* Content-based cache keys for local assets referenced by the entry page. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html');
const original=fs.readFileSync(entry,'utf8'),changed=[];
const updated=original.replace(/\b(src|href)="([^"?#]+\.(?:js|mjs|css|svg|png|woff2|webmanifest))\?v=([^"&#]+)"/g,(whole,attribute,url,version)=>{
 if(/^(?:[a-z]+:|\/\/)/i.test(url))return whole;
 const file=path.resolve(root,decodeURIComponent(url));
 if(!file.startsWith(root+path.sep))throw Error('Asset outside repository: '+url);
 const bytes=fs.readFileSync(file),canonical=/\.(?:js|mjs|css|svg|webmanifest)$/.test(file)?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes;
 const hash=crypto.createHash('sha256').update(canonical).digest('hex').slice(0,12);
 if(hash!==version)changed.push(url);
 return attribute+'="'+url+'?v='+hash+'"';
});
if(process.argv.includes('--check')){
 if(changed.length){console.error('Outdated asset versions; run pnpm build:',[...new Set(changed)].join(', '));process.exitCode=1;}
 else console.log('Asset versions match their content.');
}else{
 if(updated!==original)fs.writeFileSync(entry,updated);
 console.log('Asset versions updated:',new Set(changed).size);
}

// The offline snapshot excludes user data, voice downloads and the worker's generated revision.
const textFile=name=>/\.(?:js|mjs|css|svg|json|webmanifest|html)$/.test(name);
const normalize=(bytes,name)=>textFile(name)?bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'):bytes;
const walk=directory=>fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(directory+'/'+entry.name):[directory+'/'+entry.name]);
const names=[...fs.readdirSync(root).filter(name=>/\.(?:js|mjs|css)$/.test(name)&&!['service-worker.js','songs.js','eslint.config.mjs'].includes(name)),
 'index.html','manifest.webmanifest',...walk('vendor').filter(name=>/\.js$/.test(name)),...walk('assets/icons').filter(name=>/\.(?:png|svg)$/.test(name)),
 ...walk('assets/metronome').filter(name=>name.endsWith('.wav')&&!path.basename(name).startsWith('beep-'))].sort();
const resources=names.map(name=>{const bytes=name==='index.html'?Buffer.from(updated):fs.readFileSync(path.join(root,name));return{path:name,sha256:crypto.createHash('sha256').update(normalize(bytes,name)).digest('hex'),text:textFile(name)};});
const workerPath=path.join(root,'service-worker.js'),worker=fs.readFileSync(workerPath,'utf8').replace(/^\uFEFF/,'');
const workerTemplate=worker.replace(/const MANIFEST_REVISION='[^']+';/,"const MANIFEST_REVISION='generated';").replace(/\r\n/g,'\n');
const revision=crypto.createHash('sha256').update(JSON.stringify(resources)+workerTemplate).digest('hex').slice(0,16);
const manifestText=JSON.stringify({version:1,revision,resources},null,2)+'\n';
const workerText=workerTemplate.replace("const MANIFEST_REVISION='generated';","const MANIFEST_REVISION='"+revision+"';");
for(const [name,content]of [['offline-manifest.json',manifestText],['service-worker.js',workerText]]){
 const file=path.join(root,name),existing=fs.existsSync(file)?fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'):null;
 if(existing===content)continue;
 if(process.argv.includes('--check')){console.error('Outdated offline snapshot:',name);process.exitCode=1;}else fs.writeFileSync(file,content);
}
