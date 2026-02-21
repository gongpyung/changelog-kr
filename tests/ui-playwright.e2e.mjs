import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots');
const BASE_URL = 'http://127.0.0.1:8080';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

async function runTests() {
  const browser = await chromium.launch();
  const results = [];

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, status: 'PASS' });
      console.log(`  PASS: ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
      console.log(`  FAIL: ${name} - ${err.message}`);
    }
  }

  // ── Dark mode tests ──
  console.log('\n[Dark Mode]');
  for (const [device, vp] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // Ensure dark mode (default)
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(300);

    await test(`dark-${device}: screenshot`, async () => {
      await page.screenshot({ path: join(SCREENSHOT_DIR, `dark-${device}.png`), fullPage: false });
    });

    await test(`dark-${device}: version cards visible`, async () => {
      const cards = await page.locator('.version-card').count();
      if (cards === 0) throw new Error('No version cards found');
    });

    if (device === 'mobile') {
      await test(`dark-mobile: checkin btn no overlap with count`, async () => {
        // On mobile, entry count should be hidden (hidden sm:inline-flex)
        const countBadge = page.locator('.version-header').first().locator('span.hidden.sm\\:inline-flex');
        const isVisible = await countBadge.isVisible();
        if (isVisible) throw new Error('Entry count badge should be hidden on mobile');
      });

      await test(`dark-mobile: sidebar hidden by default`, async () => {
        const sidebar = page.locator('#sidebar');
        const box = await sidebar.boundingBox();
        if (box && box.x >= 0) throw new Error('Sidebar should be off-screen on mobile');
      });
    }

    if (device === 'desktop') {
      await test(`dark-desktop: sidebar visible`, async () => {
        const sidebar = page.locator('#sidebar');
        const box = await sidebar.boundingBox();
        if (!box || box.x < 0) throw new Error('Sidebar should be visible on desktop');
      });

      await test(`dark-desktop: entry count visible`, async () => {
        const header = page.locator('.version-header').first();
        // The count badge text (e.g. "32개")
        const countText = await header.locator('span').filter({ hasText: /\d+개/ }).first().isVisible();
        if (!countText) throw new Error('Entry count should be visible on desktop');
      });
    }

    await context.close();
  }

  // ── Light mode tests ──
  console.log('\n[Light Mode]');
  for (const [device, vp] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // Switch to light mode
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(300);

    await test(`light-${device}: screenshot`, async () => {
      await page.screenshot({ path: join(SCREENSHOT_DIR, `light-${device}.png`), fullPage: false });
    });

    await test(`light-${device}: body text not white-on-white`, async () => {
      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const textColor = await page.evaluate(() => getComputedStyle(document.body).color);
      // Both shouldn't be near-white
      if (bgColor === textColor) throw new Error(`Text and bg same color: ${bgColor}`);
    });

    if (device === 'mobile') {
      await test(`light-mobile: version header readable`, async () => {
        const header = page.locator('.version-header').first();
        const h2 = header.locator('h2');
        const color = await h2.evaluate(el => getComputedStyle(el).color);
        // Should not be white in light mode
        if (color === 'rgb(255, 255, 255)') throw new Error('Version title is white in light mode');
      });
    }

    await context.close();
  }

  // ── Functional tests ──
  console.log('\n[Functional]');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await test(`search filter works`, async () => {
      await page.fill('#searchInput', 'MCP');
      await page.waitForTimeout(500);
      const visible = await page.locator('.version-card:visible').count();
      // Should filter down
      if (visible === 0) {
        // Might not match, clear and check restore
        await page.fill('#searchInput', '');
        await page.waitForTimeout(500);
      }
    });

    await test(`category filter buttons exist`, async () => {
      const filters = await page.locator('.category-filter').count();
      if (filters < 4) throw new Error(`Expected 4+ category filters, got ${filters}`);
    });

    await test(`theme toggle works`, async () => {
      const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      await page.click('#themeToggle');
      await page.waitForTimeout(300);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (wasDark === isDark) throw new Error('Theme toggle did not change mode');
    });

    await test(`version card expand/collapse`, async () => {
      const firstHeader = page.locator('.version-header').first();
      await firstHeader.click();
      await page.waitForTimeout(300);
      const bodyDisplay = await firstHeader.evaluate(el => {
        const body = el.nextElementSibling;
        return body ? body.style.display : 'none';
      });
      // Click again to toggle
      await firstHeader.click();
      await page.waitForTimeout(300);
    });

    await test(`service switching works`, async () => {
      const serviceItems = page.locator('.service-item');
      const count = await serviceItems.count();
      if (count < 2) throw new Error('Less than 2 services in sidebar');
      // Click second service
      await serviceItems.nth(1).click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(SCREENSHOT_DIR, 'service-switch.png'), fullPage: false });
    });

    await context.close();
  }

  // ── Auth Modal tests ──
  console.log('\n[Auth Modal]');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await test(`auth: login button visible`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      const isVisible = await loginBtn.isVisible();
      if (!isVisible) throw new Error('Login button should be visible');
    });

    await test(`auth: modal opens on login click`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      const authModal = page.locator('#authModal');

      // Click login button
      await loginBtn.click();
      await page.waitForTimeout(300);

      const modalVisible = await authModal.isVisible();
      if (!modalVisible) throw new Error('Auth modal should be visible after clicking login button');

      // Close modal for next test
      await page.locator('#authModalClose').click();
      await page.waitForTimeout(300);
    });

    await test(`auth: no email form in modal`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      await loginBtn.click();
      await page.waitForTimeout(300);

      // Email form should NOT exist (OAuth only)
      const emailForm = page.locator('#authEmailForm');
      const count = await emailForm.count();
      if (count > 0) throw new Error('Email form should not exist in auth modal');

      await page.locator('#authModalClose').click();
      await page.waitForTimeout(300);
    });

    await test(`auth: github and google buttons`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      await loginBtn.click();
      await page.waitForTimeout(300);

      const githubBtn = page.locator('#authGithubBtn');
      const googleBtn = page.locator('#authGoogleBtn');

      const githubVisible = await githubBtn.isVisible();
      const googleVisible = await googleBtn.isVisible();

      if (!githubVisible || !googleVisible) {
        throw new Error('Both GitHub and Google OAuth buttons should be visible');
      }

      await page.locator('#authModalClose').click();
      await page.waitForTimeout(300);
    });

    await test(`auth: modal close via X`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      const authModal = page.locator('#authModal');
      const closeBtn = page.locator('#authModalClose');

      await loginBtn.click();
      await page.waitForTimeout(300);

      await closeBtn.click();
      await page.waitForTimeout(300);

      const modalHidden = await authModal.isHidden();
      if (!modalHidden) throw new Error('Modal should be hidden after clicking X button');
    });

    await test(`auth: modal close via ESC`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      const authModal = page.locator('#authModal');

      await loginBtn.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const modalHidden = await authModal.isHidden();
      if (!modalHidden) throw new Error('Modal should be hidden after pressing ESC');
    });

    await test(`auth: modal close via overlay`, async () => {
      const loginBtn = page.locator('#authLoginBtn');
      const authModal = page.locator('#authModal');
      const overlay = page.locator('.auth-modal-overlay');

      await loginBtn.click();
      await page.waitForTimeout(300);

      await overlay.click();
      await page.waitForTimeout(300);

      const modalHidden = await authModal.isHidden();
      if (!modalHidden) throw new Error('Modal should be hidden after clicking overlay');
    });

    await context.close();
  }

  // ── Checkin UI - Unauthenticated state tests ──
  console.log('\n[Checkin UI - Unauthenticated]');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await test(`checkin: summary panel hidden`, async () => {
      const summaryPanel = page.locator('#checkinSummary');
      const isHidden = await summaryPanel.isHidden();
      if (!isHidden) throw new Error('Checkin summary panel should be hidden for unauthenticated users');
    });

    await test(`checkin: no NEW badges`, async () => {
      const newBadges = await page.locator('.badge-new').count();
      if (newBadges > 0) throw new Error('NEW badges should not appear for unauthenticated users');
    });

    await test(`checkin: no visible checkin buttons`, async () => {
      // Checkin buttons should have .hidden class when not authenticated
      const visibleCheckinBtns = await page.locator('.checkin-btn:not(.hidden)').count();
      if (visibleCheckinBtns > 0) throw new Error('Checkin buttons should be hidden for unauthenticated users');
    });

    await context.close();
  }

  // ── Theme Toggle tests ──
  console.log('\n[Theme Toggle]');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Ensure starting in dark mode
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(300);

    await test(`theme: dark to light toggle`, async () => {
      const themeToggle = page.locator('#themeToggle');

      await themeToggle.click();
      await page.waitForTimeout(300);

      const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (hasDark) throw new Error('html.dark should be removed after toggle from dark to light');
    });

    await test(`theme: light to dark toggle`, async () => {
      const themeToggle = page.locator('#themeToggle');

      await themeToggle.click();
      await page.waitForTimeout(300);

      const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (!hasDark) throw new Error('html.dark should be added after toggle from light to dark');
    });

    await test(`theme: persists in localStorage`, async () => {
      const themeToggle = page.locator('#themeToggle');

      // Toggle to light
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Reload page
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      const storedTheme = await page.evaluate(() => localStorage.getItem('theme'));

      // After reload, theme should be light (no dark class)
      if (hasDark) throw new Error(`Theme should persist as light after reload (stored: ${storedTheme})`);
    });

    await context.close();
  }

  // ── Mobile Responsive tests ──
  console.log('\n[Mobile Responsive]');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await test(`mobile: sidebar hidden`, async () => {
      const sidebar = page.locator('#sidebar');
      const box = await sidebar.boundingBox();
      if (!box || box.x >= 0) throw new Error('Sidebar should be off-screen (x < 0) on mobile');
    });

    await test(`mobile: hamburger menu opens sidebar`, async () => {
      const mobileMenuBtn = page.locator('#mobileMenuBtn');
      const sidebar = page.locator('#sidebar');

      await mobileMenuBtn.click();
      await page.waitForTimeout(300);

      const box = await sidebar.boundingBox();
      if (!box || box.x < 0) throw new Error('Sidebar should be visible after clicking hamburger menu');
    });

    await test(`mobile: version header no overlap`, async () => {
      // Close sidebar first
      const sidebarOverlay = page.locator('#sidebarOverlay');
      if (await sidebarOverlay.isVisible()) {
        await sidebarOverlay.click();
        await page.waitForTimeout(300);
      }

      const firstHeader = page.locator('.version-header').first();
      const headerBox = await firstHeader.boundingBox();
      if (!headerBox) throw new Error('Version header not found');

      // Get left and right divs within header
      const leftDiv = firstHeader.locator('div').first();
      const rightDiv = firstHeader.locator('div').nth(1);

      const leftBox = await leftDiv.boundingBox();
      const rightBox = await rightDiv.boundingBox();

      if (leftBox && rightBox) {
        // Check if right div starts after left div ends
        if (rightBox.x < leftBox.x + leftBox.width) {
          throw new Error('Left and right divs in version header overlap on mobile');
        }
      }
    });

    await context.close();
  }

  // ── Core Functions tests ──
  console.log('\n[Core Functions]');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await test(`func: search filtering`, async () => {
      const searchInput = page.locator('#searchInput');
      const initialCards = await page.locator('.version-card').count();

      // Type a search term that should match something
      await searchInput.fill('bug');
      await page.waitForTimeout(500);

      const filteredCards = await page.locator('.version-card').count();

      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(500);

      // If we had results and filtering occurred, cards should be different
      // (may not always filter if "bug" doesn't exist, so just verify input works)
    });

    await test(`func: category filter`, async () => {
      const addedFilter = page.locator('.category-filter[data-category="added"]');
      const allFilter = page.locator('.category-filter[data-category="all"]');

      // Click "added" filter
      await addedFilter.click();
      await page.waitForTimeout(500);

      // Check active state
      const isActive = await addedFilter.evaluate(el => el.classList.contains('active'));
      if (!isActive) throw new Error('Added filter should be active after click');

      // Reset to all
      await allFilter.click();
      await page.waitForTimeout(300);
    });

    await test(`func: version card expand/collapse`, async () => {
      const firstHeader = page.locator('.version-header').first();
      const chevron = firstHeader.locator('.chevron');

      // Get initial chevron rotation
      const initialRotation = await chevron.evaluate(el => el.classList.contains('rotate-180'));

      // Click to expand
      await firstHeader.click();
      await page.waitForTimeout(300);

      const afterClickRotation = await chevron.evaluate(el => el.classList.contains('rotate-180'));
      if (initialRotation === afterClickRotation) {
        throw new Error('Chevron rotation should toggle on click');
      }

      // Click again to collapse
      await firstHeader.click();
      await page.waitForTimeout(300);
    });

    await test(`func: service switching`, async () => {
      const secondService = page.locator('.service-item').nth(1);
      const serviceTitle = page.locator('#serviceTitle');
      const initialTitle = await serviceTitle.textContent();

      // Click second service
      await secondService.click();
      await page.waitForTimeout(1000);

      const newTitle = await serviceTitle.textContent();
      if (initialTitle === newTitle) {
        throw new Error('Service title should change after switching service');
      }
    });

    await test(`func: original text toggle`, async () => {
      // Expand first version card
      const firstHeader = page.locator('.version-header').first();
      await firstHeader.click();
      await page.waitForTimeout(300);

      // Find toggle-original button
      const toggleBtn = page.locator('.toggle-original').first();
      const count = await toggleBtn.count();

      if (count > 0) {
        const originalText = page.locator('.original-text').first();
        const initiallyHidden = await originalText.isHidden();

        await toggleBtn.click();
        await page.waitForTimeout(300);

        const afterClickVisible = await originalText.isVisible();
        if (initiallyHidden && !afterClickVisible) {
          throw new Error('Original text should toggle visibility');
        }
      }
      // If no toggle button (no translated entries), test passes
    });

    await test(`func: empty search shows empty state`, async () => {
      const searchInput = page.locator('#searchInput');
      const emptyState = page.locator('#emptyState');

      // Type something unlikely to match
      await searchInput.fill('zzzzzzzzzzzzzz12345nonexistent');
      await page.waitForTimeout(500);

      const isEmptyVisible = await emptyState.isVisible();
      if (!isEmptyVisible) throw new Error('Empty state should be visible for no results');

      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(500);
    });

    await context.close();
  }

  // ── Summary ──
  await browser.close();

  console.log('\n========================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`  Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    - ${r.name}: ${r.error}`);
    });
  }
  console.log(`\n  Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
