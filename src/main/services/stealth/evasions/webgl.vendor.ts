/**
 * WebGL Vendor Evasion
 *
 * Fix WebGL Vendor/Renderer being set to Google in headless mode.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const webglVendorEvasion = `
(function() {
  try {
    const vendor = 'Intel Inc.';
    const renderer = 'Intel Iris OpenGL Engine';

    const getParameterProxyHandler = {
      apply: function(target, ctx, args) {
        const param = (args || [])[0];
        const result = utils.cache.Reflect.apply(target, ctx, args);
        // UNMASKED_VENDOR_WEBGL
        if (param === 37445) {
          return vendor;
        }
        // UNMASKED_RENDERER_WEBGL
        if (param === 37446) {
          return renderer;
        }
        return result;
      }
    };

    const addProxy = (obj, propName) => {
      utils.replaceWithProxy(obj, propName, getParameterProxyHandler);
    };

    addProxy(WebGLRenderingContext.prototype, 'getParameter');
    addProxy(WebGL2RenderingContext.prototype, 'getParameter');
  } catch (err) {}
})();
`;
