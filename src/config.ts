// Dev/test configuration
// Defaults are defined here; override in config.env (e.g. startNearIsland=true)

export const CONFIG = {
  startNearIsland: false,
  instantlyDockToNearestHarbor: false,
  forceEncounter: false, // when sailing begins, guarantee an enemy-ship encounter (test aid)
  forceStorm: false,     // when sailing begins, kick off a storm immediately (test aid)
  forceKraken: false,    // when sailing in deep water, guarantee a kraken encounter (test aid)
};

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config');
    const vars: Record<string, string> = await res.json();
    if (vars['startNearIsland'] === 'true') CONFIG.startNearIsland = true;
    if (vars['instantlyDockToNearestHarbor'] === 'true') CONFIG.instantlyDockToNearestHarbor = true;
    if (vars['forceEncounter'] === 'true') CONFIG.forceEncounter = true;
    if (vars['forceStorm'] === 'true') CONFIG.forceStorm = true;
    if (vars['forceKraken'] === 'true') CONFIG.forceKraken = true;
  } catch {
    // Config endpoint unavailable — use defaults
  }
}
