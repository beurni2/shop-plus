import { describe, expect, it } from 'vitest';
import { CLE_SANS_ADRESSE, RETRY_AFTER_S, admis, cleAdresse, cleAppelant, refusLimite, type Limiteur } from '../src/limite';

/**
 * LIMITE-ANONYME-1 — the pure rules of the ceiling: who the caller is, what
 * « open » means when no ceiling can be asked, and what a refusal says. The
 * real binding, counting real requests on the real bundle, is
 * `limite.e2e.test.ts` (miniflare binds its own rate limiter).
 */

function limiteur(reponses: boolean[]): Limiteur & { cles: string[] } {
  const cles: string[] = [];
  return {
    cles,
    async limit({ key }) {
      cles.push(key);
      const success = reponses.shift();
      if (success === undefined) throw new Error('scripted limiter exhausted');
      return { success };
    },
  };
}

const requete = (ip?: string): Request => new Request('https://svc/tiles/17/1/1.png', ip === undefined ? {} : { headers: { 'CF-Connecting-IP': ip } });

describe('LIMITE-ANONYME-1 — the caller is the edge-stamped address', () => {
  it('keys on CF-Connecting-IP, and on a fixed word when the edge stamped none', () => {
    expect(cleAppelant(requete('203.0.113.9'))).toBe('203.0.113.9');
    expect(cleAppelant(requete())).toBe(CLE_SANS_ADRESSE);
  });

  it('keys an IPv6 caller on its /64 — one caller, not 2^64 keys — and leaves IPv4 whole', () => {
    expect(cleAdresse('203.0.113.9')).toBe('203.0.113.9');
    expect(cleAdresse('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    // Two addresses of one /64 share the key; the next /64 does not.
    expect(cleAdresse('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(cleAdresse('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    // `::` compression, wherever it sits, expands before the prefix is cut.
    expect(cleAdresse('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(cleAdresse('::1')).toBe('0:0:0:0::/64');
    expect(cleAdresse('fe80::')).toBe('fe80:0:0:0::/64');
    expect(cleAdresse('2001:0db8:0000:0001::5')).toBe('2001:db8:0:1::/64');
    // An IPv4-mapped form is an IPv4 caller and stays whole.
    expect(cleAdresse('::ffff:203.0.113.9')).toBe('::ffff:203.0.113.9');
    expect(cleAppelant(requete('2001:db8:1:2:3:4:5:6'))).toBe('2001:db8:1:2::/64');
  });
});

describe('LIMITE-ANONYME-1 — admis', () => {
  it('asks the binding with the caller’s address and answers its word', async () => {
    const l = limiteur([true, false]);
    expect(await admis(l, requete('203.0.113.9'))).toBe(true);
    expect(await admis(l, requete('203.0.113.9'))).toBe(false);
    expect(l.cles).toEqual(['203.0.113.9', '203.0.113.9']);
  });

  it('FAIL OPEN: no binding at all leaves the door open, and never touches a limiter', async () => {
    expect(await admis(undefined, requete('203.0.113.9'))).toBe(true);
  });

  it('FAIL OPEN: a binding that throws leaves the door open — a platform hiccup is not a refusal', async () => {
    const casse: Limiteur = {
      async limit() {
        throw new Error('binding unavailable');
      },
    };
    expect(await admis(casse, requete('203.0.113.9'))).toBe(true);
  });
});

describe('LIMITE-ANONYME-1 — the refusal', () => {
  it('is 429 by name, with a Retry-After the caller can act on', async () => {
    const res = refusLimite();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe(String(RETRY_AFTER_S));
    expect(await res.json()).toEqual({ error: 'too_many_requests' });
  });
});
