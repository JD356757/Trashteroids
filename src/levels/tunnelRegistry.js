import level2Tunnels from './level2Tunnels.json';

const REGISTRY = {
  level2: level2Tunnels,
};

export function getTunnelData(key) {
  return REGISTRY[key] ?? null;
}
