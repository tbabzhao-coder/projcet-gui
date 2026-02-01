/**
 * Window Outer Dimensions Evasion
 *
 * Fix missing window.outerWidth/window.outerHeight in headless mode.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const windowOuterdimensionsEvasion = `
(function() {
  try {
    if (window.outerWidth && window.outerHeight) {
      return; // nothing to do here
    }
    const windowFrame = 85; // probably OS and WM dependent
    window.outerWidth = window.innerWidth;
    window.outerHeight = window.innerHeight + windowFrame;
  } catch (err) {}
})();
`;
