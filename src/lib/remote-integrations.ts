import type { IntegrationValue } from "../context/IntegrationsStore";
export const integrationFields = ["spotifyConnected", "spotifyName", "spotifyBusy", "spotifyError", "nowPlaying", "spotifyPlaybackControl", "spotifyDevice", "spotifyDevices", "spotifyActionBusy", "spotifyVolumeBusy", "googleConnected", "googleBusy", "googleReady", "googleError", "events"] as const;
export type IntegrationSnapshot = Pick<IntegrationValue, typeof integrationFields[number]>;
export function integrationSnapshot(value: IntegrationValue): IntegrationSnapshot {
  return Object.fromEntries(integrationFields.map((key) => [key, value[key]])) as unknown as IntegrationSnapshot;
}
