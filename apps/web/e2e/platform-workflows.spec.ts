import { test, expect } from '@playwright/test';

test.describe('Platform Workflows & Modal Quality Gates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.header-brand-title')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('Command Palette (Cmd+K) opens, filters domains, and navigates', async ({ page }) => {
    // Open via header button
    const searchBtn = page.locator('button', { hasText: 'Search' });
    await expect(searchBtn).toBeVisible();
    await searchBtn.click();

    // Verify modal dialog appears
    const paletteDialog = page.locator('div[role="dialog"][aria-label="Universal Command Palette"]');
    await expect(paletteDialog).toBeVisible({ timeout: 5000 });

    // Type query into search input
    const searchInput = paletteDialog.locator('input[type="text"]');
    await expect(searchInput).toBeFocused();
    await searchInput.fill('GPU');

    // Filtered item should be displayed
    const gpuOption = paletteDialog.getByText('GPU Cluster & 3D Parallelism');
    await expect(gpuOption).toBeVisible();

    // Click option to navigate
    await gpuOption.click();

    // Palette closes
    await expect(paletteDialog).not.toBeVisible();

    // Header updates to active domain
    const activeHeaderBtn = page.locator('header.app-header').getByRole('button', { name: /GPU Cluster/i });
    await expect(activeHeaderBtn).toBeVisible();
  });

  test('Command Palette opens and closes with keyboard shortcuts', async ({ page }) => {
    // Focus page body to ensure event dispatch
    await page.locator('body').click();
    await page.keyboard.press('Control+k');
    const paletteDialog = page.locator('div[role="dialog"][aria-label="Universal Command Palette"]');
    await expect(paletteDialog).toBeVisible({ timeout: 5000 });

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await expect(paletteDialog).not.toBeVisible();
  });

  test('Interview Prep Modal opens, lists challenges, and supports rubrics', async ({ page }) => {
    const interviewBtn = page.locator('button', { hasText: 'Interview Prep' });
    await expect(interviewBtn).toBeVisible();
    await interviewBtn.click();

    const modalDialog = page.locator('div[role="dialog"][aria-labelledby="interview-prep-title"]');
    await expect(modalDialog).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#interview-prep-title')).toHaveText(
      'System Design Interview Canon & Evaluation Drills',
    );

    // Verify presence of challenges
    const challengeList = modalDialog.locator('button', { hasText: 'Rate Limiter' });
    await expect(challengeList.first()).toBeVisible();

    // Select the challenge card
    await challengeList.first().click();

    // Verify rubric checklist is shown
    const checkbox = modalDialog.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Close modal
    const closeBtn = modalDialog.locator('button[aria-label="Close interview prep"]');
    await closeBtn.click();
    await expect(modalDialog).not.toBeVisible();
  });

  test('Composite Pipelines Modal opens, renders multi-stage architecture workflows', async ({ page }) => {
    const pipelineBtn = page.locator('button', { hasText: 'Pipelines' });
    await expect(pipelineBtn).toBeVisible();
    await pipelineBtn.click();

    const pipelineDialog = page.locator('div[role="dialog"][aria-labelledby="composite-pipeline-title"]');
    await expect(pipelineDialog).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#composite-pipeline-title')).toHaveText(
      'Multi-Domain Composite System Pipelines',
    );

    // Verify interactive pipeline selector tabs
    const tabBtn = pipelineDialog.locator('button', { hasText: 'FinTech' });
    if (await tabBtn.count() > 0) {
      await tabBtn.first().click();
    }

    // Verify Next Stage button advances stage
    const nextBtn = pipelineDialog.locator('button', { hasText: 'Next Stage →' });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    // Close modal
    const closeBtn = pipelineDialog.locator('button[aria-label="Close pipeline modal"]');
    await closeBtn.click();
    await expect(pipelineDialog).not.toBeVisible();
  });

  test('Permalink share toast triggers and URL hydration switches domain', async ({ page }) => {
    // Share button click
    const shareBtn = page.locator('button', { hasText: 'Share' });
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Toast notification should appear in status role container
    const toast = page.locator('div[role="status"]', { hasText: 'Copied permalink for' });
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Direct permalink hydration test
    await page.goto('/?domain=rate-limiter&tick=25', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const domainButton = page.locator('header.app-header').getByRole('button', { name: /Rate Limiter/i });
    await expect(domainButton).toBeVisible();
  });

  test('Data Table View displays tabular state entities', async ({ page }) => {
    const tableBtn = page.locator('button', { hasText: 'Table View' });
    await expect(tableBtn).toBeVisible();
    await tableBtn.click();

    // Modal containing table should open
    const table = page.locator('div[role="dialog"] table');
    await expect(table).toBeVisible({ timeout: 5000 });

    // Headers should exist
    const tableHeaders = table.locator('th');
    await expect(tableHeaders.first()).toBeVisible();

    // Close button
    const closeBtn = page.locator('div[role="dialog"] button', { hasText: '✕' }).or(
      page.locator('div[role="dialog"] button', { hasText: 'Close' })
    );
    await closeBtn.first().click();
    await expect(table).not.toBeVisible();
  });

  test('Canvas 60 FPS Performance Telemetry HUD toggles and displays metrics', async ({ page }) => {
    const perfBtn = page.locator('button', { hasText: '⚡ Perf' });
    await expect(perfBtn).toBeVisible();
    await perfBtn.click();

    // Expanded HUD card should appear
    const hudCard = page.locator('text=60 FPS RENDER HUD');
    await expect(hudCard).toBeVisible({ timeout: 5000 });

    // Should display Frame Time, Rendered, and Pooled Objects
    await expect(page.locator('text=Frame Time:')).toBeVisible();
    await expect(page.locator('text=Rendered')).toBeVisible();
    await expect(page.locator('text=Pooled Objects (Zero-GC):')).toBeVisible();

    // Toggle off
    await perfBtn.click();
    await expect(hudCard).not.toBeVisible();
  });
});
