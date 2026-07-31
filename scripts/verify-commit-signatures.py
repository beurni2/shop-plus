"""Verify the SSHSIG ed25519 signatures on git commits, RFC 8032 by hand.

No ssh-keygen in this image and the cryptography wheel is broken, so the check
is done from first principles. It carries its own NEGATIVE CONTROL: the same
routine must REJECT a commit whose message has been altered by one byte, or a
PASS here would mean nothing.
"""
import base64, hashlib, struct, subprocess, sys

p = 2**255 - 19
L = 2**252 + 27742317777372353535851937790883648493
d = (-121665 * pow(121666, p - 2, p)) % p
I = pow(2, (p - 1) // 4, p)

def recover_x(y, sign):
    xx = (y*y - 1) * pow(d*y*y + 1, p - 2, p)
    x = pow(xx, (p + 3) // 8, p)
    if (x*x - xx) % p != 0:
        x = (x * I) % p
    if (x*x - xx) % p != 0:
        return None
    if x % 2 != sign:
        x = p - x
    return x

def add(P, Q):
    x1, y1, z1, t1 = P; x2, y2, z2, t2 = Q
    a = ((y1 - x1) * (y2 - x2)) % p
    b = ((y1 + x1) * (y2 + x2)) % p
    c = (2 * t1 * t2 * d) % p
    e = (2 * z1 * z2) % p
    f, g, h, i = (b - a) % p, (e - c) % p, (e + c) % p, (b + a) % p
    return ((f*g) % p, (h*i) % p, (g*h) % p, (f*i) % p)

def mul(P, n):
    Q = (0, 1, 1, 0)
    while n > 0:
        if n & 1:
            Q = add(Q, P)
        P = add(P, P); n >>= 1
    return Q

By = (4 * pow(5, p - 2, p)) % p
Bx = recover_x(By, 0)
B = (Bx, By, 1, (Bx * By) % p)

def decode_point(s):
    y = int.from_bytes(s, 'little') & ((1 << 255) - 1)
    sign = (s[31] >> 7) & 1
    x = recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, (x * y) % p)

def eq(P, Q):
    return (P[0]*Q[2] - Q[0]*P[2]) % p == 0 and (P[1]*Q[2] - Q[1]*P[2]) % p == 0

def ed25519_verify(pub, sig, msg):
    if len(sig) != 64:
        return False
    A = decode_point(pub); R = decode_point(sig[:32])
    if A is None or R is None:
        return False
    S = int.from_bytes(sig[32:], 'little')
    if S >= L:
        return False
    k = int.from_bytes(hashlib.sha512(sig[:32] + pub + msg).digest(), 'little') % L
    return eq(mul(B, S), add(R, mul(A, k)))

def sstr(b, o):
    (n,) = struct.unpack('>I', b[o:o+4]); return b[o+4:o+4+n], o+4+n

def enc(b):
    return struct.pack('>I', len(b)) + b

def split_commit(raw):
    """The signed message is the commit object with its gpgsig header removed."""
    out, sig_lines, grab = [], [], False
    for ln in raw.split(b'\n'):
        if ln.startswith(b'gpgsig '):
            grab = True; sig_lines.append(ln[7:]); continue
        if grab:
            if ln.startswith(b' '):
                sig_lines.append(ln[1:]); continue
            grab = False
        out.append(ln)
    return b'\n'.join(out), b''.join(l for l in sig_lines if not l.startswith(b'-----'))

def verify(raw):
    msg, b64 = split_commit(raw)
    blob = base64.b64decode(b64)
    if blob[:6] != b'SSHSIG':
        return None
    off = 10
    pk, off = sstr(blob, off)
    ns, off = sstr(blob, off)
    res, off = sstr(blob, off)
    halg, off = sstr(blob, off)
    wrap, off = sstr(blob, off)
    _, so = sstr(wrap, 0); sig, _ = sstr(wrap, so)
    _, ko = sstr(pk, 0); key, _ = sstr(pk, ko)
    h = hashlib.new(halg.decode(), msg).digest()
    signed = b'SSHSIG' + enc(ns) + enc(res) + enc(halg) + enc(h)
    return ed25519_verify(key, sig, signed), ns.decode(), halg.decode()

if __name__ == '__main__':
    ok = True
    for sha in sys.argv[1:]:
        raw = subprocess.run(['git', 'cat-file', 'commit', sha], capture_output=True).stdout
        r = verify(raw)
        if r is None:
            print(f'{sha}  NO SIGNATURE'); ok = False; continue
        good, ns, halg = r
        print(f'{sha}  {"VALID" if good else "INVALID"}   namespace={ns} hash={halg}')
        ok &= good
    # NEGATIVE CONTROL — flip one byte of the message; it MUST stop verifying
    raw = subprocess.run(['git', 'cat-file', 'commit', sys.argv[1]], capture_output=True).stdout
    tampered = raw.replace(b'tree ', b'tree ', 1)
    tampered = tampered[:-2] + bytes([tampered[-2] ^ 0x01]) + tampered[-1:]
    bad = verify(tampered)[0]
    print(f'CONTROL  one flipped byte -> {"INVALID (correct)" if not bad else "STILL VALID — THE CHECK IS BROKEN"}')
    sys.exit(0 if (ok and not bad) else 1)
