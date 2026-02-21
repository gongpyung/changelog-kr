/**
 * E2E Tests: 계정 간 체크인 데이터 격리 (Bug 3)
 *
 * Bug 3: 사용자 A의 체크인 데이터가 사용자 B 세션에 누출되지 않아야 함
 *
 * CheckInManager.onAuthChange()는 항상 _checkins를 초기화한 뒤
 * 새로운 사용자 데이터를 로드해야 한다.
 *
 * 테스트 시나리오:
 *   1. 사용자 A로 인증 → 버전 체크인 → seen 상태 확인
 *   2. 로그아웃 → 인증 해제 → badge-new 및 요약 패널 사라짐 확인
 *   3. 사용자 B로 인증 (checkin 없음) → A의 데이터 누출 없이 전부 unseen 확인
 */

import { test, expect } from '@playwright/test';
import { setupAuthMock } from './helpers/supabase-mock.mjs';

// ---------------------------------------------------------------------------
// Bug 3: 계정 간 체크인 데이터 격리
// ---------------------------------------------------------------------------

test.describe('Bug 3: 계정 간 체크인 데이터 격리', () => {
  test('로그아웃 시 체크인 데이터 초기화 — _checkins가 비워지고 인증 UI가 갱신됨', async ({ page }) => {
    // 사용자 A: claude-code 모든 버전 확인 완료
    await setupAuthMock(page, {
      checkins: [
        {
          service_id: 'claude-code',
          last_checked_version: '99.99.99',
          last_checked_at: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 초기 상태: 모든 버전 seen → badge-new 없음
    const beforeLogoutBadges = await page.locator('.badge-new').count();
    expect(beforeLogoutBadges).toBe(0);

    // 로그아웃 시뮬레이션: signOut() → handleAuthStateChange(SIGNED_OUT, null)
    // → CheckInManager.onAuthChange(false) → _checkins = {}
    await page.evaluate(async () => {
      if (window.SupabaseClient?.signOut) {
        await window.SupabaseClient.signOut();
      }
    });
    await page.waitForTimeout(500);

    // 핵심 검증: 로그아웃 후 _checkins 완전 초기화 (계정 간 데이터 누출 방지)
    const checkinsAfterLogout = await page.evaluate(() => window.CheckInManager._checkins);
    expect(Object.keys(checkinsAfterLogout)).toHaveLength(0);

    // UI 검증: app.js가 인증 UI를 업데이트 — 로그인 버튼 표시
    await expect(page.locator('#authLoginBtn')).toBeVisible({ timeout: 3000 });
  });

  test('사용자 A의 체크인이 사용자 B 세션에 표시되지 않아야 함', async ({ page }) => {
    // 사용자 A: claude-code 서비스의 최신 버전이 체크인된 상태
    // (즉, 사용자 A는 모든 버전을 확인했음)
    const userACheckins = [
      {
        service_id: 'claude-code',
        last_checked_version: '99.99.99', // 모든 버전보다 높은 버전 → 모두 seen
        last_checked_at: new Date().toISOString(),
      },
    ];
    await setupAuthMock(page, { checkins: userACheckins });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // 렌더링 완료 대기

    // 사용자 A: 모든 버전 seen → badge-new 없음
    const userABadgeCount = await page.locator('.badge-new').count();
    expect(userABadgeCount).toBe(0);

    // 사용자 A 로그아웃 시뮬레이션
    await page.evaluate(async () => {
      if (window.SupabaseClient?.signOut) {
        await window.SupabaseClient.signOut();
      }
    });

    await page.waitForTimeout(500);

    // 사용자 B로 전환: 체크인 없음 (새 계정) → 모두 unseen이어야 함
    // page.evaluate로 SupabaseClient 교체 (사용자 B 모킹)
    await page.evaluate(() => {
      const USER_B = {
        id: 'user-b-id-456',
        email: 'user-b@example.com',
        user_metadata: { full_name: 'User B', avatar_url: null },
      };
      const authListeners = [];

      // SupabaseClient를 사용자 B용으로 교체
      window.SupabaseClient = {
        init: async () => true,
        isConfigured: () => true,
        signInWithGoogle: async () => {},
        signInWithGitHub: async () => {},
        signOut: async () => {},
        getCurrentUser: () => USER_B,
        isAuthenticated: () => true,
        onAuthStateChange: (cb) => {
          authListeners.push(cb);
          return () => {};
        },
        getCheckins: async () => [], // 사용자 B는 체크인 없음
        getCheckin: async () => null,
        checkin: async () => true,
        batchCheckin: async () => true,
      };

      // CheckInManager에 인증 상태 변경 통보 (사용자 B로 로그인)
      if (window.CheckInManager) {
        window.CheckInManager.onAuthChange(true);
      }
    });

    // 사용자 B 데이터 로드 및 재렌더링 대기
    await page.waitForFunction(
      () => document.querySelectorAll('.badge-new').length > 0,
      { timeout: 8000 }
    );

    // 사용자 B: 체크인 없음 → 모든 버전 unseen → badge-new 존재
    const userBBadgeCount = await page.locator('.badge-new').count();
    expect(userBBadgeCount).toBeGreaterThan(0);

    // 사용자 B: 요약 패널 표시
    await expect(page.locator('#checkinSummary')).toBeVisible({ timeout: 5000 });
  });

  test('서비스별 체크인 데이터가 독립적으로 유지됨 — 서비스 A seen이 서비스 B에 영향 없음', async ({ page }) => {
    // claude-code만 모든 버전 확인 완료, 두 번째 서비스는 체크인 없음
    await setupAuthMock(page, {
      checkins: [
        {
          service_id: 'claude-code',
          last_checked_version: '99.99.99',
          last_checked_at: new Date().toISOString(),
        },
        // 두 번째 서비스는 의도적으로 체크인 없음 → 모두 unseen
      ],
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // claude-code (기본 서비스): 모든 버전 seen → badge-new 없음
    const claudeCodeBadges = await page.locator('.badge-new').count();
    expect(claudeCodeBadges).toBe(0);

    // 두 번째 서비스로 전환 (codex-cli 등)
    const secondService = page.locator('.service-item').nth(1);
    await secondService.click();
    await page.waitForTimeout(2000);

    // 두 번째 서비스: 체크인 기록 없음 → 모든 버전이 NEW
    const secondServiceBadges = await page.locator('.badge-new').count();
    expect(secondServiceBadges).toBeGreaterThan(0);

    // 서비스 간 데이터 독립성 검증
    const checkins = await page.evaluate(() => window.CheckInManager._checkins);
    // claude-code 체크인은 그대로 유지
    expect(checkins['claude-code']).toBeDefined();
    expect(checkins['claude-code'].lastCheckedVersion).toBe('99.99.99');
    // 두 번째 서비스 ID는 체크인 없음 유지 (claude-code 데이터가 오염되지 않음)
    const serviceIds = Object.keys(checkins);
    expect(serviceIds).toContain('claude-code');
    expect(serviceIds.filter(id => id !== 'claude-code')).toHaveLength(0);
  });
});
