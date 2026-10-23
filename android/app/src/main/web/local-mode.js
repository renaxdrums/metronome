(() => {
  const style = document.createElement('style');
  style.textContent = '#backupAccount .backup-auth,#backupAccount .backup-choices>label,#backupAccount .backup-choices>button:not([aria-controls="backup-local"]){display:none!important}';
  document.head.append(style);
  function adapt() {
    const root = document.getElementById('backupAccount');
    if (!root) return;
    const hint = root.querySelector('.backup-hint');
    const localHint = 'Les morceaux sont conservés sur cet appareil. Les comptes en ligne sont disponibles sur le site.';
    if (hint && hint.textContent !== localHint) hint.textContent = localHint;
    for (const p of root.querySelectorAll('p')) {
      if (p.textContent.includes('Firebase')) p.textContent = 'Synchronisation en ligne : ouvrir le site officiel.';
    }
    if (!root.querySelector('#renaxOpenOnlineAccount')) {
      const link = document.createElement('a');
      link.id = 'renaxOpenOnlineAccount';
      link.className = 'btn';
      link.textContent = 'Compte en ligne sur le site';
      link.href = 'https://appassets.androidplatform.net/open-website';
      root.append(link);
    }
  }
  new MutationObserver(adapt).observe(document.body, {childList: true, subtree: true});
  adapt();
})();
