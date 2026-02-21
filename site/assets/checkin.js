/**
 * CheckInManager - 사용자 확인 기록 관리
 * 버전 카드의 "새 버전" 표시 및 확인 처리를 담당
 */

(function () {
  'use strict';

  const CheckInManager = {
    // 내부 상태
    _checkins: {},  // service_id -> { lastCheckedVersion, lastCheckedAt }
    _initialized: false,

    /**
     * 초기화 - 로그인 상태에 따라 데이터 로드
     */
    async init() {
      if (window.SupabaseClient && window.SupabaseClient.isAuthenticated()) {
        await this._loadFromServer();
      }
      this._initialized = true;
    },

    /**
     * 서버에서 확인 기록 로드
     */
    async _loadFromServer() {
      try {
        const checkins = await window.SupabaseClient.getCheckins();
        this._checkins = {};
        for (const c of checkins) {
          this._checkins[c.service_id] = {
            lastCheckedVersion: c.last_checked_version,
            lastCheckedAt: c.last_checked_at
          };
        }
      } catch (e) {
        console.error('[CheckInManager] Failed to load checkins:', e);
      }
    },

    /**
     * 인증 상태 변경 시 재초기화
     */
    async onAuthChange(isAuthenticated) {
      if (isAuthenticated) {
        await this._loadFromServer();
      } else {
        this._checkins = {};
      }
    },

    /**
     * 특정 서비스의 확인 기록 조회
     * @param {string} serviceId
     * @returns {{ lastCheckedVersion: string, lastCheckedAt: string } | null}
     */
    getCheckIn(serviceId) {
      return this._checkins[serviceId] || null;
    },

    /**
     * 버전이 새 버전인지 확인
     * @param {string} serviceId
     * @param {string} version
     * @returns {boolean} true면 새 버전 (확인하지 않은 버전)
     */
    isNewVersion(serviceId, version) {
      const checkin = this._checkins[serviceId];
      if (!checkin) return true;  // 기록 없으면 모두 새 버전
      return this._compareVersions(version, checkin.lastCheckedVersion) > 0;
    },

    /**
     * 새 버전(확인하지 않은 버전) 목록 조회
     * @param {string} serviceId
     * @param {Array<{version: string}>} allVersions
     * @returns {Array} 새 버전 목록
     */
    getUnseenVersions(serviceId, allVersions) {
      const checkin = this._checkins[serviceId];
      if (!checkin) return allVersions;

      return allVersions.filter(v =>
        this._compareVersions(v.version, checkin.lastCheckedVersion) > 0
      );
    },

    /**
     * 확인 기록 저장
     * @param {string} serviceId
     * @param {string} version
     * @returns {Promise<boolean>}
     */
    async saveCheckIn(serviceId, version) {
      try {
        if (window.SupabaseClient && window.SupabaseClient.isAuthenticated()) {
          await window.SupabaseClient.checkin(serviceId, version);
        }
        this._checkins[serviceId] = {
          lastCheckedVersion: version,
          lastCheckedAt: new Date().toISOString()
        };
        return true;
      } catch (e) {
        console.error('[CheckInManager] Failed to save checkin:', e);
        return false;
      }
    },

    /**
     * 모두 확인 처리 (최신 버전으로 업데이트)
     * @param {string} serviceId
     * @param {string} latestVersion
     * @returns {Promise<boolean>}
     */
    async markAllAsSeen(serviceId, latestVersion) {
      return this.saveCheckIn(serviceId, latestVersion);
    },

    /**
     * 서비스별 새 버전 개수 조회
     * @param {string} serviceId
     * @param {Array<{version: string}>} allVersions
     * @returns {number}
     */
    getUnseenCount(serviceId, allVersions) {
      return this.getUnseenVersions(serviceId, allVersions).length;
    },

    /**
     * 버전 비교 (semver)
     * @param {string} a
     * @param {string} b
     * @returns {number} 1: a > b, -1: a < b, 0: a == b
     */
    _compareVersions(a, b) {
      const partsA = a.replace(/^v/, '').split('.').map(Number);
      const partsB = b.replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((partsA[i] || 0) > (partsB[i] || 0)) return 1;
        if ((partsA[i] || 0) < (partsB[i] || 0)) return -1;
      }
      return 0;
    },

    /**
     * 초기화 완료 여부
     */
    isInitialized() {
      return this._initialized;
    }
  };

  // 전역 노출
  window.CheckInManager = CheckInManager;

})();
