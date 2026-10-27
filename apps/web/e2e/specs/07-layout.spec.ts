import { test, expect } from '../fixtures.js';

const ROUTES = [
  { name: 'home', hash: '#/' },
  { name: 'about', hash: '#/about' },
  { name: 'agents', hash: '#/agents' },
  { name: 'verify', hash: '#/verify?rpc=http://127.0.0.1:8545' },
  { name: 'create', hash: '#/create?rpc=http://127.0.0.1:8545' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

test.describe('Layout: no horizontal page overflow, readable circuit diagram', () => {
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`no horizontal overflow on ${route.name} at ${vp.name} (${vp.width}px)`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/${route.hash}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);

        const metrics = await page.evaluate(() => {
          const wide: string[] = [];
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.right > window.innerWidth + 1) {
              const cls = (el as HTMLElement).className;
              const name = typeof cls === 'string' ? cls : '';
              wide.push(`${el.tagName.toLowerCase()}.${name} right=${Math.round(rect.right)}`);
            }
          }
          return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            wide: wide.slice(0, 8),
          };
        });
        expect(
          metrics.scrollWidth,
          `${route.name} is ${metrics.scrollWidth}px wide in a ${metrics.innerWidth}px window; widest elements: ${metrics.wide.join(' | ')}`,
        ).toBeLessThanOrEqual(metrics.innerWidth);
      });
    }
  }

  test('gate diagram labels are at least 11 px tall at the default scale on desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/verify?rpc=http://127.0.0.1:8545');
    await page.waitForSelector('.circuit-svg .node-text', { timeout: 15000 });

    const rendered = await page.evaluate(() => {
      const text = document.querySelector('.circuit-svg .node-text') as SVGTextElement | null;
      if (!text || !text.ownerSVGElement) return null;
      const ctm = text.ownerSVGElement.getScreenCTM();
      if (!ctm) return null;
      return parseFloat(getComputedStyle(text).fontSize) * ctm.a;
    });

    expect(rendered, 'could not measure the diagram label size').not.toBeNull();
    expect(rendered as number).toBeGreaterThanOrEqual(11);
  });
});
