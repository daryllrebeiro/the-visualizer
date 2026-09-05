import { test, expect } from '@playwright/test';

const ALL_18_DOMAINS = [
  { id: 'kafka', name: 'Apache Kafka' },
  { id: 'raft', name: 'Raft Consensus' },
  { id: 'database', name: 'Distributed DB' },
  { id: 'redis', name: 'Redis Cluster' },
  { id: 'kubernetes', name: 'Kubernetes' },
  { id: 'rabbitmq', name: 'RabbitMQ' },
  { id: 'storage', name: 'Storage Engine' },
  { id: 'networking', name: 'TCP Networking' },
  { id: 'rate-limiter', name: 'Rate Limiter' },
  { id: 'distributed-lock', name: 'Distributed Lock' },
  { id: 'cdn-cache', name: 'CDN Cache' },
  { id: 'id-gen', name: 'ID Generation' },
  { id: 'transactions', name: 'Distributed Txns' },
  { id: 'rag', name: 'Modular RAG' },
  { id: 'agents', name: 'Agent Swarm' },
  { id: 'llm-serving', name: 'LLM Serving' },
  { id: 'vectordb', name: 'Vector Database' },
  { id: 'gpu-cluster', name: 'GPU Cluster' },
] as const;

test.describe('All 18 Canonical Domains Browser Quality Gates', () => {
  for (const domain of ALL_18_DOMAINS) {
    test(`renders ${domain.name} (${domain.id}) cleanly with zero runtime exceptions`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      // Navigate with domain query param to hydrate initial domain
      await page.goto(`/?domain=${domain.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      // Brand Title must always be present
      const brand = page.locator('h1.header-brand-title');
      await expect(brand).toBeVisible({ timeout: 10000 });
      await expect(brand).toHaveText('TheVisualizer');

      // The active domain selector button in header must reflect the selected domain name
      const domainButton = page.locator('header.app-header').getByRole('button', { name: new RegExp(domain.name, 'i') });
      await expect(domainButton).toBeVisible();

      // Main application shell should be rendered
      const appShell = page.locator('.app-shell');
      await expect(appShell).toBeVisible();

      // Ensure no invariant violation halt banner is triggered on fresh mount
      const haltBanner = page.locator('.halt-banner');
      await expect(haltBanner).not.toBeVisible();

      // Verify no unhandled fatal exceptions were logged
      const fatalErrors = consoleErrors.filter(
        (err) =>
          !err.includes('Failed to load resource') &&
          !err.includes('WebSocket connection to') &&
          !err.includes('ECONNREFUSED'),
      );
      expect(fatalErrors).toHaveLength(0);
    });
  }
});
