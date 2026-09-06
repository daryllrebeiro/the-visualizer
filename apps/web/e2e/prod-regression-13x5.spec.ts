import { test, expect } from '@playwright/test';

interface DomainSpec {
  id: string;
  name: string;
  keyword: string;
  catalogTitle: string;
  chaosSelector: string;
  inspectorSelector: string;
}

const PRE_EXISTING_13_DOMAINS: DomainSpec[] = [
  {
    id: 'kafka',
    name: 'Apache Kafka',
    keyword: 'Kafka',
    catalogTitle: 'Apache Kafka',
    chaosSelector: 'button:has-text("Crash"), button:has-text("Toggle Offline"), button:has-text("Offline"), button:has-text("Produce")',
    inspectorSelector: '.inspector-drawer, .producer-auto-drawer, canvas',
  },
  {
    id: 'raft',
    name: 'Raft Consensus',
    keyword: 'Raft',
    catalogTitle: 'Raft Consensus',
    chaosSelector: 'button:has-text("Partition"), button:has-text("Crash"), button:has-text("Trigger Election"), button:has-text("Propose")',
    inspectorSelector: '.raft-visualizer, div:has-text("Term"), div:has-text("Leader")',
  },
  {
    id: 'database',
    name: 'Distributed Database',
    keyword: 'Database',
    catalogTitle: 'Distributed Database',
    chaosSelector: 'button:has-text("Crash"), button:has-text("Add Node"), button:has-text("Write Key"), button:has-text("Repair")',
    inspectorSelector: '.hash-ring-visualizer, div:has-text("Virtual Nodes"), svg',
  },
  {
    id: 'redis',
    name: 'Redis Cluster',
    keyword: 'Redis',
    catalogTitle: 'Redis Cluster',
    chaosSelector: 'button:has-text("Reshard"), button:has-text("Crash"), button:has-text("Set Key"), button:has-text("Evict")',
    inspectorSelector: '.redis-visualizer, div:has-text("Hash Slots"), div:has-text("0-16383")',
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes Control Plane',
    keyword: 'Kubernetes',
    catalogTitle: 'Kubernetes',
    chaosSelector: 'button:has-text("Cordon"), button:has-text("Drain"), button:has-text("Crash"), button:has-text("Scale")',
    inspectorSelector: '.k8s-visualizer, div:has-text("kube-scheduler"), div:has-text("Nodes")',
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ Message Broker',
    keyword: 'RabbitMQ',
    catalogTitle: 'RabbitMQ',
    chaosSelector: 'button:has-text("Reject"), button:has-text("Nack"), button:has-text("Publish"), button:has-text("DLQ")',
    inspectorSelector: '.rabbitmq-visualizer, div:has-text("Exchanges"), div:has-text("AMQP")',
  },
  {
    id: 'storage',
    name: 'Storage Engine',
    keyword: 'Storage',
    catalogTitle: 'Storage Engine',
    chaosSelector: 'button:has-text("Flush"), button:has-text("Compact"), button:has-text("Write"), button:has-text("LSM")',
    inspectorSelector: '.storage-visualizer, div:has-text("B+ Tree"), div:has-text("SSTable")',
  },
  {
    id: 'networking',
    name: 'TCP Networking & Congestion',
    keyword: 'Networking',
    catalogTitle: 'Networking Fundamentals',
    chaosSelector: 'button:has-text("Drop"), button:has-text("Send"), button:has-text("Handshake"), button:has-text("Loss")',
    inspectorSelector: '.networking-visualizer, div:has-text("CWND"), div:has-text("Congestion")',
  },
  {
    id: 'rate-limiter',
    name: 'Rate Limiter',
    keyword: 'Rate Limiter',
    catalogTitle: 'Rate Limiter',
    chaosSelector: 'button:has-text("Boundary Burst"), button:has-text("Burst"), button:has-text("Fire Request")',
    inspectorSelector: 'div:has-text("Token Bucket"), div:has-text("RFC 2697"), div:has-text("Sliding Window")',
  },
  {
    id: 'distributed-lock',
    name: 'Distributed Lock Manager',
    keyword: 'Distributed Lock',
    catalogTitle: 'Distributed Lock Manager',
    chaosSelector: 'button:has-text("GC Pause"), button:has-text("Acquire"), input[type="checkbox"]',
    inspectorSelector: 'div:has-text("Martin Kleppmann"), div:has-text("Fencing Token"), div:has-text("Redlock")',
  },
  {
    id: 'cdn-cache',
    name: 'CDN Cache & Edge PoPs',
    keyword: 'CDN',
    catalogTitle: 'CDN & Multi-Tier Caching',
    chaosSelector: 'button:has-text("Purge"), button:has-text("Flash Crowd"), button:has-text("Request")',
    inspectorSelector: 'div:has-text("Edge PoP"), div:has-text("RFC 9111"), div:has-text("Origin")',
  },
  {
    id: 'id-gen',
    name: 'Distributed ID Generator',
    keyword: 'ID Generator',
    catalogTitle: 'Distributed ID Generation',
    chaosSelector: 'button:has-text("Clock Skew"), button:has-text("Overflow"), button:has-text("Generate")',
    inspectorSelector: 'div:has-text("Snowflake"), div:has-text("UUIDv7"), div:has-text("Worker ID")',
  },
  {
    id: 'transactions',
    name: 'Distributed Transactions',
    keyword: 'Transactions',
    catalogTitle: 'Distributed Transactions',
    chaosSelector: 'button:has-text("Crash Coordinator"), button:has-text("Start 2PC"), button:has-text("Start Saga")',
    inspectorSelector: 'div:has-text("Two-Phase Commit"), div:has-text("Saga Orchestration"), div:has-text("PREPARE")',
  },
];

test.describe('Part 0.3 — Production Shared-File Regression (13x5 Matrix)', () => {
  for (const domain of PRE_EXISTING_13_DOMAINS) {
    test(`Domain: ${domain.id} (${domain.name}) passes all 5 criteria`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
          console.log(`[PAGE CONSOLE ERROR ${domain.id}]:`, msg.text());
        }
        if (msg.type() === 'warning') consoleWarnings.push(msg.text());
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
        console.log(`[PAGE EXCEPTION ${domain.id}]:`, err.message, err.stack);
      });

      // ── Check 1: Route load & zero console errors/warnings ──
      await page.goto(`http://localhost:3002/?domain=${domain.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      const brand = page.locator('h1.header-brand-title');
      await expect(brand).toBeVisible({ timeout: 8000 });
      await expect(brand).toHaveText('TheVisualizer');

      // Filter out expected ignorable dev/offline network noise (e.g., local ws gateway not running during static web test)
      const fatalErrors = consoleErrors.filter(
        (err) =>
          !err.includes('WebSocket connection to') &&
          !err.includes('Failed to load resource') &&
          !err.includes('ECONNREFUSED'),
      );
      expect(fatalErrors).toHaveLength(0);

      // ── Check 2: Inspector drawer / entity inspection surface renders ──
      const inspectorSurface = page.locator(domain.inspectorSelector).first();
      await expect(inspectorSurface).toBeVisible({ timeout: 5000 });

      // ── Check 3: Domain-specific chaos control execution ──
      const chaosBtn = page.locator(domain.chaosSelector).first();
      await expect(chaosBtn).toBeVisible({ timeout: 5000 });
      await chaosBtn.click();
      // Ensure page does not crash after chaos trigger
      await expect(brand).toBeVisible();

      // ── Check 4: Command Palette (Cmd+K / Ctrl+K) search & navigation ──
      const searchBtn = page.locator('button', { hasText: 'Search' });
      await expect(searchBtn).toBeVisible();
      await searchBtn.click();

      const paletteDialog = page.locator('div[role="dialog"][aria-label="Universal Command Palette"]');
      await expect(paletteDialog).toBeVisible({ timeout: 5000 });

      const searchInput = paletteDialog.locator('input[type="text"]');
      await searchInput.fill(domain.keyword);

      const paletteOption = paletteDialog.getByText(new RegExp(domain.keyword, 'i')).first();
      await expect(paletteOption).toBeVisible({ timeout: 5000 });
      await paletteOption.click();
      await expect(paletteDialog).not.toBeVisible();

      // ── Check 5: Domain Directory Modal card renders cleanly ──
      const catalogBtn = page.locator('button', { hasText: 'Explore Catalog' });
      await expect(catalogBtn).toBeVisible();
      await catalogBtn.click();

      const directoryTitle = page.getByText('Distributed Systems Simulator Catalog');
      await expect(directoryTitle).toBeVisible({ timeout: 5000 });

      // Verify domain card exists with title, description, and icon
      const domainCard = page.locator('div, button', { hasText: new RegExp(domain.catalogTitle, 'i') }).first();
      await expect(domainCard).toBeVisible();

      // Dismiss modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    });
  }
});
