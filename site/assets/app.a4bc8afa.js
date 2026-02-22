/**
 * AI Changelog Hub - Client-side Application
 * Multi-service support with Neon Terminal theme
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const DEBOUNCE_MS = 300;
  const DEFAULT_EXPANDED_COUNT = 5;
  const SERVICES_URL = 'data/services.json';
  const LEGACY_DATA_URL = 'data/all-translations.json';

  const CATEGORY_LABELS = {
    added: '추가',
    fixed: '수정',
    improved: '개선',
    changed: '변경',
    removed: '제거',
    other: '기타',
  };

  const CATEGORY_CLASSES = {
    added: 'badge-added',
    fixed: 'badge-fixed',
    improved: 'badge-improved',
    changed: 'badge-changed',
    removed: 'badge-removed',
    other: 'badge-other',
  };

  const CATEGORY_ORDER = {
    added: 0,
    fixed: 1,
    improved: 2,
    changed: 3,
    removed: 4,
    other: 5,
  };

  // ---------------------------------------------------------------------------
  // Utility Functions
  // ---------------------------------------------------------------------------

  function formatVersionDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${year}.${month}.${day}`;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let servicesConfig = null;
  let currentService = null;
  let allVersions = [];
  let filteredVersions = [];
  let expandedSet = new Set();
  let manualToggleState = null; // null=기본(상위N개), true=모두펼침, false=모두접기

  let activeCategory = 'all';
  let activeScope = 'all';
  let activeMajor = 'all';
  let searchQuery = '';

  // Auth state
  let currentUser = null;

  // ---------------------------------------------------------------------------
  // DOM References
  // ---------------------------------------------------------------------------

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const searchInput = $('#searchInput');
  const searchClear = $('#searchClear');
  const versionList = $('#versionList');
  const emptyState = $('#emptyState');
  const loadingState = $('#loadingState');
  const resultsSummary = $('#resultsSummary');
  const resultsCount = $('#resultsCount');
  const toggleAllBtn = $('#toggleAllBtn');
  const clearFiltersBtn = $('#clearFiltersBtn');
  const backToTop = $('#backToTop');
  const themeToggle = $('#themeToggle');
  const sunIcon = $('#sunIcon');
  const moonIcon = $('#moonIcon');
  const serviceList = $('#serviceList');
  const serviceTitle = $('#serviceTitle');
  const versionBadge = $('#versionBadge');
  const sourceLink = $('#sourceLink');
  const sidebarGithubLink = $('#sidebarGithubLink');
  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebarOverlay');
  const mobileMenuBtn = $('#mobileMenuBtn');

  // ---------------------------------------------------------------------------
  // Theme Management
  // ---------------------------------------------------------------------------

  function initTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (stored === 'dark' || !stored) {
      document.documentElement.classList.add('dark');
    }
    updateThemeIcons();
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcons();
  }

  function updateThemeIcons() {
    const isDark = document.documentElement.classList.contains('dark');
    if (sunIcon) sunIcon.classList.toggle('hidden', !isDark);
    if (moonIcon) moonIcon.classList.toggle('hidden', isDark);
  }

  // ---------------------------------------------------------------------------
  // Mobile Sidebar
  // ---------------------------------------------------------------------------

  function openSidebar() {
    sidebar.classList.remove('-translate-x-full');
    sidebarOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (mobileMenuBtn) mobileMenuBtn.classList.add('hidden');
  }

  function closeSidebar() {
    sidebar.classList.add('-translate-x-full');
    sidebarOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (mobileMenuBtn) mobileMenuBtn.classList.remove('hidden');
  }

  function setupMobileSidebar() {
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', () => {
        const isOpen = !sidebar.classList.contains('-translate-x-full');
        if (isOpen) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeSidebar);
    }
  }

  // ---------------------------------------------------------------------------
  // Services Management
  // ---------------------------------------------------------------------------

  async function loadServicesConfig() {
    try {
      const response = await fetch(SERVICES_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Services config not found');
      servicesConfig = await response.json();
      return true;
    } catch (error) {
      console.warn('Multi-service mode not available, using legacy mode');
      servicesConfig = null;
      return false;
    }
  }

  function getServiceDataURL(serviceId) {
    return `data/services/${serviceId}/translations.json`;
  }

  function renderServiceList() {
    if (!serviceList || !servicesConfig) return;

    serviceList.innerHTML = '';

    // Render all services: enabled ones are clickable, disabled ones show "Coming soon"
    servicesConfig.services.forEach(service => {
      if (!service.enabled) {
        // Disabled service - Coming soon
        const item = document.createElement('div');
        item.className = 'flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed';
        item.innerHTML = `
          <div class="w-8 h-8 rounded-md bg-light-elevated dark:bg-terminal-elevated border border-light-border dark:border-terminal-border flex items-center justify-center text-sm">
            <span class="text-xs font-bold text-light-muted dark:text-terminal-muted">${escapeHtml(service.shortName.charAt(0).toUpperCase())}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-light-muted dark:text-gray-400 truncate">${escapeHtml(service.name)}</p>
            <p class="text-[10px] text-light-muted dark:text-terminal-muted">${escapeHtml(service.vendor)} &middot; Coming soon</p>
          </div>
        `;
        serviceList.appendChild(item);
        return;
      }

      const isActive = service.id === currentService;
      const item = document.createElement('a');
      item.href = '#';
      item.className = `service-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive ? 'active' : ''}`;
      item.dataset.serviceId = service.id;

      const iconLetter = service.shortName.charAt(0).toUpperCase();
      const iconStyle = isActive
        ? `border-color: ${service.color}; color: ${service.color};`
        : `border-color: ${service.color}40;`;
      const letterStyle = isActive ? '' : `color: ${service.color};`;

      item.innerHTML = `
        <div class="w-8 h-8 rounded-md bg-light-elevated dark:bg-terminal-elevated border flex items-center justify-center text-sm group-hover:border-opacity-60 transition-colors" style="${iconStyle}">
          <span class="text-xs font-bold" style="${letterStyle}">${iconLetter}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-[#3D3D3A] dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white truncate">${escapeHtml(service.name)}</p>
          <p class="text-[10px] text-light-muted dark:text-terminal-muted">${escapeHtml(service.vendor)}</p>
        </div>
      `;

      item.addEventListener('click', (e) => {
        e.preventDefault();
        switchService(service.id);
      });
      serviceList.appendChild(item);
    });
  }

  async function switchService(serviceId) {
    if (serviceId === currentService) {
      closeSidebar();
      return;
    }

    const service = servicesConfig?.services.find(s => s.id === serviceId);
    if (!service) return;

    currentService = serviceId;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('service', serviceId);
    window.history.pushState({}, '', url);

    // Update UI
    if (serviceTitle) serviceTitle.textContent = service.name;
    if (sourceLink) sourceLink.href = service.sourceUrl;
    if (sidebarGithubLink) sidebarGithubLink.href = service.sourceUrl;

    // Re-render service list to update active state
    renderServiceList();

    // Show loading
    if (loadingState) loadingState.classList.remove('hidden');
    if (versionList) versionList.innerHTML = '<div class="absolute left-4 top-0 bottom-0 w-px bg-light-border dark:bg-terminal-border"></div>';

    // Load new data
    await loadServiceData(serviceId);

    if (loadingState) loadingState.classList.add('hidden');

    applyFilters();

    // Close mobile sidebar
    closeSidebar();
  }

  async function loadServiceData(serviceId) {
    try {
      const url = servicesConfig ? getServiceDataURL(serviceId) : LEGACY_DATA_URL;
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      allVersions = data.versions || [];

      // Update version count
      if (versionBadge) {
        versionBadge.textContent = `${allVersions.length} versions`;
      }

      return true;
    } catch (error) {
      console.error('Failed to load translations:', error);
      if (loadingState) {
        loadingState.innerHTML = `
          <div class="text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-light-elevated dark:bg-terminal-surface border border-light-border dark:border-terminal-border flex items-center justify-center">
              <svg class="w-8 h-8 text-neon-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <p class="text-[#3D3D3A] dark:text-gray-300 font-medium">데이터를 불러올 수 없습니다</p>
            <p class="text-sm text-light-muted dark:text-terminal-muted mt-1">${error.message}</p>
          </div>
        `;
      }
      return false;
    }
  }

  function getServiceFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('service');
  }

  // ---------------------------------------------------------------------------
  // Filtering Logic
  // ---------------------------------------------------------------------------

  function matchesSearch(entry) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const translated = (entry.translated || '').toLowerCase();
    const original = (entry.original || '').toLowerCase();
    return translated.includes(q) || original.includes(q);
  }

  function matchesCategory(entry) {
    if (activeCategory === 'all') return true;
    return entry.category === activeCategory;
  }

  function matchesScope(entry) {
    if (activeScope === 'all') return true;
    return entry.scope && entry.scope.toLowerCase().includes(activeScope.toLowerCase());
  }

  function matchesMajor(version) {
    return true;
  }

  function applyFilters() {
    filteredVersions = [];

    for (const ver of allVersions) {
      if (!matchesMajor(ver)) continue;

      const matchingEntries = ver.entries.filter(
        (e) => matchesSearch(e) && matchesCategory(e) && matchesScope(e)
      );

      matchingEntries.sort((a, b) =>
        (CATEGORY_ORDER[a.category] ?? 5) - (CATEGORY_ORDER[b.category] ?? 5)
      );

      if (matchingEntries.length > 0) {
        filteredVersions.push({
          version: ver.version,
          date: ver.date,
          entries: matchingEntries,
          totalEntries: ver.entries.length,
        });
      }
    }

    renderVersions();
    renderVersionToc();
    updateResultsSummary();
    updateCheckinSummary();
  }

  function updateResultsSummary() {
    const hasFilters = searchQuery || activeCategory !== 'all' || activeScope !== 'all' || activeMajor !== 'all';

    if (hasFilters && resultsSummary && resultsCount) {
      const totalEntries = filteredVersions.reduce((sum, v) => sum + v.entries.length, 0);
      resultsCount.textContent = `${filteredVersions.length}개 버전, ${totalEntries}개 항목 일치`;
      resultsSummary.classList.remove('hidden');
    } else if (resultsSummary) {
      resultsSummary.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function renderVersionToc() {
    const tocContainer = $('#versionToc');
    if (!tocContainer) return;

    const majorGroups = {};
    for (const ver of filteredVersions) {
      const major = ver.version.split('.')[0];
      if (!majorGroups[major]) {
        majorGroups[major] = { count: 0, firstVersion: ver.version };
      }
      majorGroups[major].count++;
    }

    const sortedMajors = Object.keys(majorGroups).sort((a, b) => Number(b) - Number(a));

    tocContainer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2 min-w-max';

    for (const major of sortedMajors) {
      const group = majorGroups[major];
      const btn = document.createElement('a');
      btn.href = `#v${group.firstVersion}`;
      btn.className = 'version-toc-item';
      btn.textContent = `v${major}.x (${group.count})`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(`v${group.firstVersion}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      wrapper.appendChild(btn);
    }

    tocContainer.appendChild(wrapper);
  }

  function renderVersions() {
    if (!versionList) return;

    // Keep timeline line
    versionList.innerHTML = '<div class="absolute left-4 top-0 bottom-0 w-px bg-light-border dark:bg-terminal-border"></div>';

    if (filteredVersions.length === 0) {
      // Check if this is a service with no data at all vs. filter producing no results
      if (allVersions.length === 0) {
        // Service has no translations at all - show service empty state
        if (emptyState) {
          emptyState.classList.remove('hidden');
          const heading = emptyState.querySelector('h3');
          const desc = emptyState.querySelector('p');
          if (heading) heading.textContent = '\uC544\uC9C1 changelog \uC138\uBD80 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4';
          if (desc) desc.textContent = '\uC0C8 \uB9B4\uB9AC\uC988\uAC00 \uAC8C\uC2DC\uB418\uBA74 \uC790\uB3D9\uC73C\uB85C \uC218\uC9D1\uB429\uB2C8\uB2E4.';
          // "아직 changelog 세부 내용이 없습니다" / "새 릴리스가 게시되면 자동으로 수집됩니다."
          const clearBtn = emptyState.querySelector('#clearFiltersBtn');
          if (clearBtn) clearBtn.classList.add('hidden');
        }
      } else {
        // Filter produced no results
        if (emptyState) {
          emptyState.classList.remove('hidden');
          const heading = emptyState.querySelector('h3');
          const desc = emptyState.querySelector('p');
          if (heading) heading.textContent = '\uAC80\uC0C9 \uACB0\uACFC \uC5C6\uC74C';
          if (desc) desc.textContent = '\uAC80\uC0C9\uC5B4 \uB610\uB294 \uD544\uD130 \uC870\uAC74\uC744 \uBCC0\uACBD\uD574 \uBCF4\uC138\uC694.';
          const clearBtn = emptyState.querySelector('#clearFiltersBtn');
          if (clearBtn) clearBtn.classList.remove('hidden');
        }
      }
      if (toggleAllBtn) toggleAllBtn.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (toggleAllBtn) {
      toggleAllBtn.classList.remove('hidden');
      toggleAllBtn.classList.add('sm:flex');
    }

    const fragment = document.createDocumentFragment();

    filteredVersions.forEach((ver, index) => {
      const card = createVersionCard(ver, index);
      fragment.appendChild(card);
    });

    versionList.appendChild(fragment);
  }

  function createVersionCard(ver, index) {
    const article = document.createElement('article');
    article.className = 'version-card fade-in';
    article.id = `v${ver.version}`;
    article.style.animationDelay = `${Math.min(index * 30, 300)}ms`;

    // Check if this version is new (unseen by user)
    const isAuthenticated = window.SupabaseClient?.isAuthenticated?.();
    const isNew = isAuthenticated && window.CheckInManager && currentService &&
                  window.CheckInManager.isNewVersion(currentService, ver.version);

    // Add checked class if not new (only when authenticated)
    if (isAuthenticated && !isNew && window.CheckInManager?.isInitialized()) {
      article.classList.add('checked');
    }

    let isExpanded;
    if (manualToggleState === true) {
      isExpanded = true;
    } else if (manualToggleState === false) {
      isExpanded = false;
    } else {
      isExpanded = expandedSet.has(ver.version) || index < DEFAULT_EXPANDED_COUNT;
    }

    // Header
    const header = document.createElement('button');
    header.className = 'version-header w-full';

    const dateHtml = ver.date
      ? `<span class="version-date text-xs font-medium text-light-muted dark:text-terminal-muted">${formatVersionDate(ver.date)}</span>`
      : '';

    // NEW badge HTML
    const newBadgeHtml = isNew ? '<span class="badge-new"></span>' : '';

    header.innerHTML = `
      <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
        <h2 class="text-sm sm:text-lg font-bold whitespace-nowrap">v${ver.version}</h2>
        ${newBadgeHtml}
        ${dateHtml}
        <span class="hidden sm:inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-light-elevated dark:bg-terminal-elevated text-light-muted dark:text-terminal-muted whitespace-nowrap">${ver.entries.length}개</span>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button class="checkin-btn ${isNew ? '' : 'hidden'}" title="확인 완료로 표시" data-version="${ver.version}">
          확인
        </button>
        <svg class="chevron w-5 h-5 ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'version-body';
    body.style.display = isExpanded ? 'block' : 'none';

    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'p-4 space-y-1';

    ver.entries.forEach((entry) => {
      entriesContainer.appendChild(createEntryItem(entry));
    });

    body.appendChild(entriesContainer);

    // Checkin button handler
    const checkinBtn = header.querySelector('.checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleVersionCheckin(ver.version, article, checkinBtn);
      });
    }

    // Toggle
    header.addEventListener('click', () => {
      const isOpen = body.style.display !== 'none';
      if (isOpen) {
        body.style.display = 'none';
        header.querySelector('.chevron').classList.remove('rotate-180');
        expandedSet.delete(ver.version);
      } else {
        body.style.display = 'block';
        header.querySelector('.chevron').classList.add('rotate-180');
        expandedSet.add(ver.version);
      }
    });

    article.appendChild(header);
    article.appendChild(body);

    return article;
  }

  async function handleVersionCheckin(version, article, checkinBtn) {
    if (!window.CheckInManager) {
      console.warn('[Checkin] CheckInManager not available');
      return;
    }

    // Check if user is authenticated
    const isAuthenticated = window.SupabaseClient?.isAuthenticated?.();
    if (!isAuthenticated) {
      // Show login prompt
      const authModal = $('#authModal');
      if (authModal) {
        authModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
      return;
    }

    // Save checkin
    try {
      checkinBtn.disabled = true;
      checkinBtn.textContent = '처리중...';

      const success = await window.CheckInManager.saveCheckIn(currentService, version);

      if (success) {
        applyFilters();
      } else {
        checkinBtn.textContent = '확인';
        checkinBtn.disabled = false;
      }
    } catch (error) {
      console.error('[Checkin] Failed to save checkin:', error);
      checkinBtn.textContent = '확인';
      checkinBtn.disabled = false;
    }
  }

  function updateCheckinSummary() {
    const summaryPanel = $('#checkinSummary');
    if (!summaryPanel) return;

    // Hide panel if not authenticated or CheckInManager not ready
    const isAuthenticated = window.SupabaseClient?.isAuthenticated?.();
    if (!isAuthenticated || !window.CheckInManager || !currentService) {
      summaryPanel.classList.add('hidden');
      return;
    }

    const unseenCount = window.CheckInManager.getUnseenCount(currentService, allVersions);

    // Hide panel if no new versions
    if (unseenCount === 0) {
      summaryPanel.classList.add('hidden');
      return;
    }

    // Update count text
    const checkinCount = $('#checkinCount');
    if (checkinCount) {
      checkinCount.textContent = `${unseenCount}개 새 버전`;
    }

    // Update stats: list unseen versions
    const checkinStats = $('#checkinStats');
    if (checkinStats) {
      const unseenVersions = window.CheckInManager.getUnseenVersions(currentService, allVersions);
      checkinStats.innerHTML = unseenVersions.slice(0, 5).map(v =>
        `<span class="checkin-stat-item">v${escapeHtml(v.version)}</span>`
      ).join('');
      if (unseenVersions.length > 5) {
        checkinStats.innerHTML += `<span class="checkin-stat-item">+${unseenVersions.length - 5}개</span>`;
      }
    }

    summaryPanel.classList.remove('hidden');
  }

  function setupCheckinSummary() {
    const checkinAllBtn = $('#checkinAllBtn');
    if (checkinAllBtn && !checkinAllBtn._checkinSetup) {
      checkinAllBtn._checkinSetup = true;
      checkinAllBtn.addEventListener('click', async () => {
        if (!window.CheckInManager || !currentService) return;

        const isAuthenticated = window.SupabaseClient?.isAuthenticated?.();
        if (!isAuthenticated) {
          const authModal = $('#authModal');
          if (authModal) {
            authModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
          }
          return;
        }

        const latestVersion = allVersions[0]?.version;
        if (!latestVersion) return;

        checkinAllBtn.disabled = true;
        checkinAllBtn.textContent = '처리중...';

        const success = await window.CheckInManager.markAllAsSeen(currentService, latestVersion);

        if (success) {
          applyFilters();
        } else {
          checkinAllBtn.textContent = '모두 확인';
          checkinAllBtn.disabled = false;
        }
      });
    }

  }

  function createEntryItem(entry) {
    const div = document.createElement('div');
    div.className = 'entry-item';

    const categoryLabel = CATEGORY_LABELS[entry.category] || CATEGORY_LABELS.other;
    const categoryClass = CATEGORY_CLASSES[entry.category] || CATEGORY_CLASSES.other;

    const translatedText = entry.translated || entry.original || '';
    const originalText = entry.original || '';
    const hasTranslation = entry.translated && entry.translated !== entry.original;

    let scopeHtml = '';
    if (entry.scope) {
      scopeHtml = `<span class="px-1.5 py-0.5 rounded text-xs font-medium bg-light-elevated dark:bg-terminal-elevated text-light-muted dark:text-terminal-muted shrink-0">${escapeHtml(entry.scope)}</span>`;
    }

    div.innerHTML = `
      <span class="category-badge ${categoryClass} shrink-0">${categoryLabel}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-start gap-2 flex-wrap">
          ${scopeHtml}
          <p class="entry-text text-sm flex-1">${renderInlineMarkdown(translatedText)}</p>
        </div>
        <div class="original-text hidden mt-2 text-xs">${renderInlineMarkdown(originalText)}</div>
        ${hasTranslation ? `<button class="toggle-original mt-1">원문 보기</button>` : ''}
      </div>
    `;

    const toggleBtn = div.querySelector('.toggle-original');
    if (toggleBtn) {
      const originalDiv = div.querySelector('.original-text');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = originalDiv.classList.contains('hidden');
        originalDiv.classList.toggle('hidden');
        toggleBtn.textContent = isHidden ? '원문 숨기기' : '원문 보기';
      });
    }

    return div;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderInlineMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // Bold: **text** → <strong>text</strong>
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // Inline code: `text` → <code>text</code>
    html = html.replace(/`([^`]+?)`/g, '<code class="inline-code">$1</code>');
    return html;
  }

  // ---------------------------------------------------------------------------
  // Filter Event Handlers
  // ---------------------------------------------------------------------------

  function setupCategoryFilters() {
    $$('.category-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.category-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        manualToggleState = null;
        updateToggleButtonText();
        applyFilters();
      });
    });
  }

  function setupScopeFilters() {
    $$('.scope-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.scope-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeScope = btn.dataset.scope;
        manualToggleState = null;
        updateToggleButtonText();
        applyFilters();
      });
    });
  }

  function setupVersionFilters() {
    // Removed: version filter buttons replaced by version TOC navigation (Task 6)
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  function setupSearch() {
    if (!searchInput) return;

    let debounceTimer;

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        if (searchClear) searchClear.classList.toggle('hidden', !searchQuery);
        manualToggleState = null;
        updateToggleButtonText();
        applyFilters();
      }, DEBOUNCE_MS);
    });

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        searchClear.classList.add('hidden');
        manualToggleState = null;
        updateToggleButtonText();
        applyFilters();
        searchInput.focus();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle All
  // ---------------------------------------------------------------------------

  function updateToggleButtonText() {
    if (!toggleAllBtn) return;
    const isAllExpanded = manualToggleState === true;
    const text = isAllExpanded ? '모두 접기' : '모두 펼치기';
    if (isAllExpanded) {
      // Fold icon: chevrons pointing inward (toward center)
      toggleAllBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4l5 5 5-5M7 20l5-5 5 5"/></svg>
      `;
    } else {
      // Unfold icon: chevrons pointing outward (away from center)
      toggleAllBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 9l5-5 5 5M7 15l5 5 5-5"/></svg>
      `;
    }
    toggleAllBtn.title = text;
  }

  function setupToggleAll() {
    if (!toggleAllBtn) return;

    toggleAllBtn.addEventListener('click', () => {
      if (manualToggleState === true) {
        manualToggleState = false;
        expandedSet.clear();
      } else {
        manualToggleState = true;
        filteredVersions.forEach((v) => expandedSet.add(v.version));
      }

      updateToggleButtonText();
      applyFilters();
    });
  }

  // ---------------------------------------------------------------------------
  // Clear Filters
  // ---------------------------------------------------------------------------

  function setupClearFilters() {
    if (!clearFiltersBtn) return;

    clearFiltersBtn.addEventListener('click', () => {
      manualToggleState = null;
      updateToggleButtonText();

      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        if (searchClear) searchClear.classList.add('hidden');
      }

      activeCategory = 'all';
      $$('.category-filter').forEach((b) => b.classList.remove('active'));
      const allCat = $('.category-filter[data-category="all"]');
      if (allCat) allCat.classList.add('active');

      activeScope = 'all';
      $$('.scope-filter').forEach((b) => b.classList.remove('active'));
      const allScope = $('.scope-filter[data-scope="all"]');
      if (allScope) allScope.classList.add('active');

      activeMajor = 'all';

      applyFilters();
    });
  }

  // ---------------------------------------------------------------------------
  // Back to Top
  // ---------------------------------------------------------------------------

  function setupBackToTop() {
    if (!backToTop) return;

    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const show = window.scrollY > 400;
          backToTop.style.opacity = show ? '1' : '0';
          backToTop.style.transform = show ? 'translateY(0)' : 'translateY(1rem)';
          backToTop.style.pointerEvents = show ? 'auto' : 'none';
          ticking = false;
        });
        ticking = true;
      }
    });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---------------------------------------------------------------------------
  // Hash Navigation
  // ---------------------------------------------------------------------------

  function handleHashNavigation() {
    const hash = window.location.hash;
    if (!hash) return;

    const version = hash.replace('#v', '').replace('#', '');
    expandedSet.add(version);

    requestAnimationFrame(() => {
      const target = document.getElementById(`v${version}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.style.boxShadow = `0 0 0 2px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow)`;
        setTimeout(() => {
          target.style.boxShadow = '';
        }, 3000);
      }
    });
  }

  window.addEventListener('hashchange', handleHashNavigation);

  // ---------------------------------------------------------------------------
  // URL State (service parameter)
  // ---------------------------------------------------------------------------

  window.addEventListener('popstate', () => {
    const serviceId = getServiceFromURL();
    if (serviceId && serviceId !== currentService && servicesConfig) {
      switchService(serviceId);
    }
  });

  // ---------------------------------------------------------------------------
  // Auth Management
  // ---------------------------------------------------------------------------

  async function initAuth() {
    if (!window.SupabaseClient) {
      console.warn('[Auth] SupabaseClient not available');
      return;
    }

    const configured = await window.SupabaseClient.init();
    if (!configured) {
      console.warn('[Auth] Supabase not configured, auth features disabled');
      updateAuthUI(null);
      return;
    }

    // Register auth state change listener
    window.SupabaseClient.onAuthStateChange(handleAuthStateChange);

    // Get initial user state
    currentUser = window.SupabaseClient.getCurrentUser();
    updateAuthUI(currentUser);

    // Initialize CheckInManager
    if (window.CheckInManager) {
      await window.CheckInManager.init();
    }
  }

  async function handleAuthStateChange(event, user, previousUserId) {
    const userChanged = previousUserId && user?.id && previousUserId !== user.id;
    console.log('[Auth] State changed:', event, user?.email || 'signed out', userChanged ? '(user switched)' : '');
    currentUser = user;
    updateAuthUI(user);

    // Re-initialize CheckInManager on auth change
    if (window.CheckInManager) {
      await window.CheckInManager.onAuthChange(!!user);
    }

    // Re-render to update checkin markers
    applyFilters();
  }

  function updateAuthUI(user) {
    const authLoginBtn = $('#authLoginBtn');
    const authUserInfo = $('#authUserInfo');
    const authUserAvatar = $('#authUserAvatar');
    const authUserName = $('#authUserName');
    const authUserEmail = $('#authUserEmail');
    const authLogoutBtn = $('#authLogoutBtn');

    if (user) {
      // Logged in state
      if (authLoginBtn) authLoginBtn.classList.add('hidden');
      if (authUserInfo) authUserInfo.classList.remove('hidden');

      const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00D9FF&color=0D0D0D`;

      if (authUserAvatar) authUserAvatar.src = avatarUrl;
      if (authUserName) authUserName.textContent = displayName;
      if (authUserEmail) authUserEmail.textContent = user.email;

      // Setup logout handler
      if (authLogoutBtn) {
        authLogoutBtn.onclick = async () => {
          try {
            await window.SupabaseClient.signOut();
          } catch (error) {
            console.error('[Auth] Sign out failed:', error);
          }
        };
      }
    } else {
      // Logged out state
      if (authLoginBtn) authLoginBtn.classList.remove('hidden');
      if (authUserInfo) authUserInfo.classList.add('hidden');

      // Setup login modal handlers
      setupAuthModal();
    }
  }

  function setupAuthModal() {
    const authLoginBtn = $('#authLoginBtn');
    const authModal = $('#authModal');
    const authModalClose = $('#authModalClose');
    const authModalOverlay = authModal?.querySelector('.auth-modal-overlay');
    const authGithubBtn = $('#authGithubBtn');
    const authGoogleBtn = $('#authGoogleBtn');

    if (!authModal) return;

    // Remove existing listeners by cloning
    if (authLoginBtn && !authLoginBtn._modalSetup) {
      authLoginBtn._modalSetup = true;
      authLoginBtn.addEventListener('click', () => openAuthModal());
    }

    if (authModalClose && !authModalClose._modalSetup) {
      authModalClose._modalSetup = true;
      authModalClose.addEventListener('click', closeAuthModal);
    }

    if (authModalOverlay && !authModalOverlay._modalSetup) {
      authModalOverlay._modalSetup = true;
      authModalOverlay.addEventListener('click', closeAuthModal);
    }

    // ESC to close
    if (!document._authModalEsc) {
      document._authModalEsc = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && authModal && !authModal.classList.contains('hidden')) {
          closeAuthModal();
        }
      });
    }

    // OAuth handlers
    if (authGithubBtn && !authGithubBtn._modalSetup) {
      authGithubBtn._modalSetup = true;
      authGithubBtn.addEventListener('click', async () => {
        try {
          await window.SupabaseClient.signInWithGitHub();
        } catch (error) {
          showAuthError(error.message || '로그인 중 오류가 발생했습니다.');
        }
      });
    }

    if (authGoogleBtn && !authGoogleBtn._modalSetup) {
      authGoogleBtn._modalSetup = true;
      authGoogleBtn.addEventListener('click', async () => {
        try {
          await window.SupabaseClient.signInWithGoogle();
        } catch (error) {
          showAuthError(error.message || '로그인 중 오류가 발생했습니다.');
        }
      });
    }

  }

  let isAuthModalSetup = false;

  function openAuthModal() {
    const authModal = $('#authModal');
    const authError = $('#authError');

    if (authModal) {
      authModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
    if (authError) authError.classList.add('hidden');
  }

  function closeAuthModal() {
    const authModal = $('#authModal');
    if (authModal) {
      authModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function showAuthError(message) {
    const authError = $('#authError');
    if (authError) {
      const errorP = authError.querySelector('p');
      if (errorP) errorP.textContent = message;
      authError.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    initTheme();
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    setupMobileSidebar();
    setupSearch();
    setupCategoryFilters();
    setupScopeFilters();
    setupVersionFilters();
    setupToggleAll();
    setupClearFilters();
    setupBackToTop();
    setupCheckinSummary();

    // Initialize auth
    await initAuth();

    // Load services config
    const hasServices = await loadServicesConfig();

    // Determine initial service
    const urlService = getServiceFromURL();

    if (hasServices && servicesConfig) {
      // Multi-service mode
      const defaultService = servicesConfig.defaultService || servicesConfig.services.find(s => s.enabled)?.id;
      currentService = urlService || defaultService;

      const service = servicesConfig.services.find(s => s.id === currentService);
      if (service) {
        if (serviceTitle) serviceTitle.textContent = service.name;
        if (sourceLink) sourceLink.href = service.sourceUrl;
        if (sidebarGithubLink) sidebarGithubLink.href = service.sourceUrl;
      }

      renderServiceList();
      await loadServiceData(currentService);
    } else {
      // Legacy single-service mode
      currentService = 'claude-code';
      await loadServiceData(currentService);
    }

    if (loadingState) loadingState.classList.add('hidden');

    applyFilters();
    handleHashNavigation();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
