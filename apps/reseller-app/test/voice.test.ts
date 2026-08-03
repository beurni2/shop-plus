/**
 * NOTES VOCALES (per-product) — the reducer + seam gates.
 *
 * The founder's rules as assertions: optional per product; record → recorded →
 * publish; re-record and delete both possible from any state; and the HONESTY
 * law — with no backend a published note is `pending`, NEVER `ready`/« en ligne ».
 * The reducer is pure and lives with no react-native import, so drift fails here
 * (Node), never on a device.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE_NOTES,
  NONE_NOTE,
  noteOf,
  startRecording,
  stopRecording,
  publishNote,
  cancelRecording,
  deleteNote,
  createDemoRecorder,
  readyNote,
  failPublish,
  fmtVoiceDuration,
  type ProductVoiceNotes,
  type ProductVoiceStatus,
} from '../src/vitrine/customize/voice';

const TAKE = { url: null, durationMs: 8_000 };

describe('the demo seed is empty — nothing is pre-published', () => {
  it('DEFAULT_VOICE_NOTES has no notes; an unknown pid resolves to NONE', () => {
    expect(Object.keys(DEFAULT_VOICE_NOTES)).toHaveLength(0);
    expect(noteOf(DEFAULT_VOICE_NOTES, 'p1')).toEqual(NONE_NOTE);
  });
});

describe('the record → recorded → publish cycle', () => {
  it('records, stops with the take, then publishes to PENDING (never ready)', () => {
    let n: ProductVoiceNotes = startRecording(DEFAULT_VOICE_NOTES, 'p1');
    expect(noteOf(n, 'p1').status).toBe('recording');
    n = stopRecording(n, 'p1', TAKE);
    expect(noteOf(n, 'p1')).toMatchObject({ status: 'recorded', durationMs: 8_000, url: null });
    n = publishNote(n, 'p1');
    expect(noteOf(n, 'p1').status).toBe('pending'); // HONESTY: pending, not « en ligne »
  });

  it('a note is per-product — publishing p1 never touches p2', () => {
    let n: ProductVoiceNotes = stopRecording(startRecording(DEFAULT_VOICE_NOTES, 'p1'), 'p1', TAKE);
    n = publishNote(n, 'p1');
    expect(noteOf(n, 'p2').status).toBe('none');
  });
});

describe('illegal transitions are no-ops (a stray tap never corrupts state)', () => {
  it('stop without recording, publish without a recorded take — both unchanged', () => {
    expect(stopRecording(DEFAULT_VOICE_NOTES, 'p1', TAKE)).toBe(DEFAULT_VOICE_NOTES);
    expect(publishNote(DEFAULT_VOICE_NOTES, 'p1')).toBe(DEFAULT_VOICE_NOTES);
    // publish is refused on a recording (only a `recorded` take publishes)
    const rec = startRecording(DEFAULT_VOICE_NOTES, 'p1');
    expect(publishNote(rec, 'p1')).toBe(rec);
    // starting a record while already recording is a no-op (same reference)
    expect(startRecording(rec, 'p1')).toBe(rec);
  });
});

describe('re-record and delete are possible from any kept state', () => {
  it('re-record (a start on an existing note) returns to recording', () => {
    const pending = publishNote(stopRecording(startRecording(DEFAULT_VOICE_NOTES, 'p1'), 'p1', TAKE), 'p1');
    expect(noteOf(pending, 'p1').status).toBe('pending');
    const again = startRecording(pending, 'p1');
    expect(noteOf(again, 'p1').status).toBe('recording');
  });

  it('delete removes the note from a recorded, a pending, and a recording state', () => {
    const recorded = stopRecording(startRecording(DEFAULT_VOICE_NOTES, 'p1'), 'p1', TAKE);
    expect('p1' in deleteNote(recorded, 'p1')).toBe(false);
    const pending = publishNote(recorded, 'p1');
    expect('p1' in deleteNote(pending, 'p1')).toBe(false);
    const recording = startRecording(DEFAULT_VOICE_NOTES, 'p1');
    expect('p1' in cancelRecording(recording, 'p1')).toBe(false); // cancel drops the in-progress take
  });
});

describe('HONESTY — no LOCAL action reaches `ready`; only the service does', () => {
  /**
   * PIN EVOLVED (VOIX-PRODUIT, 2026-08-03). It used to read « the reducer never
   * emits `ready` », which was true when nothing could store a note. Now
   * `readyNote` exists, and leaving the old name would have been a test whose
   * title lied about what it protects.
   *
   * THE CLAIM THAT ACTUALLY MATTERS IS UNCHANGED and is what is asserted here:
   * SHE cannot publish herself into « en ligne ». `ready` is reachable only by
   * handing over a url the service minted — which no amount of tapping can
   * produce.
   */
  it('no sequence of record/stop/publish/re-record ever produces the buyer-only `ready` status', () => {
    const seen = new Set<ProductVoiceStatus>();
    let n: ProductVoiceNotes = DEFAULT_VOICE_NOTES;
    const record = (): void => { n = startRecording(n, 'p1'); seen.add(noteOf(n, 'p1').status); };
    const stop = (): void => { n = stopRecording(n, 'p1', TAKE); seen.add(noteOf(n, 'p1').status); };
    const publish = (): void => { n = publishNote(n, 'p1'); seen.add(noteOf(n, 'p1').status); };
    record(); stop(); publish(); record(); stop(); publish();
    expect(seen.has('ready')).toBe(false);
    expect([...seen].sort()).toEqual(['pending', 'recorded', 'recording']);
  });

  it('`readyNote` is the ONLY door to `ready`, and it cannot be opened without a service url', () => {
    let n = publishNote(stopRecording(startRecording(DEFAULT_VOICE_NOTES, 'p1'), 'p1', TAKE), 'p1');
    expect(noteOf(n, 'p1').status).toBe('pending');
    // A blank url changes NOTHING — « ready » with nothing to play is the exact
    // dead-button defect the buyer projection also refuses.
    expect(readyNote(n, 'p1', '')).toBe(n);
    n = readyNote(n, 'p1', 'https://media/notes/p1.m4a');
    expect(noteOf(n, 'p1').status).toBe('ready');
    // …and the url stored is the SERVICE's, never the local file the phone had.
    expect(noteOf(n, 'p1').url).toBe('https://media/notes/p1.m4a');
    expect(noteOf(n, 'p1').url).not.toBe(TAKE.url);
  });

  it('only a PENDING note can be confirmed — a recorded one was never published', () => {
    const recorded = stopRecording(startRecording(DEFAULT_VOICE_NOTES, 'p1'), 'p1', TAKE);
    expect(readyNote(recorded, 'p1', 'https://media/x.m4a')).toBe(recorded);
    // and confirming twice is a no-op, not a second write
    const ready = readyNote(publishNote(recorded, 'p1'), 'p1', 'https://media/x.m4a');
    expect(readyNote(ready, 'p1', 'https://media/y.m4a')).toBe(ready);
  });

  it('A FAILED UPLOAD GOES BACK TO `recorded` — never left pending forever', () => {
    // There is no retry queue in this app. A note stuck « publiée dès que le
    // réseau revient » that will never publish is the queued-means-done lie told
    // slowly; the take is still on the phone, so `recorded` is the true state
    // and « Publier » is right there to tap again.
    const pending = publishNote(stopRecording(startRecording(DEFAULT_VOICE_NOTES, 'p1'), 'p1', TAKE), 'p1');
    const back = failPublish(pending, 'p1');
    expect(noteOf(back, 'p1').status).toBe('recorded');
    expect(noteOf(back, 'p1').url).toBe(TAKE.url); // the take SURVIVED
    // it refuses from any other state, so it can never undo a confirmed note
    const ready = readyNote(pending, 'p1', 'https://media/x.m4a');
    expect(failPublish(ready, 'p1')).toBe(ready);
  });
});

describe('the demo double satisfies the full capture seam (Node — no native module)', () => {
  it('stop() returns the elapsed duration and a null url (demo captures nothing)', async () => {
    let clock = 1_000;
    const rec = createDemoRecorder(() => clock);
    await rec.start();
    clock = 9_500; // 8.5 s later
    const take = await rec.stop();
    expect(take).toEqual({ url: null, durationMs: 8_500 });
  });

  it('requestPermission resolves granted; play/stopPlayback are no-ops that resolve', async () => {
    const rec = createDemoRecorder();
    await expect(rec.requestPermission()).resolves.toBe('granted');
    await expect(rec.play('file:///take.m4a')).resolves.toBeUndefined();
    await expect(rec.stopPlayback()).resolves.toBeUndefined();
  });
});

describe('fmtVoiceDuration — m:ss, mirrors the buyer formatter', () => {
  it('formats short and long', () => {
    expect(fmtVoiceDuration(8_000)).toBe('0:08');
    expect(fmtVoiceDuration(1_100)).toBe('0:01');
    expect(fmtVoiceDuration(72_000)).toBe('1:12');
  });
});
