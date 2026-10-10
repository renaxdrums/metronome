// Derive timing events from the exact IPA stream sent to Piper.
// Do not align two separate eSpeak outputs: loanwords and punctuation can differ.
export function piperEvents(text){
 const chars=Array.from(text.normalize('NFD')),source=[],offsets=[];
 let word=0,boundary=false;
 for(let i=0;i<chars.length;i++){
  const phone=chars[i];
  if(/\s|[,.!?;:]/u.test(phone)){boundary=true;continue;}
  if(/[ˈˌ]/u.test(phone))continue;
  if(boundary){word++;boundary=false;}
  if(/[\p{M}ːˑ]/u.test(phone)){if(source.length)source.at(-1).id+=phone;continue;}
  source.push({type:'phoneme',id:phone,text_position:word});offsets.push(i);
 }
 if(!source.length)throw new Error('NO_PHONEME_EVENTS');
 return {text:chars.join(''),source,offsets};
}
