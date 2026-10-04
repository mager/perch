export const STALE_AFTER = 180_000;
export const isMetric = value => typeof value === 'number' && Number.isFinite(value);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function freshness(snapshot, now) {
  if (!snapshot || !isMetric(snapshot.receivedAt)) return 'empty';
  return now - snapshot.receivedAt > STALE_AFTER ? 'stale' : 'fresh';
}
export function relativeTime(timestamp, now) {
  if (!isMetric(timestamp)) return 'not yet';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export function bytes(value) {
  if (!isMetric(value)) return 'Unavailable';
  const unit = value >= 1e12 ? 'TB' : 'GB';
  return `${new Intl.NumberFormat(undefined, {maximumFractionDigits:1}).format(value / (unit === 'TB' ? 1e12 : 1e9))} ${unit}`;
}
export function uptime(value) {
  if (!isMetric(value)) return 'Unavailable';
  const days = Math.floor(value / 86400), hours = Math.floor(value % 86400 / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor(value % 3600 / 60)}m`;
}
export function historyPoints(history) {
  return (Array.isArray(history) ? history : []).filter(p => isMetric(p?.receivedAt) && isMetric(p?.cpu) && p.cpu >= 0 && p.cpu <= 100).sort((a,b) => a.receivedAt - b.receivedAt);
}
// Scenarios operate only on a server-confirmed local demo response.
export function demoScenario(data, scenario) {
  if (!data.demo || scenario === 'normal' || scenario === 'error') return data.machines;
  const machines = structuredClone(data.machines);
  for (const machine of machines) {
    if (scenario === 'empty') { machine.snapshot = null; machine.history = []; }
    if (scenario === 'stale' && machine.snapshot) {
      const delta = data.serverTime - 12 * 60_000 - machine.snapshot.receivedAt;
      machine.snapshot.receivedAt += delta;
      machine.snapshot.sampledAt += delta;
      machine.history.forEach(p => p.receivedAt += delta);
    }
    if (scenario === 'unavailable' && machine.snapshot) {
      machine.snapshot.disk = null;
      machine.snapshot.tmuxStatus = 'unavailable';
      machine.snapshot.sessions = [];
    }
  }
  return machines;
}
