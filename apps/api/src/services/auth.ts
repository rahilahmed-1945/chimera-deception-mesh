import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALG = 'HS256';

export interface JwtClaims {
  sub: string; // user id
  tenantId: string;
  email: string;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export async function signToken(claims: JwtClaims): Promise<string> {
  return new SignJWT({ tenantId: claims.tenantId, email: claims.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
  return {
    sub: String(payload.sub),
    tenantId: String(payload.tenantId),
    email: String(payload.email),
  };
}
