/**
 * Chrome LoadTimes Evasion
 *
 * Mock the chrome.loadTimes function if not available (e.g. when running headless).
 * It's a deprecated chrome specific API to fetch browser timings and connection info.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const chromeLoadTimesEvasion = `
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

    if ('loadTimes' in window.chrome) {
      return; // Nothing to do here
    }

    if (
      !window.performance ||
      !window.performance.timing ||
      !window.PerformancePaintTiming
    ) {
      return;
    }

    const { performance } = window;

    const ntEntryFallback = {
      nextHopProtocol: 'h2',
      type: 'other'
    };

    const protocolInfo = {
      get connectionInfo() {
        const ntEntry =
          performance.getEntriesByType('navigation')[0] || ntEntryFallback;
        return ntEntry.nextHopProtocol;
      },
      get npnNegotiatedProtocol() {
        const ntEntry =
          performance.getEntriesByType('navigation')[0] || ntEntryFallback;
        return ['h2', 'hq'].includes(ntEntry.nextHopProtocol)
          ? ntEntry.nextHopProtocol
          : 'unknown';
      },
      get navigationType() {
        const ntEntry =
          performance.getEntriesByType('navigation')[0] || ntEntryFallback;
        return ntEntry.type;
      },
      get wasAlternateProtocolAvailable() {
        return false;
      },
      get wasFetchedViaSpdy() {
        const ntEntry =
          performance.getEntriesByType('navigation')[0] || ntEntryFallback;
        return ['h2', 'hq'].includes(ntEntry.nextHopProtocol);
      },
      get wasNpnNegotiated() {
        const ntEntry =
          performance.getEntriesByType('navigation')[0] || ntEntryFallback;
        return ['h2', 'hq'].includes(ntEntry.nextHopProtocol);
      }
    };

    const { timing } = window.performance;

    function toFixed(num, fixed) {
      var re = new RegExp('^-?\\\\d+(?:.\\\\d{0,' + (fixed || -1) + '})?');
      return num.toString().match(re)[0];
    }

    const timingInfo = {
      get firstPaintAfterLoadTime() {
        return 0;
      },
      get requestTime() {
        return timing.navigationStart / 1000;
      },
      get startLoadTime() {
        return timing.navigationStart / 1000;
      },
      get commitLoadTime() {
        return timing.responseStart / 1000;
      },
      get finishDocumentLoadTime() {
        return timing.domContentLoadedEventEnd / 1000;
      },
      get finishLoadTime() {
        return timing.loadEventEnd / 1000;
      },
      get firstPaintTime() {
        const fpEntry = performance.getEntriesByType('paint')[0] || {
          startTime: timing.loadEventEnd / 1000
        };
        return toFixed(
          (fpEntry.startTime + performance.timeOrigin) / 1000,
          3
        );
      }
    };

    window.chrome.loadTimes = function() {
      return {
        ...protocolInfo,
        ...timingInfo
      };
    };
    utils.patchToString(window.chrome.loadTimes);
  } catch (err) {}
})();
`;
