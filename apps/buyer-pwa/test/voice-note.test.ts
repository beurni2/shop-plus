import { describe, expect, it } from 'vitest';
import { voiceNoteReduce, type VoiceNoteState } from '../src/voice-note';

/**
 * WO-4.4 — the voice-note state machine: record → playback → re-record, and
 * the HONESTY LAW — a kept note is QUEUED (pending), and nothing (not even
 * the network coming back) flips it to « done » while no server exists.
 */

const idle: VoiceNoteState = { kind: 'idle' };

describe('voice note — record → playback → re-record', () => {
  it('walks the happy path: idle → recording → recorded → (keep) queued', () => {
    let s = voiceNoteReduce(idle, { type: 'RECORD_STARTED' });
    expect(s).toEqual({ kind: 'recording' });
    s = voiceNoteReduce(s, { type: 'RECORD_STOPPED' });
    expect(s).toEqual({ kind: 'recorded' });
    s = voiceNoteReduce(s, { type: 'KEEP' });
    expect(s).toEqual({ kind: 'queued' });
  });

  it('re-record loops from recorded back to recording — as cheap as keeping', () => {
    const recorded: VoiceNoteState = { kind: 'recorded' };
    expect(voiceNoteReduce(recorded, { type: 'RE_RECORD' })).toEqual({ kind: 'recording' });
  });

  it('QUEUED is terminal in the sandbox: no event moves it to a « done » — honesty law', () => {
    const queued: VoiceNoteState = { kind: 'queued' };
    for (const type of ['RECORD_STARTED', 'RECORD_STOPPED', 'RE_RECORD', 'KEEP'] as const) {
      expect(voiceNoteReduce(queued, { type })).toEqual(queued);
    }
  });

  it('the type space has NO done-class state — enforced at COMPILE time, not by a hand-kept list (verifier NB③)', () => {
    // If anyone ever adds a 'sent'/'done'/'envoye'/'delivered' kind to
    // VoiceNoteState, ForbiddenKinds stops being never and typecheck FAILS.
    type ForbiddenKinds = Extract<VoiceNoteState['kind'], 'sent' | 'done' | 'envoye' | 'delivered'>;
    const noDoneState: ForbiddenKinds extends never ? true : never = true;
    // And the kind union is EXACTLY the five honest states — adding a sixth
    // (or removing one) breaks both directions of this assignment.
    type Expected = 'idle' | 'recording' | 'recorded' | 'queued' | 'unavailable';
    const exact: VoiceNoteState['kind'] extends Expected
      ? Expected extends VoiceNoteState['kind']
        ? true
        : never
      : never = true;
    expect(noDoneState && exact).toBe(true);
  });

  it('illegal transitions leave the state untouched (a stray event never corrupts the walk)', () => {
    expect(voiceNoteReduce(idle, { type: 'RECORD_STOPPED' })).toEqual(idle);
    expect(voiceNoteReduce(idle, { type: 'KEEP' })).toEqual(idle);
    expect(voiceNoteReduce({ kind: 'recording' }, { type: 'KEEP' })).toEqual({ kind: 'recording' });
    expect(voiceNoteReduce({ kind: 'recording' }, { type: 'RE_RECORD' })).toEqual({ kind: 'recording' });
  });

  it('mic refusal and recorder absence are DESIGNED states with their own catalog keys', () => {
    expect(voiceNoteReduce(idle, { type: 'MIC_REFUSED' })).toEqual({
      kind: 'unavailable',
      reasonKey: 'voix.micro_refuse',
    });
    expect(voiceNoteReduce({ kind: 'recording' }, { type: 'RECORDER_ABSENT' })).toEqual({
      kind: 'unavailable',
      reasonKey: 'voix.indisponible',
    });
  });
});
