// Additional coverage for the current UI; historical tests remain independent.
const {run}=require('./ui-scenarios.cjs');
(async()=>{for(const name of ['account-back-regression','song-back-regression','song-navigation','songs','songs-playback','playlist-card-click','playlist-drag','song-folded-blocks','song-block-area-toggle','song-card-style','song-numbox','song-block-preview','rename-menu','transport-timer','customization-timer','export-presentation','mobile-landscape','training-modes'])await run(name);})().catch(error=>{console.error(error);process.exitCode=1});
