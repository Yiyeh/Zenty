import test from "node:test";
import assert from "node:assert/strict";
import { defaultData, normalizeSettings, parseBackup } from "../src/lib/dashboard.ts";
import { applySettings, effectiveSettings } from "../src/lib/spaces.ts";
test("espacios: widgets por perfil y apariencia por dispositivo sobreviven a una exportación", () => {
  const id = "device-pc", phone = "device-phone"; let settings = structuredClone(defaultData.settings);
  settings = applySettings(settings, { ...effectiveSettings(settings, id), devicePreferences: { [id]: { space: "gaming" } } }, id);
  assert.equal(effectiveSettings(settings, id).enabledWidgets.tasks, false);
  const gaming = effectiveSettings(settings, id); gaming.enabledWidgets = { ...gaming.enabledWidgets, music: false }; gaming.surfaceTone = "rose";
  settings = applySettings(settings, gaming, id);
  assert.equal(effectiveSettings(settings, phone, true).density, "compact");
  assert.equal(effectiveSettings(settings, phone).surfaceTone, defaultData.settings.surfaceTone);
  settings = applySettings(settings, { ...effectiveSettings(settings, id), devicePreferences: { ...settings.devicePreferences, [id]: { ...settings.devicePreferences[id], space: "work" } } }, id);
  assert.equal(effectiveSettings(settings, id).enabledWidgets.tasks, true);
  settings = applySettings(settings, { ...effectiveSettings(settings, id), devicePreferences: { ...settings.devicePreferences, [id]: { ...settings.devicePreferences[id], space: "gaming" } } }, id);
  const restored = parseBackup(JSON.stringify({ ...defaultData, version: 2, settings })).settings;
  assert.equal(effectiveSettings(restored, id).enabledWidgets.music, false); assert.equal(effectiveSettings(restored, id).surfaceTone, "rose");
  assert.equal(normalizeSettings({ devicePreferences: { "bad/path": { theme: "light" } } }).devicePreferences["bad/path"], undefined);
});
