import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:5174/leagues/new');
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const title = document.querySelector('.page-title');
    // get all matching rules
    const sheets = [...document.styleSheets];
    let rules = [];
    for (const s of sheets) {
      try {
        for (const r of s.cssRules) {
          if (r.selectorText && r.selectorText.includes('page-title')) {
            rules.push({ selector: r.selectorText, color: r.style.color, cssText: r.cssText.slice(0,200) });
          }
        }
      } catch(e){}
    }
    return { rules, inlineStyle: title.getAttribute('style'), classList: [...title.classList] };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
