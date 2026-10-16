import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('.qa-cache/java');await fs.mkdir(root,{recursive:true});
const response=await fetch('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse');if(!response.ok)throw Error('Java metadata unavailable');const [asset]=await response.json();
const file=path.join(root,asset.binary.package.name);try{await fs.stat(file);}catch{const download=await fetch(asset.binary.package.link);if(!download.ok)throw Error('Java download failed');await fs.writeFile(file,new Uint8Array(await download.arrayBuffer()));}console.log(file);
