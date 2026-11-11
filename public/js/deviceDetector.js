/**
 * Universal Device Detection & Adaptation
 * Identifies Mobile (Android / iOS) vs Laptop / Desktop
 */
(function() {
  function getDeviceType() {
    const override = localStorage.getItem('device_view_override');
    if (override === 'laptop' || override === 'mobile') {
      return override;
    }
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSmallScreen = window.innerWidth < 992;
    const isTouchOnly = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) && window.matchMedia('(pointer: coarse)').matches;

    if (isMobileUA || (isTouchOnly && isSmallScreen) || isSmallScreen) {
      return 'mobile';
    }
    return 'laptop';
  }

  function applyDeviceClass() {
    const type = getDeviceType();
    const docEl = document.documentElement;
    const body = document.body;

    if (type === 'laptop') {
      docEl.classList.remove('is-mobile');
      docEl.classList.add('is-laptop');
      if (body) {
        body.classList.remove('is-mobile');
        body.classList.add('is-laptop');
      }
    } else {
      docEl.classList.remove('is-laptop');
      docEl.classList.add('is-mobile');
      if (body) {
        body.classList.remove('is-laptop');
        body.classList.add('is-mobile');
      }
    }

    // Update any device badge in UI
    const badge = document.getElementById('deviceIndicator');
    if (badge) {
      const isManual = !!localStorage.getItem('device_view_override');
      badge.textContent = type === 'laptop' ? '💻 Laptop Mode' : '📱 Mobile Mode';
      badge.title = isManual ? 'Click to reset auto-detection' : 'Click to toggle view';
    }
  }

  // Run immediately to prevent layout shifts
  applyDeviceClass();

  // Listen to DOMContentLoaded to bind badge & body
  document.addEventListener('DOMContentLoaded', () => {
    applyDeviceClass();

    const badge = document.getElementById('deviceIndicator');
    if (badge) {
      badge.addEventListener('click', () => {
        const current = getDeviceType();
        const next = current === 'laptop' ? 'mobile' : 'laptop';
        localStorage.setItem('device_view_override', next);
        applyDeviceClass();
        if (window.onDeviceModeChanged) {
          window.onDeviceModeChanged(next);
        }
      });
    }
  });

  // Listen for resize without override
  window.addEventListener('resize', () => {
    if (!localStorage.getItem('device_view_override')) {
      applyDeviceClass();
      if (window.onDeviceModeChanged) {
        window.onDeviceModeChanged(getDeviceType());
      }
    }
  });

  window.getDeviceType = getDeviceType;
  window.applyDeviceClass = applyDeviceClass;
})();
