// Dev/test configuration
// Defaults are defined here; override in config.env (e.g. startNearIsland=true)

export const CONFIG = {
  startNearIsland: false,
  instantlyDockToNearestHarbor: false,
};

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config');
    const vars: Record<string, string> = await res.json();
    if (vars['startNearIsland'] === 'true') CONFIG.startNearIsland = true;
    if (vars['instantlyDockToNearestHarbor'] === 'true') CONFIG.instantlyDockToNearestHarbor = true;
  } catch {
    // Config endpoint unavailable — use defaults
  }
}
