// Dev/test configuration
// Defaults are defined here; override in config.env (e.g. startNearIsland=true)

export const CONFIG = {
  startNearIsland: false,
  instantlyDockToNearestHarbor: false,
  forceEncounter: false, // when sailing begins, guarantee an enemy-ship encounter (test aid)
};

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config');
    const vars: Record<string, string> = await res.json();
    if (vars['startNearIsland'] === 'true') CONFIG.startNearIsland = true;
    if (vars['instantlyDockToNearestHarbor'] === 'true') CONFIG.instantlyDockToNearestHarbor = true;
    if (vars['forceEncounter'] === 'true') CONFIG.forceEncounter = true;
  } catch {
    // Config endpoint unavailable — use defaults
  }
}
