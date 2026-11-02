/* Pure sharing contract. No audio, account or UI dependencies. */
export const SHARE_ID_PATTERN = /^[0-9a-f]{32}$/;
export const sharedProfileId = shareId => {
  if (!SHARE_ID_PATTERN.test(shareId)) throw Error('Identifiant de partage invalide.');
  return 'shared_' + shareId;
};
export const shareIdInLink = hash => {
  const match = /^#renax-share=([0-9a-f]{32})$/.exec(hash || '');
  return match ? match[1] : null;
};
export const publicShareLink = (base, shareId) => {
  sharedProfileId(shareId);
  const url = new URL(base);
  url.search = '';
  url.hash = 'renax-share=' + shareId;
  return url.href;
};
export function parseSharedProfile(document, validateLibrary) {
  if (!document || document.schema !== 1 || !Number.isSafeInteger(document.revision) ||
      document.revision < 1 || typeof document.payload !== 'string' ||
      document.payload.length > 800000 || document.revoked !== false)
    throw Error('Partage invalide ou indisponible.');
  const profile = JSON.parse(document.payload);
  validateLibrary({ version: 1, activeProfile: profile?.id, profiles: [profile] });
  return profile;
}
export function addOrUpdateSharedPlaylist(current, document, shareId, validateLibrary) {
  const received = parseSharedProfile(document, validateLibrary);
  const targetId = sharedProfileId(shareId);
  const target = JSON.parse(JSON.stringify(received));
  target.id = targetId;
  if (current.profiles.length >= 128 && !current.profiles.some(p => p.id === targetId))
    throw Error('Bibliothèque pleine : maximum 128 playlists.');
  const next = JSON.parse(JSON.stringify(current));
  const index = next.profiles.findIndex(p => p.id === targetId);
  if (index < 0) next.profiles.push(target);
  else next.profiles[index] = target;
  validateLibrary(next);
  return {
    library: next,
    changed: index < 0 || JSON.stringify(current.profiles[index]) !== JSON.stringify(target),
    added: index < 0,
  };
}
export function exportSharePayload(profile, validateLibrary) {
  const copy = JSON.parse(JSON.stringify(profile));
  validateLibrary({ version: 1, activeProfile: copy.id, profiles: [copy] });
  const payload = JSON.stringify(copy);
  if (payload.length > 800000) throw Error('Playlist trop volumineuse pour le partage.');
  return payload;
}
