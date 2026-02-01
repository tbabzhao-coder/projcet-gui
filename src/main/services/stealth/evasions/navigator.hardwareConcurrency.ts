/**
 * Navigator Hardware Concurrency Evasion
 *
 * Set navigator.hardwareConcurrency to a typical value (4).
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const navigatorHardwareConcurrencyEvasion = `
(function() {
  try {
    const hardwareConcurrency = 4;
    utils.replaceGetterWithProxy(
      Object.getPrototypeOf(navigator),
      'hardwareConcurrency',
      utils.makeHandler().getterValue(hardwareConcurrency)
    );
  } catch (err) {}
})();
`;
