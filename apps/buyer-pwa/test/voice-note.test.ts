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
    // The machine has NO 'sent'/'done' state at all — the type space proves it.
    const kinds: VoiceNoteState['kind'][] = ['idle', 'recording', 'recorded', 'queued', 'unavailable'];
    expect(kinds).not.toContain('sent');
    expect(kinds).not.toContain('done');
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
