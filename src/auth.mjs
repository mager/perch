import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { installationScope } from './identity.mjs';
export const SESSION = '__Host-perch';
export const NONCE = '__Host-perch-nonce';
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left=Buffer.from(a), right=Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
}
export function sign(value, secret) {
  const body=Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;
}
export function verify(token, secret, now=Date.now()) {
  try {
    const [body,mac,...rest]=(token||'').split('.');
    if(rest.length || !body || !equal(mac,createHmac('sha256',secret).update(body).digest('base64url'))) return null;
    const data=JSON.parse(Buffer.from(body,'base64url').toString());
    return Number.isFinite(data.exp) && data.exp > now ? data : null;
  } catch { return null; }
}
export function cookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split(/=(.*)/s)).filter(v=>v.length>1)); }
export function cookie(name,value,maxAge,cfg) {
  const secure=cfg.origin.startsWith('https:');
  return `${secure?name:name.replace('__Host-','') }=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
export function readCookie(req,name,cfg) {return cookies(req)[cfg.origin.startsWith('https:')?name:name.replace('__Host-','')];}
export function isOwner(payload,cfg) {
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) return false;
  if (cfg.ownerSub) return equal(payload.sub,cfg.ownerSub);
  return typeof payload.email === 'string' && payload.email_verified === true && (payload.email.endsWith('@gmail.com') || (typeof payload.hd === 'string' && Boolean(payload.hd))) && payload.email.toLowerCase() === cfg.ownerEmail;
}
export function scopedClaims(cfg,purpose) {return {aud:installationScope(cfg),purpose};}
export function inScope(value,cfg,purpose) {return value?.purpose===purpose && equal(value.aud,installationScope(cfg));}
export function authorized(req,cfg) { const user=verify(readCookie(req,SESSION,cfg),cfg.secret); return inScope(user,cfg,'session')&&isOwner(user,cfg)?user:null; }
export function nonce(cfg) {const value=randomBytes(24).toString('base64url');return {value,token:sign({...scopedClaims(cfg,'nonce'),nonce:value,exp:Date.now()+300_000},cfg.secret)};}
