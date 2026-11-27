// ADRESSE-PROPRE — published at the old address in place of the buyer site's
// worker, at the same script address (/shop-plus/sw.js), so a phone that
// installed the old site picks it up on its next visit. It keeps nothing: it
// deletes the old shell's caches (its own names only), removes itself, and
// reloads any open old page so the forwarder takes it to the new address.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      var noms = await caches.keys();
      await Promise.all(
        noms
          .filter(function (nom) {
            return nom.indexOf('coquille-shop-plus-') === 0;
          })
          .map(function (nom) {
            return caches.delete(nom);
          }),
      );
      await self.registration.unregister();
      var fenetres = await self.clients.matchAll({ type: 'window' });
      for (var i = 0; i < fenetres.length; i++) {
        try {
          await fenetres[i].navigate(fenetres[i].url);
        } catch (e) {
          // a page this worker no longer controls reloads on its own next visit
        }
      }
    })(),
  );
});
