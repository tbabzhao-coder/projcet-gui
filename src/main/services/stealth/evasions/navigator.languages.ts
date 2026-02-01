/**
 * Navigator Languages Evasion
 *
 * Set navigator.languages to a typical browser value.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const navigatorLanguagesEvasion = `
(function() {
  try {
    const languages = ['en-US', 'en'];
    utils.replaceGetterWithProxy(
      Object.getPrototypeOf(navigator),
      'languages',
      utils.makeHandler().getterValue(Object.freeze([...languages]))
    );
  } catch (err) {}
})();
`;
