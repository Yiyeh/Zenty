import test from "node:test";
import assert from "node:assert/strict";
import { setLocale, getLocale, getFormatLocale, tr, validLanguage, translateMessage } from "../src/lib/i18n.ts";
import { normalizeSettings, parseBackup, defaultData, sectionLabels } from "../src/lib/dashboard.ts";
import { decodeHtmlEntities } from "../server/news-api.ts";
import { gameStatuses } from "../src/lib/gaming.ts";
test("idiomas: cambio sin reiniciar, etiquetas reactivas, interpolación y plurales", async () => {
  await setLocale("en");
  assert.equal(getLocale(), "en"); assert.equal(getFormatLocale(), "en-US");
  assert.equal(sectionLabels.reading, "News");
  assert.equal(tr("common.games", { count: 1 }), "1 game");
  assert.equal(tr("common.games", { count: 2 }), "2 games");
  assert.ok(!tr("app.title").includes("{app}"));
  assert.equal(translateMessage("Noticias"), "News");
  assert.equal(translateMessage("Mi documento privado inventado"), "Mi documento privado inventado");
  await setLocale("pt");
  assert.equal(sectionLabels.reading, "Notícias");
  assert.notEqual(gameStatuses.playing, "Jugando");
  await setLocale("ja");
  assert.equal(decodeHtmlEntities("&ntilde;&Aacute;&uuml;"), "ñÁü");
  await setLocale("es");
  assert.equal(sectionLabels.reading, "Noticias");
});
test("idiomas: preferencias migran y sobreviven al respaldo sin aceptar códigos arbitrarios", () => {
  assert.equal(validLanguage("../../../etc"), false);
  assert.equal(normalizeSettings({ language: "unsupported" }).language, "es");
  for (const language of ["en", "es", "pt", "fr", "de", "it", "ja", "zh", "ko"]) {
    const data = structuredClone(defaultData); data.settings = normalizeSettings({ language, userName: "Alex" });
    assert.equal(parseBackup(JSON.stringify({ ...data, version: 2 })).settings.language, language);
  }
});
