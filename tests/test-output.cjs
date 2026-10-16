// Keep generated artifacts separate from source and historical fixtures.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
if(process.env.TEST_OUTPUT_DIR){
 const root=path.resolve(process.env.TEST_OUTPUT_DIR),repo=path.resolve(__dirname,'..');
 const target=file=>{
  if(typeof file!=='string'&&!(file instanceof URL))return file;
  const absolute=file instanceof URL?require('node:url').fileURLToPath(file):path.resolve(file);
  if(absolute.startsWith(root+path.sep)||absolute===root||absolute.startsWith(os.tmpdir()+path.sep))return absolute;
  const relative=absolute.startsWith(repo+path.sep)?path.relative(repo,absolute):path.basename(absolute);
  return path.join(root,'legacy-artifacts',relative);
 };
 const write=fs.writeFileSync.bind(fs);fs.writeFileSync=(file,...args)=>{const dest=target(file);if(typeof dest==='string')fs.mkdirSync(path.dirname(dest),{recursive:true});return write(dest,...args);};
 const asyncWrite=fs.promises.writeFile.bind(fs.promises);fs.promises.writeFile=async(file,...args)=>{const dest=target(file);if(typeof dest==='string')await fs.promises.mkdir(path.dirname(dest),{recursive:true});return asyncWrite(dest,...args);};
 require('node:module').syncBuiltinESMExports();
}
