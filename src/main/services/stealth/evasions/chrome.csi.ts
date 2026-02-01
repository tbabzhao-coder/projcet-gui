/**
 * Chrome CSI Evasion
 *
 * Mock the chrome.csi function if not available (e.g. when running headless).
 * It's a deprecated chrome specific API to fetch browser timings.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const chromeCsiEvasion = `
(function() {
  try {
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        writable: true,
        enumerable: true,
        configurable: false,
        value: {}
      });
    }

    if ('csi' in window.chrome) {
      return; // Nothing to do here
    }

    if (!window.performance || !window.performance.timing) {
      return;
    }

    const { timing } = window.performance;

    window.chrome.csi = function() {
      return {
        onloadT: timing.domContentLoadedEventEnd,
        startE: timing.navigationStart,
        pageT: Date.now() - timing.navigationStart,
        tran: 15
      };
    };
    utils.patchToString(window.chrome.csi);
  } catch (err) {}
})();
`;
