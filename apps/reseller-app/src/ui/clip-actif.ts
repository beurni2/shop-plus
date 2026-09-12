/**
 * OPPORTUNITES-LEGER-1 (AUDIT-SHOP-2 F-49) — WHICH CLIP PLAYS: the tile in view.
 *
 * The grid mounts ONE player, on the clip-bearing tile with the most of itself
 * inside the viewport. Pure: the grid hands in what it knows — the offers in
 * order, each measured tile's place in its column, the columns block's top
 * inside the scroll content, and the viewport (scroll offset, height) — and
 * gets back the id to play, or null when nothing has a clip.
 *
 * UNTIL A LAYOUT IS KNOWN — first paint, or the test double, which lays out
 * nothing — the FIRST clip tile in order plays, so the top of the list moves
 * at once and a grid with no measurements still has exactly one player. A
 * tile that has not reported its layout is skipped, never guessed.
 */
export interface MesureTuile {
  readonly y: number;
  readonly h: number;
}

export interface Fenetre {
  /** the scroll offset */
  readonly y: number;
  /** the viewport's height; 0 = not yet laid out */
  readonly h: number;
}

export function choisirClipActif(
  offres: readonly { readonly productVersionId: string; readonly videoRef?: string | undefined }[],
  mesures: ReadonlyMap<string, MesureTuile>,
  grilleY: number,
  fenetre: Fenetre,
): string | null {
  const avecClip = offres.filter((o) => o.videoRef !== undefined && o.videoRef !== '');
  let choix: string | null = avecClip[0]?.productVersionId ?? null;
  if (fenetre.h <= 0) return choix;
  let meilleur = 0;
  for (const o of avecClip) {
    const m = mesures.get(o.productVersionId);
    if (m === undefined || m.h <= 0) continue;
    const haut = grilleY + m.y;
    const visible = Math.min(haut + m.h, fenetre.y + fenetre.h) - Math.max(haut, fenetre.y);
    // strictly more: ties keep the earlier tile, so a scroll that leaves two
    // tiles equally visible does not flip the player back and forth
    if (visible > meilleur) {
      meilleur = visible;
      choix = o.productVersionId;
    }
  }
  return choix;
}
