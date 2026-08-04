import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * C1's « La voix » player — the screen the founder means by « the buyer's pwa ».
 *
 * A NEW FILE, and the reason is worth writing down: the vitrine's player and
 * C1's player are two different implementations of the same idea, in two
 * different directories, and I fixed the wrong one first. Pinning C1 in its own
 * file makes the second one visible from the test tree instead of hiding inside
 * a name that could mean either.
 */

describe('VOIX-ÉTAT sur C1 — le lecteur a un visage (founder 2026-08-04)', () => {
  // « whenever i say buyer's pwa i mean this screen, the seconds are still not
  // counting when i tap play the audio here and the play button doesn't change
  // to pause button. »
  //
  // He had to say it twice because I fixed the VITRINE's player first. Same
  // defect, different file — the screen he points at is C1, and « the buyer's
  // pwa » means THIS one. Pinned here, on the path he actually uses.
  const flow = readFileSync(join(import.meta.dirname, '..', 'src', 'cliente', 'flow.ts'), 'utf8');

  it('the C1 tap hands its BUTTON to the player — without it nothing can be swapped', () => {
    // This is the whole bug in one argument: `jouerLaNote(url, demo)` played
    // the note and had no element to change.
    expect(flow).toContain('jouerLaNote(url, demo, el);');
    expect(flow).toMatch(/function jouerLaNote\(url: string, siRefus: \(\) => void, bouton\?: HTMLElement\)/);
  });

  it('the glyph becomes a PAUSE while playing and returns on every stop', () => {
    expect(flow).toContain('lecture ? iconPause(16) : iconPlay(16)');
    for (const ev of ['ended', 'pause', 'error']) {
      expect(flow, `no restore on ${ev}`).toContain(`addEventListener('${ev}', voixRepos)`);
    }
    // a REFUSED play must not leave a pause glyph over silence
    const refus = flow.slice(flow.indexOf('.catch((e: unknown)'), flow.indexOf('.catch((e: unknown)') + 200);
    expect(refus).toContain('voixRepos()');
    expect(refus).toContain('siRefus()');
  });

  it('the seconds COUNT, in the same m:ss shape the total already uses', () => {
    expect(flow).toContain("addEventListener('timeupdate'");
    expect(flow).toContain('voixHorloge(fmtSecondes(voixAudio.currentTime))');
    expect(flow).toContain('voixHorloge(fmtSecondes(0))'); // starts from zero on tap
    expect(flow).toContain('voixHorloge(voixTotal)'); // and the total comes back
  });

  it('tapping the note that is PLAYING pauses it — the glyph means what it says', () => {
    expect(flow).toContain('if (voixHote !== null && bouton === voixHote && !voixAudio.paused)');
    expect(flow).toContain('voixAudio.pause();');
  });

  it('the pause glyph exists on the SAME grid as the play triangle', async () => {
    const { iconPause: pause, iconPlay: play } = await import('../src/cliente/icons.js');
    expect(pause(16)).toContain('0 0 24 24');
    expect(play(16)).toContain('0 0 24 24');
    expect(pause(16)).not.toBe(play(16));
  });
});
