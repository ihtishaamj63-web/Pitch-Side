import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:5174/leagues/new');
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const shell = document.querySelector('.app-shell');
    const main = document.querySelector('.main-content');
    const title = document.querySelector('.page-title');
    return {
      bodyBg: body.backgroundImage + ' | ' + body.backgroundColor,
      shellBg: shell ? getComputedStyle(shell).background : null,
      mainBg: main ? getComputedStyle(main).background : null,
      titleColor: title ? getComputedStyle(title).color : null,
      titleText: title ? title.textContent : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: '/c/Projects/Pitchside/Pitch-Side/frontend/inspect.png', fullPage: true });
  await browser.close();
})();
