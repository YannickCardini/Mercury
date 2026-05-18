import { createHmac, timingSafeEqual } from 'node:crypto';

// JWT HS256 maison (pas de dépendance externe) pour émettre/vérifier des
// session tokens longue durée délivrés au login Google. Découple la session
// applicative du Google ID token qui expire en 1 h.

const SESSION_TTL_DAYS = 10000;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

const HEADER = { alg: 'HS256', typ: 'JWT' };
const HEADER_B64 = base64UrlEncode(Buffer.from(JSON.stringify(HEADER)));

interface SessionPayload {
    sub: string;
    iat: number;
    exp: number;
    iss: 'mercury';
}

function base64UrlEncode(buf: Buffer): string {
    return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): Buffer {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((str.length + 2) % 4);
    return Buffer.from(padded, 'base64');
}

function getSecret(): Buffer {
    const secret = process.env['SESSION_JWT_SECRET'];
    if (!secret || secret.length < 16) {
        throw new Error('SESSION_JWT_SECRET must be set (>=16 chars)');
    }
    return Buffer.from(secret, 'utf8');
}

function sign(signingInput: string): string {
    return base64UrlEncode(createHmac('sha256', getSecret()).update(signingInput).digest());
}

export function signSessionToken(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
        sub: userId,
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
        iss: 'mercury',
    };
    const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
    const signingInput = `${HEADER_B64}.${payloadB64}`;
    return `${signingInput}.${sign(signingInput)}`;
}

export function verifySessionToken(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    const expectedSig = sign(`${headerB64}.${payloadB64}`);
    const a = Buffer.from(expectedSig);
    const b = Buffer.from(sigB64);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let payload: SessionPayload;
    try {
        payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as SessionPayload;
    } catch {
        return null;
    }
    if (payload.iss !== 'mercury' || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload.sub;
}
