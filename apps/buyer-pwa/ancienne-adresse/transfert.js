// ADRESSE-PROPRE — the old project address forwards every link to the buyer
// site's own address: the same path, query and hash. First it removes what
// Shop+ kept on this shared origin (its own names only: other pages live
// here too). Nothing is carried over: a secret never rides a URL.
(function () {
  var CLES = __CLES__;
  var PREFIXES = __PREFIXES__;
  var PROJET = '/shop-plus';
  function aShop(nom) {
    if (CLES.indexOf(nom) !== -1) return true;
    for (var i = 0; i < PREFIXES.length; i++) if (nom.indexOf(PREFIXES[i]) === 0) return true;
    return false;
  }
  function oublier(nomStockage) {
    try {
      var stockage = window[nomStockage];
      var noms = [];
      for (var i = 0; i < stockage.length; i++) noms.push(stockage.key(i));
      for (var j = 0; j < noms.length; j++) if (aShop(noms[j])) stockage.removeItem(noms[j]);
    } catch (e) {
      // storage refused (private mode, locked webview): nothing of ours to remove
    }
  }
  oublier('localStorage');
  oublier('sessionStorage');
  var l = window.location;
  var chemin = l.pathname.indexOf(PROJET + '/') === 0 ? l.pathname.slice(PROJET.length) : '/';
  // The address lives in the page's link, so this script never names it.
  var nouvelle = document.getElementById('suite').getAttribute('href').replace(/\/$/, '');
  l.replace(nouvelle + chemin + l.search + l.hash);
})();
