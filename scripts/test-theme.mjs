import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { themeBootstrap, themePreference, isDarkTheme } from "../apps/web/lib/theme.ts";
for (const saved of ["light", "dark", "system", "invalid", null]) {
  for (const systemDark of [false, true]) {
    let applied;
    const document = {
      documentElement: {
        classList: {
          toggle: (name, value) => {
            assert.equal(name, "dark");
            applied = value;
          },
        },
        style: {},
      },
    };
    vm.runInNewContext(themeBootstrap, {
      localStorage: { getItem: () => saved },
      document,
      matchMedia: () => ({ matches: systemDark }),
    });
    assert.equal(applied, isDarkTheme(themePreference(saved), systemDark));
    assert.equal(document.documentElement.style.colorScheme, applied ? "dark" : "light");
  }
}
let dark;
vm.runInNewContext(themeBootstrap, {
  localStorage: {
    getItem: () => {
      throw Error("disabled");
    },
  },
  document: { documentElement: { classList: { toggle: (_, v) => (dark = v) }, style: {} } },
  matchMedia: () => ({ matches: true }),
});
assert.equal(dark, true);
const css = await readFile(new URL("../apps/web/app/globals.css", import.meta.url), "utf8");
const vars = (block) =>
  Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
  );
const light = vars(css.match(/:root\s*{([^}]+)}/s)[1]);
const night = { ...light, ...vars(css.match(/\.dark\s*{([^}]+)}/s)[1]) };
const lum = (hex) => {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return channels.reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0);
};
for (const palette of [light, night]) {
  for (const [fg, bg] of [
    ["--foreground", "--background"],
    ["--foreground", "--card"],
    ["--muted-foreground", "--card"],
    ["--muted-foreground", "--secondary"],
    ["--link", "--card"],
    ["--primary-foreground", "--primary"],
    ["--gold-text", "--card"],
  ]) {
    const a = lum(palette[fg]),
      b = lum(palette[bg]);
    const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(contrast >= 4.5, `${fg}/${bg}: ${contrast}`);
  }
}
assert.equal(light["--brand-green"], "#076849");
assert.equal(light["--brand-gold"], "#dfaf2b");
console.log(
  "Theme checks pass: stored/system preference, pre-paint bootstrap, blocked storage and light/dark text contrast.",
);
