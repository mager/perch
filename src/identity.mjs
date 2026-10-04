import { createHash } from 'node:crypto';

// Use configured identity, never a request header or a caller-supplied owner ID.
// This prevents accidental namespace reuse; it does not isolate Redis credentials.
export function installationScope(cfg) {
  const owner=cfg.ownerSub?['sub',cfg.ownerSub]:['email',cfg.ownerEmail];
  return createHash('sha256').update(JSON.stringify([cfg.origin,cfg.clientId,owner])).digest('hex');
}
