import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { translate, localeFor } from "../apps/web/lib/i18n.ts";
import { calculationExplanation } from "../apps/web/lib/explanations.ts";
import { fiqhExplanation } from "../apps/web/lib/fiqh.ts";
import { hijriDateLabel } from "../apps/web/lib/hijri.ts";
import { completeConfiguration, CalculationRevision } from "../apps/web/lib/automatic.ts";
import init, { calculateDay, listProfiles } from "../apps/web/public/wasm/prayertime.js";
const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, "apps/web/package.json"));
const ts = require("typescript");
const { createElement: h } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
await init({
  module_or_path: await readFile(join(root, "apps/web/public/wasm/prayertime_bg.wasm")),
});
const base = {
  date: "2026-09-12",
  location: { latitude_deg: 52.52, longitude_deg: 13.405 },
  timezone: "Europe/Berlin",
  profiles: { calculation: "calc.mwl@1", fiqh: "fiqh.shafii@1" },
  high_latitude: "none",
  rounding: "nearest_minute",
  ramadan: null,
  adjustments_minutes: {},
};
assert.equal(completeConfiguration(base), true);
for (const patch of [
  { date: "" },
  { timezone: "" },
  { location: { latitude_deg: NaN, longitude_deg: 1 } },
  { location: { latitude_deg: 91, longitude_deg: 1 } },
  { adjustments_minutes: { fajr: NaN } },
])
  assert.equal(completeConfiguration({ ...base, ...patch }), false);
const revision = new CalculationRevision();
const old = revision.snapshot();
let resolveOld;
const pending = new Promise((resolve) => (resolveOld = resolve));
const accepted = pending.then(() => revision.accepts(old));
revision.invalidate();
resolveOld();
assert.equal(await accepted, false);
assert.equal(revision.accepts(revision.snapshot()), true);
const messages = JSON.parse(
  await readFile(join(root, "apps/web/lib/locales/messages.json"), "utf8"),
);
const templates = JSON.parse(
  await readFile(join(root, "apps/web/lib/locales/templates.json"), "utf8"),
);
for (const [key, values] of Object.entries({ ...messages, ...templates }))
  assert.ok(values.length === 2 && values.every((v) => typeof v === "string" && v.length > 0), key);
for (const file of ["app/page.tsx", "components/city-search.tsx", "components/theme-picker.tsx", "components/prayer-windows.tsx"]) {
  const source = await readFile(join(root, "apps/web", file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function check(node) {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (/[a-z]{2}/i.test(text) && !["PrayerTime", "CSV", "Open-Meteo", "GeoNames"].includes(text))
        assert.ok(messages[text], text);
    }
    ts.forEachChild(node, check);
  }
  check(ast);
}
const cases = [
  base,
  { ...base, date: "2026-06-21", high_latitude: "one_seventh" },
  { ...base, date: "2026-06-21", location: { latitude_deg: 69.65, longitude_deg: 18.96 } },
  { ...base, profiles: { ...base.profiles, calculation: "calc.umm_al_qura@1" }, ramadan: true },
];
for (const language of ["de", "ar"]) {
  for (const input of cases) {
    const day = JSON.parse(calculateDay(JSON.stringify(input)));
    for (const prayer of day.prayers) {
      const sections = calculationExplanation(prayer, day);
      for (const text of [
        ...sections.flatMap((s) => [s.title, ...s.paragraphs]),
        ...fiqhExplanation(prayer.name, input.profiles.fiqh),
      ]) {
        assert.notEqual(translate(text, language), text, language + ": " + text);
        assert.doesNotMatch(translate(text, language), /undefined|\{\d+\}/);
      }
    }
  }
  for (const method of JSON.parse(listProfiles()).methods)
    assert.ok(messages[method.name], method.name);
  assert.notEqual(hijriDateLabel("2024-03-11", localeFor(language)), hijriDateLabel("2024-03-11"));
  assert.notEqual(
    translate(
      "RAMADAN_CONTEXT_REQUIRED: This method needs an explicit Ramadan yes/no selection; no calendar is inferred",
      language,
    ),
    "RAMADAN_CONTEXT_REQUIRED: This method needs an explicit Ramadan yes/no selection; no calendar is inferred",
  );
}
// Render the actual presentation translator without a browser. Machine values and JSON must survive unchanged.
const temp = await mkdtemp(join(root, "apps/web/.translation-test-"));
try {
  await mkdir(join(temp, "lib/locales"), { recursive: true });
  await mkdir(join(temp, "components"));
  for (const name of ["messages", "templates"])
    await writeFile(
      join(temp, "lib/locales/" + name + ".json"),
      await readFile(join(root, "apps/web/lib/locales/" + name + ".json")),
    );
  for (const file of ["lib/i18n.ts", "components/language.tsx", "components/prayer-windows.tsx"]) {
    const source = await readFile(join(root, "apps/web", file), "utf8");
    const out = ts
      .transpileModule(source, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replaceAll("@/lib/i18n", "../lib/i18n.js")
      .replaceAll("@/components/language", "./language.js");
    await writeFile(join(temp, file.replace(/\.tsx?$/, ".js")), out);
  }
  const { LanguageProvider, Localized } = await import(
    pathToFileURL(join(temp, "components/language.js"))
  );
  const { PrayerWindows } = await import(pathToFileURL(join(temp, "components/prayer-windows.js")));
  for (const language of ["de", "ar"]) {
    const windowDay = JSON.parse(calculateDay(JSON.stringify({ ...base, window_profile: "shafii_draft" })));
    const windowHtml = renderToStaticMarkup(h(LanguageProvider, { initialLanguage: language }, h(PrayerWindows, { day: windowDay })));
    assert.equal((windowHtml.match(/class="window-card"/g) ?? []).length, 5);
    for (const key of ["Prayer windows", "Preferred until", "Outer end", "True dawn on the following date", "One third of sunset to the following dawn", "Noon shadow + twice the object-height", "Daylight becomes bright (isfar)", "No clock time: a validated local brightness criterion is needed."])
      assert.ok(windowHtml.includes(translate(key, language)), key);
    assert.ok(windowHtml.includes("2026-09-13"));
    for (const w of windowDay.windows.windows) {
      assert.notEqual(translate(w.preferred_guidance,language),w.preferred_guidance);
      assert.ok(windowHtml.includes(translate(w.preferred_guidance,language)));
    }
    assert.ok(windowHtml.includes(windowDay.windows.windows[2].preferred_until.displayed.clock));
    assert.equal(windowDay.windows.windows[0].preferred_until.displayed,null);
    assert.ok(windowHtml.includes(windowDay.windows.definition.sources[0]));
    const fixed = JSON.parse(calculateDay(JSON.stringify({ ...base, window_profile: "shafii_draft", profiles: { ...base.profiles, calculation: "calc.umm_al_qura@1" }, ramadan: false })));
    const fixedHtml = renderToStaticMarkup(h(LanguageProvider, { initialLanguage: language }, h(PrayerWindows, { day: fixed })));
    assert.ok(fixedHtml.includes(translate("Fixed-minute Isha does not identify the end of red twilight.", language)));
    const html = renderToStaticMarkup(
      h(
        LanguageProvider,
        { initialLanguage: language },
        h(
          Localized,
          null,
          h(
            "div",
            null,
            h("button", null, "Recalculate"),
            h("input", { placeholder: "Search city", defaultValue: "calc.mwl@1" }),
            h("pre", null, "Calculation method"),
          ),
        ),
      ),
    );
    assert.ok(html.includes(translate("Recalculate", language)));
    assert.ok(html.includes(translate("Search city", language)));
    assert.ok(html.includes("calc.mwl@1"));
    assert.ok(html.includes("<pre>Calculation method</pre>"));
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log(
  "Localization/automatic checks pass: complete inputs, stale-task rejection, German/Arabic explanation coverage, localized Hijri dates and React presentation with protected machine values.",
);
