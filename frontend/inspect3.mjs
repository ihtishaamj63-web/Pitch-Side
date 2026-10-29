import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:5174/leagues/new');
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const title = document.querySelector('.page-title');
    const matched = [];
    for (const s of document.styleSheets) {
      try {
        for (const r of s.cssRules) {
          if (r.selectorText && title.matches(r.selectorText.split(',')[0].trim()) === false) {
            // check any comma part
            const parts = r.selectorText.split(',');
            if (!parts.some(p => { try { return title.matches(p.trim()); } catch { return false; } })) continue;
          }
          if (r.style && r.style.color) {
            matched.push({ selector: r.selectorText, color: r.style.color, important: r.style.getPropertyPriority('color'), media: r.parentRule && r.parentRule.media ? r.parentRule.media.mediaText : null });
          }
        }
      } catch(e){}
    }
    return { matched, computed: getComputedStyle(title).color };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
