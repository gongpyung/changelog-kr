/**
 * E2E Tests: 체크인 UI 동기화 (Bug 1 & Bug 2)
 *
 * Bug 1: #scrollToLatestBtn 제거 확인
 *   - 체크인 요약 패널에 scrollToLatestBtn 버튼이 존재하지 않아야 함
 *   - #checkinAllBtn("모두 확인")은 여전히 존재해야 함 (회귀 방지)
 *
 * Bug 2: 중간 버전 확인 시 하위 버전 UI 동기화
 *   - 특정 버전을 확인(checkin)하면 그 이하 버전들의 NEW 배지도 제거되어야 함
 *   - 그 이상 버전들의 NEW 배지는 유지되어야 함
 */

import { test, expect } from '@playwright/test';
import { setupAuthMock } from './helpers/supabase-mock.mjs';

// 모든 테스트에서 공통: 인증된 상태 + 체크인 기록 없음 (모든 버전 unseen)
test.beforeEach(async ({ page }) => {
  await setupAuthMock(page, { checkins: [] });
});

// ---------------------------------------------------------------------------
// Bug 1: scrollToLatestBtn 부재 확인
// ---------------------------------------------------------------------------

test.describe('Bug 1: scrollToLatestBtn 제거', () => {
  test('checkinSummary에 scrollToLatestBtn이 존재하지 않아야 함', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 인증 상태가 적용되고 badge-new가 렌더링될 때까지 대기
    await page.waitForSelector('.badge-new', { timeout: 8000 });

    // Bug 1: scrollToLatestBtn은 DOM에 존재하지 않아야 함 (제거된 기능)
    const scrollToLatestBtn = page.locator('#scrollToLatestBtn');
    expect(await scrollToLatestBtn.count()).toBe(0);
  });

  test('#checkinAllBtn(모두 확인)은 여전히 존재해야 함', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.badge-new', { timeout: 8000 });

    // 회귀 방지: "모두 확인" 버튼은 여전히 있어야 함
    const checkinAllBtn = page.locator('#checkinAllBtn');
    expect(await checkinAllBtn.count()).toBeGreaterThan(0);
    await expect(checkinAllBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Bug 2: 중간 버전 확인 시 하위 버전 UI 동기화
// ---------------------------------------------------------------------------

test.describe('Bug 2: 체크인 UI 동기화', () => {
  test('중간 버전 확인 시 하위 버전 NEW 배지도 제거됨', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 모든 버전이 unseen → badge-new 가 여러 개 존재해야 함
    await page.waitForSelector('.badge-new', { timeout: 8000 });

    const cards = page.locator('.version-card');
    const totalCards = await cards.count();
    expect(totalCards).toBeGreaterThan(3); // 최소 4개 버전 필요

    const initialBadgeCount = await page.locator('.badge-new').count();
    expect(initialBadgeCount).toBeGreaterThan(2);

    // 3번째 카드(index=2)를 클릭할 대상으로 선택
    // 위로 index 0, 1 두 카드가 있고, index 2는 "중간"
    const targetIndex = 2;
    const targetCard = cards.nth(targetIndex);

    // 해당 카드의 .checkin-btn은 unseen 상태이므로 표시되어야 함
    const checkinBtn = targetCard.locator('.checkin-btn');
    await expect(checkinBtn).toBeVisible({ timeout: 5000 });

    // 체크인 버튼 클릭
    await checkinBtn.click();

    // applyFilters()가 완료되어 badge-new 개수가 줄어들 때까지 대기
    await page.waitForFunction(
      (initial) => document.querySelectorAll('.badge-new').length < initial,
      initialBadgeCount,
      { timeout: 5000 }
    );

    // 검증 1: 클릭한 카드 위의 카드(index 0, 1)는 여전히 badge-new 존재
    for (let i = 0; i < targetIndex; i++) {
      const badge = cards.nth(i).locator('.badge-new');
      await expect(badge).toBeVisible({
        timeout: 3000,
        message: `카드 index ${i}는 아직 unseen이므로 badge-new가 있어야 함`,
      });
    }

    // 검증 2: 클릭한 카드(index 2)와 그 아래 카드들에는 badge-new가 없어야 함
    const cardsToCheck = Math.min(totalCards, targetIndex + 5);
    for (let i = targetIndex; i < cardsToCheck; i++) {
      const badgeCount = await cards.nth(i).locator('.badge-new').count();
      expect(badgeCount, `카드 index ${i}는 seen 처리되어 badge-new가 없어야 함`).toBe(0);
    }

    // 검증 3: 전체 badge-new 개수가 감소
    const finalBadgeCount = await page.locator('.badge-new').count();
    expect(finalBadgeCount).toBeLessThan(initialBadgeCount);
  });

  test('모두 확인 클릭 시 모든 NEW 배지 제거', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // badge-new가 렌더링될 때까지 대기
    await page.waitForSelector('.badge-new', { timeout: 8000 });

    const initialCount = await page.locator('.badge-new').count();
    expect(initialCount).toBeGreaterThan(0);

    // "모두 확인" 버튼 클릭
    const checkinAllBtn = page.locator('#checkinAllBtn');
    await expect(checkinAllBtn).toBeVisible();
    await checkinAllBtn.click();

    // 모든 badge-new가 사라질 때까지 대기
    await page.waitForFunction(
      () => document.querySelectorAll('.badge-new').length === 0,
      { timeout: 5000 }
    );

    // 검증 1: badge-new 전부 제거
    const finalCount = await page.locator('.badge-new').count();
    expect(finalCount).toBe(0);

    // 검증 2: checkinSummary 패널이 숨겨짐
    const summaryPanel = page.locator('#checkinSummary');
    await expect(summaryPanel).toBeHidden({ timeout: 3000 });
  });

  test('초기 로딩 시 인증된 사용자에게 checkinSummary 패널이 표시됨', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.badge-new', { timeout: 8000 });

    // 인증 + unseen 버전 존재 → 요약 패널이 보여야 함
    const summaryPanel = page.locator('#checkinSummary');
    await expect(summaryPanel).toBeVisible({ timeout: 5000 });

    // checkinCount 텍스트가 "N개 새 버전" 형식인지 확인
    const checkinCount = page.locator('#checkinCount');
    await expect(checkinCount).toContainText('개 새 버전', { timeout: 3000 });
  });
});
