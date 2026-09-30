import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:5173/tempstaff', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

await page.click('button[title="Kanban view"]');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Desktop-members-dashboard/78a347fd-7731-42ac-8b01-6ae7b45d639c/scratchpad/tempstaff-kanban.png' });

console.log('errors:', JSON.stringify(errors));
await browser.close();
