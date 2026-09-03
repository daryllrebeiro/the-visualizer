import * as chromeLauncher from 'chrome-launcher';
const WebSocket = globalThis.WebSocket;

async function main() {
  console.log('🧪 Starting Live ErrorBoundary Headless Chrome Behavioral Audit...');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const targetsRes = await fetch(`http://127.0.0.1:${chrome.port}/json`);
    const targets = await targetsRes.json();
    const pageWsUrl = targets[0]?.webSocketDebuggerUrl;

    if (!pageWsUrl) {
      throw new Error('No Chrome DevTools WebSocket URL found');
    }

    const ws = new WebSocket(pageWsUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    let reqId = 1;
    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = reqId++;
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');

    console.log('🌐 Navigating to http://localhost:3005/database (with injected canvas throw)...');
    await sendCommand('Page.navigate', { url: 'http://localhost:3005/database' });

    // Wait for page to render and trigger client error boundary
    await new Promise((r) => setTimeout(r, 2500));

    const evalResult = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        hasAlertRole: !!document.querySelector('[role="alert"]'),
        alertText: document.querySelector('[role="alert"]')?.innerText || '',
        hasAppNav: !!document.querySelector('.canvas-panel') || !!document.querySelector('aside') || !!document.querySelector('select'),
        hasDomainSwitcher: !!document.querySelector('select'),
        fullBodySnippet: document.body.innerText.slice(0, 500)
      })`,
    });

    const parsed = JSON.parse(evalResult.result.value);
    console.log('\n--- Live Headless Browser Inspection Results ---');
    console.log(`Alert Role Present: ${parsed.hasAlertRole}`);
    console.log(`Alert Text Content:\n${parsed.alertText}`);
    console.log(`App Shell / Navigation Present: ${parsed.hasAppNav}`);
    console.log(`Domain Switcher Usable: ${parsed.hasDomainSwitcher}`);

    if (parsed.hasAlertRole) {
      console.log('ℹ️ Alert role detected (injected crash phase)');
    } else {
      console.log('✅ Route renders normally with no ErrorBoundary alert (clean phase)');
    }

    ws.close();
  } finally {
    try {
      await chrome.kill();
    } catch {
      // Ignore Windows temp directory unlock race
    }
  }
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
