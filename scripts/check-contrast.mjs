/**
 * scripts/check-contrast.mjs
 * Computes WCAG 2.1 contrast ratio for color pairs in tokens.css
 * Fails if normal text contrast is below 4.5:1 (WCAG AA).
 */

function parseHex(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  if (clean.length === 6) {
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  if (clean.length === 3) {
    const r = ((num >> 8) & 15) * 17;
    const g = ((num >> 4) & 15) * 17;
    const b = (num & 15) * 17;
    return [r, g, b];
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(parseHex(hex1));
  const lum2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

export const themes = {
  dark: {
    bg: '#0a0f1f',
    panel: '#11172e',
    text: '#e9ecf8',
    muted: '#9faad6', // adjusted from #8b95c4 to guarantee AA >= 4.5:1 against dark bg
    accent: '#ff5c72', // high contrast accent for dark bg text
    accentBg: '#d8283f', // brand red for button background with white text
    success: '#3ee099',
    warning: '#f0b04a',
    info: '#8ea1ff',
  },
  light: {
    bg: '#f6f6f2',
    panel: '#ffffff',
    text: '#14182b',
    muted: '#525977', // adjusted to guarantee AA >= 4.5:1 against light bg
    accent: '#b81428', // seal red with >= 4.5:1 against white/paper
    accentBg: '#d8283f',
    success: '#177a4c',
    warning: '#8f5600',
    info: '#2d4ed8',
  },
};

export function checkContrast() {
  const results = [];
  let allPass = true;

  for (const [themeName, t] of Object.entries(themes)) {
    // Check text against bg and panel
    const pairs = [
      { name: `${themeName}: text on bg`, fg: t.text, bg: t.bg, min: 4.5 },
      { name: `${themeName}: text on panel`, fg: t.text, bg: t.panel, min: 4.5 },
      { name: `${themeName}: muted on bg`, fg: t.muted, bg: t.bg, min: 4.5 },
      { name: `${themeName}: muted on panel`, fg: t.muted, bg: t.panel, min: 4.5 },
      { name: `${themeName}: accent text on bg`, fg: t.accent, bg: t.bg, min: 4.5 },
      { name: `${themeName}: accent text on panel`, fg: t.accent, bg: t.panel, min: 4.5 },
      { name: `${themeName}: white on accentBg button`, fg: '#ffffff', bg: t.accentBg, min: 4.5 },
      { name: `${themeName}: success on panel`, fg: t.success, bg: t.panel, min: 3.0 },
      { name: `${themeName}: warning on panel`, fg: t.warning, bg: t.panel, min: 3.0 },
      { name: `${themeName}: info on panel`, fg: t.info, bg: t.panel, min: 3.0 },
    ];

    for (const p of pairs) {
      const ratio = contrastRatio(p.fg, p.bg);
      const pass = ratio >= p.min;
      if (!pass) allPass = false;
      results.push({ ...p, ratio: ratio.toFixed(2), pass });
    }
  }

  return { ok: allPass, results };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const { ok, results } = checkContrast();
  console.log('=== Color Contrast AA Verification ===');
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${r.name}: ${r.fg} on ${r.bg} -> ${r.ratio}:1 (min ${r.min}:1)`);
  }
  if (!ok) {
    console.error('\nContrast check FAILED: Some color pairs do not meet WCAG AA requirements.');
    process.exit(1);
  }
  console.log('\nAll color token pairs meet WCAG AA requirements.');
}
