export function config(env = process.env) {
  const demo = env.PERCH_DEMO === '1';
  if (demo && (env.VERCEL || env.NODE_ENV === 'production')) throw new Error('Demo mode is local-only.');
  if (demo) return { demo:true, origin:'http://localhost:8787', machines:{} };
  for (const key of ['PERCH_ORIGIN','GOOGLE_CLIENT_ID','SESSION_SECRET','PERCH_MACHINES','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const origin = new URL(env.PERCH_ORIGIN);
  if (origin.origin !== env.PERCH_ORIGIN || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === 'localhost' && !env.VERCEL))) throw new Error('PERCH_ORIGIN must be a canonical HTTPS origin.');
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters.');
  if (!env.OWNER_EMAIL && !env.OWNER_GOOGLE_SUB) throw new Error('Configure an owner.');
  const machines = JSON.parse(env.PERCH_MACHINES);
  if (!machines || Array.isArray(machines) || typeof machines !== 'object' || Object.keys(machines).length < 1 || Object.keys(machines).length > 10) throw new Error('Configure between one and ten machines.');
  const tokens = new Set();
  for (const [id, machine] of Object.entries(machines)) {
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || typeof machine?.name !== 'string' || !machine.name.trim() || machine.name.length > 80 || typeof machine.token !== 'string' || machine.token.length < 32 || tokens.has(machine.token) || machine.token === env.SESSION_SECRET) throw new Error('Machines need valid IDs, names, and distinct random tokens.');
    tokens.add(machine.token);
  }
  return { demo:false, origin:origin.origin, clientId:env.GOOGLE_CLIENT_ID, secret:env.SESSION_SECRET, ownerEmail:env.OWNER_EMAIL?.toLowerCase(), ownerSub:env.OWNER_GOOGLE_SUB, machines, redisUrl:env.UPSTASH_REDIS_REST_URL, redisToken:env.UPSTASH_REDIS_REST_TOKEN };
}
