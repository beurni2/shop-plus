/**
 * GEO-CARTE-PRO — THE MAP SHE MOVES UNDER A FIXED PIN (founder, 2026-08-31,
 * with the reference screen: « Make the webview look like this and same on
 * the wishlist as well »). The old face showed one static embed and asked
 * yes/no; this one holds the pin still at the CENTRE of the view and lets
 * her drag the town underneath until the point is her door — the exact
 * interaction the reference names in its own pill.
 *
 * WHY NO LIBRARY: a slippy map at ONE fixed zoom is Web-Mercator arithmetic
 * plus a grid of <img> tiles — deterministic, dependency-free, and small
 * enough to hold to the franc-level standard the money paths live by. The
 * tiles are OpenStreetMap's own (their attribution rides the view, always);
 * her device fetches the area it is looking at, exactly as the retired
 * embed already did. A view that cannot load its tiles is a calm sand
 * surface with the pin, the coordinates, and the confirm all still standing
 * — her position is the FIX, never the tiles (offline honesty).
 *
 * WHAT THIS MODULE NEVER DOES: it keeps no coordinate. The dragged centre
 * goes to the caller through `surCentre` and nowhere else — each surface's
 * own CANDIDATE stays the single road to a kept pin, and only the surface's
 * confirm action promotes it (the GEO-ACHAT-2 consent law, untouched).
 * One static capture seeds the view (SE-I08): no watchPosition, no
 * following, no route — the drag is her hand, not a sensor.
 */

const TUILE = 256;

/** One fixed zoom: ~1.2 m/px in Ouagadougou — street names readable, a
 *  courtyard distinguishable from its neighbour, and no zoom chrome to
 *  crowd the one instruction the pill carries. */
export const GEO_ZOOM = 17;

/** Web-Mercator forward: degrees → world pixels at `zoom`. */
export function geoVersMonde(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = TUILE * Math.pow(2, zoom);
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/** Web-Mercator inverse: world pixels at `zoom` → degrees. */
export function mondeVersGeo(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = TUILE * Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
}

/** Tile URL — x wraps around the antimeridian, y outside the globe is null
 *  (those rows simply do not exist; the view shows its own calm ground). */
export function urlTuile(zoom: number, xt: number, yt: number): string | null {
  const cote = Math.pow(2, zoom);
  if (yt < 0 || yt >= cote) return null;
  const x = ((xt % cote) + cote) % cote;
  return `https://tile.openstreetmap.org/${zoom}/${x}/${yt}.png`;
}

/** The coordinates as the sheet speaks them: five decimals (~1 m), the
 *  reference's own register. Display only — the wire keeps every byte. */
export function fmtCoords(c: { lat: number; lng: number }): string {
  return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
}

/** The centre pin (drawn at the view's centre, tip on the point). The dot is
 *  a fill-rule HOLE, not a painted disc — one currentColor, zero hardcoded
 *  colors (the token-fidelity scan's law). */
export const epingleSvg = (s: number): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 4.9 5.7 11.4 6.6 12.4a.55.55 0 0 0 .8 0C13.3 20.4 19 13.9 19 9a7 7 0 0 0-7-7zm0 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/></svg>`;

/** The recentre glyph (crosshair — « revenir à ma position »). */
export const viseurSvg = (s: number, sw = 1.9): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/></svg>`;

/**
 * Mount the live view: fill the tile grid around `centre` and wire the drag.
 * Call it again after every re-render of the face — the old view's window
 * listeners notice their node left the document and stand down.
 *
 *  · `surCentre` fires ONCE per finished drag, with the new centre — the
 *    caller owns what becomes of it (its candidate, its re-render).
 *  · `surDeplacement` fires while the finger moves, for the live coordinate
 *    readout only — never a commit.
 *  · A press that never moved (< 4 px) commits nothing: a tap is not a drag.
 */
export function monterCarteVue(
  vue: HTMLElement,
  centre: { lat: number; lng: number },
  surCentre: (c: { lat: number; lng: number }) => void,
  surDeplacement?: (c: { lat: number; lng: number }) => void,
): void {
  const tuiles = vue.querySelector('[data-role="geo-tuiles"]');
  if (!(tuiles instanceof HTMLElement)) return;

  // jsdom and a not-yet-laid-out node both measure 0 — a phone-shaped
  // fallback keeps the grid math meaningful everywhere the walks run.
  const w = vue.clientWidth || 360;
  const h = vue.clientHeight || 480;
  const c = geoVersMonde(centre.lat, centre.lng, GEO_ZOOM);

  tuiles.style.transform = '';
  tuiles.textContent = '';
  // One extra ring beyond the edges, so a small drag meets tiles, not blank.
  const x0 = Math.floor((c.x - w / 2) / TUILE) - 1;
  const x1 = Math.floor((c.x + w / 2) / TUILE) + 1;
  const y0 = Math.floor((c.y - h / 2) / TUILE) - 1;
  const y1 = Math.floor((c.y + h / 2) / TUILE) + 1;
  for (let yt = y0; yt <= y1; yt += 1) {
    for (let xt = x0; xt <= x1; xt += 1) {
      const url = urlTuile(GEO_ZOOM, xt, yt);
      if (url === null) continue;
      const img = vue.ownerDocument.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      img.style.left = `${xt * TUILE - (c.x - w / 2)}px`;
      img.style.top = `${yt * TUILE - (c.y - h / 2)}px`;
      // A tile that cannot load leaves the calm ground, never a broken glyph.
      img.addEventListener('error', () => { img.remove(); });
      tuiles.appendChild(img);
    }
  }

  let depart: { x: number; y: number } | null = null;
  let dx = 0;
  let dy = 0;

  const bouge = (ev: Event): void => {
    if (depart === null) return;
    if (!vue.isConnected) { depart = null; detacher(); return; }
    const p = ev as PointerEvent;
    dx = p.clientX - depart.x;
    dy = p.clientY - depart.y;
    tuiles.style.transform = `translate(${dx}px, ${dy}px)`;
    if (surDeplacement !== undefined) surDeplacement(mondeVersGeo(c.x - dx, c.y - dy, GEO_ZOOM));
  };
  const lache = (): void => {
    if (depart === null) return;
    depart = null;
    detacher();
    if (Math.abs(dx) + Math.abs(dy) < 4) {
      // A tap is not a drag: nothing commits — and the READOUT returns to
      // the standing candidate too, or the sheet would keep speaking a point
      // the confirm will never keep (verifier MINOR, driven red first).
      tuiles.style.transform = '';
      if (surDeplacement !== undefined) surDeplacement(mondeVersGeo(c.x, c.y, GEO_ZOOM));
      return;
    }
    // The map moved right ⇒ the centre moved west: the offset SUBTRACTS.
    surCentre(mondeVersGeo(c.x - dx, c.y - dy, GEO_ZOOM));
  };
  const detacher = (): void => {
    const win = vue.ownerDocument.defaultView;
    if (win === null) return;
    win.removeEventListener('pointermove', bouge);
    win.removeEventListener('pointerup', lache);
    win.removeEventListener('pointercancel', lache);
  };

  vue.addEventListener('pointerdown', (ev: Event) => {
    const p = ev as PointerEvent;
    if (typeof p.button === 'number' && p.button !== 0) return;
    depart = { x: p.clientX, y: p.clientY };
    dx = 0;
    dy = 0;
    const win = vue.ownerDocument.defaultView;
    if (win === null) return;
    win.addEventListener('pointermove', bouge);
    win.addEventListener('pointerup', lache);
    win.addEventListener('pointercancel', lache);
  });
}
