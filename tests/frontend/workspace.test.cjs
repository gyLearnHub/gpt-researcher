// Run against the app: NODE_PATH=<playwright packages> node --test tests/frontend/workspace.test.cjs
// Research responses are deterministic test fixtures; no LLM/search calls are made.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const baseURL = process.env.GPTR_UI_BASE_URL || 'http://127.0.0.1:8000';
const markdown = '# 人工智能对医学影像的影响\n\n这是一份自动化测试报告，用于验证界面。\n\n## 临床应用\n\n保留报告正文和[来源](https://example.org/source)。\n\n| 项目 | 说明 |\n| --- | --- |\n| 识别 | 辅助分析 |\n';
const links = { pdf: 'outputs/ui-test.pdf', docx: 'outputs/ui-test.docx', md: 'outputs/ui-test.md' };
let browser;
before(async () => {
  await fs.mkdir('outputs', { recursive: true });
  await Promise.all(Object.entries(links).map(([extension, filename]) => fs.writeFile(filename, extension === 'md' ? markdown : `UI ${extension} download fixture`)));
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
});
after(async () => { await browser?.close(); });

async function pageFor(t, history = []) {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  t.after(() => context.close());
  if (history.length) await context.addCookies([{ name: 'conversationHistory', value: encodeURIComponent(JSON.stringify(history)), url: baseURL }]);
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.testMessages = [];
  await page.routeWebSocket('**/ws', (ws) => {
    page.testChannel = ws;
    ws.onMessage((message) => {
      page.testMessages.push(message);
      page.testOnMessage?.(ws, message);
    });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.goto(baseURL);
  await page.waitForFunction(() => typeof WorkspaceUI !== 'undefined');
  return page;
}

async function start(page, options = {}) {
  const sent = page.testMessages;
  page.testOnMessage = (ws, message) => {
      if (message.startsWith('chat ')) {
        ws.send(JSON.stringify({ type: 'chat', content: '这是针对当前报告的回答。' }));
      } else if (!options.hold) {
        ws.send(JSON.stringify({ type: 'logs', content: 'search', output: '正在检索测试资料' }));
        // Deliberately split Markdown within a table to catch incremental parsing bugs.
        const split = markdown.indexOf('| ---');
        ws.send(JSON.stringify({ type: 'report', output: markdown.slice(0, split) }));
        ws.send(JSON.stringify({ type: 'report', output: markdown.slice(split) }));
        ws.send(JSON.stringify({ type: 'path', output: options.links || links }));
      }
  };
  await page.locator('#task').fill('人工智能对医学影像的影响');
  await page.locator('#submitButton').click();
  if (!options.hold) await page.waitForFunction(() => document.getElementById('workspace').dataset.state === 'finished');
  else await page.waitForFunction(() => document.getElementById('submitButton').disabled);
  return { sent, get channel() { return page.testChannel; } };
}

test('home is light, compact, uses local assets and has no fake history', async (t) => {
  const page = await pageFor(t);
  assert.equal(await page.locator('#welcome').isVisible(), true);
  assert.equal(await page.locator('#reportPanel').isVisible(), false);
  assert.equal(await page.locator('#researchSettings').isVisible(), false);
  assert.equal(await page.locator('.history-entry').count(), 0);
  const welcome = await page.locator('#welcome').boundingBox();
  const composer = await page.locator('#researchForm').boundingBox();
  assert.ok(welcome.y + welcome.height <= composer.y, 'welcome and composer do not overlap');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const dock = await page.locator('.composer-dock').boundingBox();
    const input = await page.locator('#researchForm').boundingBox();
    assert.ok(Math.abs(dock.y + dock.height - viewport.height) <= 1, 'composer dock stays at the viewport bottom');
    assert.ok(viewport.height - input.y - input.height <= 50, 'input stays above the bottom note');
    assert.ok(input.y >= 0, 'input remains fully visible');
  }
  await page.setViewportSize({ width: 1680, height: 1000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].every((el) => new URL(el.src || el.href).origin === location.origin)), true);
  await fs.mkdir(path.join('outputs', 'ui-test'), { recursive: true });
  await page.screenshot({ path: 'outputs/ui-test/home.png' });
});

test('settings open, preserve values, dismiss with Escape and outside click', async (t) => {
  const page = await pageFor(t);
  await page.locator('#researchSettingsBtn').click();
  assert.equal(await page.locator('#researchSettings').isVisible(), true);
  await page.locator('#report_type').selectOption('detailed_report');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#researchSettings').isVisible(), false);
  await page.locator('#researchSettingsBtn').click();
  assert.equal(await page.locator('#report_type').inputValue(), 'detailed_report');
  await page.locator('#conversationTitle').click();
  assert.equal(await page.locator('#researchSettings').isVisible(), false);
});

test('invalid hidden settings become visible for correction', async (t) => {
  const page = await pageFor(t);
  await page.locator('#task').fill('有效研究主题');
  await page.locator('#researchSettingsBtn').click();
  await page.locator('#maxSearchResults').fill('30');
  await page.keyboard.press('Escape');
  await page.locator('#submitButton').click();
  assert.equal(await page.locator('#researchSettings').isVisible(), true);
  assert.equal(await page.locator('#workspace').getAttribute('data-state'), 'initial');
});

test('sidebar collapses and restores', async (t) => {
  const page = await pageFor(t);
  await page.locator('#historyPanelToggle').click();
  assert.equal(await page.locator('#historyPanel').isVisible(), false);
  await page.locator('#historyPanelOpenBtn').click();
  assert.equal(await page.locator('#historyPanel').isVisible(), true);
});

test('MCP settings and help remain available inside the settings popover', async (t) => {
  const page = await pageFor(t);
  await page.locator('#researchSettingsBtn').click();
  await page.locator('#mcpEnabled').check();
  assert.equal(await page.locator('#mcpConfigSection').isVisible(), true);
  await page.locator('#mcpInfoBtn').click();
  assert.equal(await page.locator('#mcpInfoModal').isVisible(), true);
  await page.locator('.mcp-info-close').click();
  assert.equal(await page.locator('#mcpInfoModal').isVisible(), false);
});

test('delete history asks for confirmation and persists deletion', async (t) => {
  const page = await pageFor(t, [{ prompt: '可删除的测试记录', links, timestamp: '2026-09-28T10:00:00Z' }]);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('.delete-entry').click();
  assert.equal(await page.locator('.history-entry').count(), 1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.delete-entry').click();
  await page.reload();
  assert.equal(await page.locator('.history-entry').count(), 0);
});

test('streamed report becomes a compact card and details stay collapsed', async (t) => {
  const page = await pageFor(t);
  const run = await start(page);
  assert.equal(run.sent.filter((m) => m.startsWith('start ')).length, 1);
  assert.equal(await page.locator('#reportCard').isVisible(), true);
  assert.equal(await page.locator('#reportPanel').isVisible(), false);
  assert.equal(await page.locator('#researchProgress').getAttribute('open'), null);
  await page.locator('#researchProgress summary').click();
  assert.match(await page.locator('#output').innerText(), /检索测试资料/);
  await page.locator('#reportCard').click();
  assert.equal(await page.locator('#reportPanel').isVisible(), true);
  assert.equal(await page.locator('#reportContainer table').count(), 1);
  assert.equal(await page.locator('#reportContainer h1').innerText(), '人工智能对医学影像的影响');
});

test('reader resizes with mouse and keyboard, preserves readable central column', async (t) => {
  const page = await pageFor(t);
  await start(page);
  await page.locator('#reportCard').click();
  const before = await page.locator('#reportPanel').boundingBox();
  const handle = await page.locator('#reportResizeHandle span').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 100, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator('#reportPanel').boundingBox();
  assert.ok(after.width > before.width + 80);
  await page.locator('#reportResizeHandle').focus();
  await page.keyboard.press('End');
  assert.ok((await page.locator('.conversation-main').boundingBox()).width >= 380);
  await page.keyboard.press('Home');
  assert.equal((await page.locator('#reportPanel').boundingBox()).width, 360);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#reportPanel').isVisible(), false);
});

test('download menu offers exactly Word, PDF, Markdown and triggers downloads', async (t) => {
  const page = await pageFor(t);
  await start(page);
  await page.locator('#reportCard').click();
  for (const [id, ext] of [['downloadLinkWordTop', 'docx'], ['downloadLinkTop', 'pdf'], ['downloadLinkMdTop', 'md']]) {
    await page.locator('#downloadMenuBtn').click();
    assert.equal(await page.locator('#downloadMenu a').count(), 3);
    const downloadPromise = page.waitForEvent('download');
    await page.locator(`#${id}`).click();
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith(`.${ext}`));
    assert.equal(await download.failure(), null);
    assert.equal(await page.locator('#downloadMenu').isVisible(), false);
  }
});

test('unavailable downloads stay disabled and cannot reuse an earlier report URL', async (t) => {
  const page = await pageFor(t);
  await start(page, { links: { md: links.md } });
  await page.locator('#reportCard').click();
  await page.locator('#downloadMenuBtn').click();
  assert.equal(await page.locator('#downloadLinkTop').getAttribute('href'), null);
  assert.equal(await page.locator('#downloadLinkTop').getAttribute('aria-disabled'), 'true');
  assert.equal(await page.locator('#downloadHint').isVisible(), true);
  await page.locator('#closeReportBtn').click();
  await page.locator('#newResearchBtn').click();
  assert.equal(await page.locator('#downloadLinkMdTop').getAttribute('href'), null);
});

test('copy returns original Markdown', async (t) => {
  const page = await pageFor(t);
  await start(page);
  await page.locator('#reportCard').click();
  await page.locator('#copyToClipboardTop').click();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), markdown);
});

test('existing report chat sends each message once after multiple research runs', async (t) => {
  const page = await pageFor(t);
  const run = await start(page);
  await page.locator('#chatInput').fill('解释主要结论');
  await page.locator('#sendChatBtn').click();
  await page.getByText('这是针对当前报告的回答。', { exact: false }).first().waitFor();
  await page.locator('#newResearchBtn').click();
  await page.locator('#task').fill('第二次研究');
  await page.locator('#submitButton').click();
  await page.waitForFunction(() => document.getElementById('workspace').dataset.state === 'finished');
  await page.locator('#chatInput').fill('第二次追问');
  await page.locator('#sendChatBtn').click();
  await page.getByText('这是针对当前报告的回答。', { exact: false }).first().waitFor();
  assert.equal(run.sent.filter((m) => m.startsWith('chat ')).length, 2);
  assert.equal(run.sent.filter((m) => m.startsWith('start ')).length, 2);
});

test('history loads existing Markdown, searches and renames without replacing the prompt', async (t) => {
  const page = await pageFor(t, [{ prompt: '历史研究主题', links, timestamp: '2026-09-28T10:00:00Z' }]);
  await page.locator('.history-entry').click();
  await page.waitForFunction(() => document.getElementById('workspace').dataset.state === 'history');
  await page.locator('#reportCard').click();
  assert.match(await page.locator('#reportContainer').innerText(), /自动化测试报告/);
  await page.locator('#closeReportBtn').click();
  page.once('dialog', (dialog) => dialog.accept('已重命名的报告'));
  await page.locator('.rename-entry').click();
  assert.equal(await page.locator('.history-entry-title').innerText(), '已重命名的报告');
  await page.locator('#historySearch').fill('不存在的词');
  assert.equal(await page.locator('.history-entry').isVisible(), false);
  await page.locator('#historySearch').fill('已重命名');
  assert.equal(await page.locator('.history-entry').isVisible(), true);
  await page.reload();
  assert.equal(await page.locator('.history-entry-title').innerText(), '已重命名的报告');
});

test('missing history report shows an error and allows a new research', async (t) => {
  const page = await pageFor(t, [{ prompt: '文件已移除', links: { md: '/outputs/no-such-ui-test.md' }, timestamp: '2026-09-28T10:00:00Z' }]);
  await page.locator('.history-entry').click();
  await page.waitForFunction(() => document.getElementById('workspace').dataset.state === 'error');
  assert.match(await page.locator('#output').innerText(), /无法读取/);
  await page.locator('#newResearchBtn').click();
  assert.equal(await page.locator('#welcome').isVisible(), true);
});

test('history switching race cannot replace the most recently selected report', async (t) => {
  const page = await pageFor(t, [
    { prompt: '慢报告', links: { md: '/outputs/slow-ui.md' }, timestamp: '2026-09-28T10:00:00Z' },
    { prompt: '快报告', links, timestamp: '2026-09-28T09:00:00Z' },
  ]);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route('**/outputs/slow-ui.md', async (route) => { await pending; await route.fulfill({ body: '# 过期报告' }); });
  await page.locator('.history-entry').first().click();
  await page.locator('.history-entry').nth(1).click();
  await page.waitForFunction(() => document.getElementById('workspace').dataset.state === 'history');
  release();
  await page.locator('#reportCard').click();
  assert.equal(await page.locator('#conversationTitle').innerText(), '快报告');
  assert.match(await page.locator('#reportContainer').innerText(), /自动化测试报告/);
});

test('untrusted history titles and report/chat content cannot execute scripts', async (t) => {
  const attack = '<img src=x onerror="window.uiXss=true">';
  const page = await pageFor(t, [{ prompt: attack, links, timestamp: '2026-09-28T10:00:00Z' }]);
  assert.equal(await page.locator('.history-entry img').count(), 0);
  await page.evaluate((value) => {
    WorkspaceUI.setReport(value);
    GPTResearcher.addChatMessage(value);
  }, attack);
  assert.equal(await page.locator('#reportContainer [onerror], #chatMessages [onerror]').count(), 0);
  assert.equal(await page.evaluate(() => window.uiXss), undefined);
});

test('active research prevents duplicate submissions and accidental history switching', async (t) => {
  const page = await pageFor(t, [{ prompt: '历史研究', links, timestamp: '2026-09-28T10:00:00Z' }]);
  const run = await start(page, { hold: true });
  await page.locator('#newResearchBtn').click();
  await page.locator('.history-entry').click();
  assert.equal(await page.locator('#workspace').getAttribute('data-state'), 'in_progress');
  assert.equal(run.sent.length, 1);
});

test('server error unlocks composer and shows the failure details', async (t) => {
  const page = await pageFor(t);
  const run = await start(page, { hold: true });
  await page.waitForFunction(() => document.getElementById('connectionStatus').textContent !== '未连接');
  run.channel.send(JSON.stringify({ type: 'logs', content: 'error', output: 'Error: 测试服务错误' }));
  await page.waitForFunction(() => document.getElementById('workspace').dataset.state === 'error');
  assert.equal(await page.locator('#submitButton').isEnabled(), true);
  assert.equal(await page.locator('#task').isEnabled(), true);
  assert.match(await page.locator('#output').innerText(), /测试服务错误/);
});

test('desktop layouts fit 1280, 1440 and 1920 widths and capture reader', async (t) => {
  const page = await pageFor(t);
  await start(page);
  await page.locator('#reportCard').click();
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.conversation-main').getBoundingClientRect().width >= 380);
    assert.ok((await page.locator('.conversation-main').boundingBox()).width >= 380);
    assert.ok((await page.locator('.reader-content').boundingBox()).width >= 360);
  }
  await page.locator('#downloadMenuBtn').click();
  await page.screenshot({ path: 'outputs/ui-test/reader.png' });
});
