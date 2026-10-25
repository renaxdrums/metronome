/* Installed only inside the Android app's trusted local HTTPS document. */
(function installRenaxNativeBridge(nonce, chunkSize, accountUrl) {
  'use strict';
  let bridge = window.__renaxNativeSave;
  if (bridge) {
    for (const pending of bridge.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge refreshed'));
    }
    bridge.pending.clear();
    if (bridge.port) bridge.port.close();
    bridge.port = null;
    bridge.nonce = nonce;
    bridge.lastScreen = undefined;
    return;
  }
  bridge = window.__renaxNativeSave = {
    nonce, port: null, pending: new Map(), busy: false, lastScreen: undefined
  };
  window.addEventListener('message', function (event) {
    if (event.data !== 'renax-native:' + bridge.nonce || !event.ports.length) return;
    bridge.port = event.ports[0];
    bridge.port.onmessage = function (message) {
      let reply;
      try { reply = JSON.parse(message.data); } catch (_) { return; }
      const key = reply.id + ':' + reply.seq;
      const pending = bridge.pending.get(key);
      if (!pending) return;
      bridge.pending.delete(key);
      clearTimeout(pending.timer);
      if (reply.ok) pending.resolve(reply);
      else pending.reject(new Error('Native export failed'));
    };
    bridge.lastScreen = undefined;
    reportScreen();
  });
  function send(message, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const key = message.id + ':' + message.seq;
      const pending = { resolve, reject, timer: null };
      if (timeout) pending.timer = setTimeout(() => {
        bridge.pending.delete(key);
        reject(new Error('Native export timeout'));
      }, timeout);
      bridge.pending.set(key, pending);
      try { bridge.port.postMessage(JSON.stringify(message)); }
      catch (error) {
        clearTimeout(pending.timer);
        bridge.pending.delete(key);
        reject(error);
      }
    });
  }
  function encode(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  function save(anchor) {
    if (!anchor.download || !anchor.href.startsWith('blob:')) return false;
    if (!bridge.port || bridge.busy) {
      alert('Export indisponible, réessaie.');
      return true;
    }
    bridge.busy = true;
    const id = crypto.randomUUID();
    const href = anchor.href, name = anchor.download;
    (async () => {
      try {
        const response = await fetch(href);
        const blob = await response.blob();
        let seq = 0;
        await send({ kind: 'begin', id, seq, name, mime: blob.type || 'application/json', size: blob.size });
        for (let offset = 0; offset < blob.size; offset += chunkSize) {
          const data = await encode(blob.slice(offset, offset + chunkSize));
          await send({ kind: 'chunk', id, seq: ++seq, data });
        }
        // The document picker belongs to the user: no timeout while choosing a destination.
        await send({ kind: 'finish', id, seq: ++seq }, 0);
      } catch (_) {
        if (bridge.port) bridge.port.postMessage(JSON.stringify({ kind: 'abort', id }));
        alert('Export impossible. Vérifie l’espace disponible et réessaie.');
      } finally {
        bridge.busy = false;
      }
    })();
    return true;
  }
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!save(this)) return originalClick.call(this);
  };
  document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#directAccountBtn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href = accountUrl;
      return;
    }
    const anchor = target.closest('a[download]');
    if (anchor && save(anchor)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  function reportScreen() {
    if (!bridge.port) return;
    const keep = (typeof isPlaying !== 'undefined' && !!isPlaying) || !!document.fullscreenElement;
    if (keep !== bridge.lastScreen) {
      bridge.port.postMessage(JSON.stringify({ kind: 'screen', keep }));
      bridge.lastScreen = keep;
    }
  }
  bridge.screenTimer = setInterval(reportScreen, 250);
  document.addEventListener('fullscreenchange', reportScreen);
})
