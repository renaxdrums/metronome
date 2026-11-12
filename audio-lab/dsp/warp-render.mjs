/** Offline Warp pipeline with optional user-reviewed transient restoration. */
import {renderWarpPCM} from './wsola.mjs';
import {protectWarpTransients} from './transients.mjs';

export function renderWarpWithTransients(config){
  const output=renderWarpPCM(config);
  if(output.method==='identity-copy'||!config.onsets?.length)return output;
  const stats=protectWarpTransients({
    source:config.channels,rendered:output.channels,sampleRate:config.sampleRate,
    timeline:config.timeline,onsets:config.onsets,signal:config.signal,
  });
  return {...output,diagnostics:[...output.diagnostics,
    'User-reviewed transient positions restored at original rate with short crossfades'],
    metrics:{...output.metrics,transients:stats}};
}
