/**
 * Navigator Vendor Evasion
 *
 * Set navigator.vendor to 'Google Inc.' (Chrome default).
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const navigatorVendorEvasion = `
(function() {
  try {
    const vendor = 'Google Inc.';
    utils.replaceGetterWithProxy(
      Object.getPrototypeOf(navigator),
      'vendor',
      utils.makeHandler().getterValue(vendor)
    );
  } catch (err) {}
})();
`;
