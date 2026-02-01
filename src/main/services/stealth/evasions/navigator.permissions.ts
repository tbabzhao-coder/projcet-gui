/**
 * Navigator Permissions Evasion
 *
 * Fix Notification.permission behaving weirdly in headless mode.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const navigatorPermissionsEvasion = `
(function() {
  try {
    const isSecure = document.location.protocol.startsWith('https');

    // In headful on secure origins the permission should be "default", not "denied"
    if (isSecure) {
      utils.replaceGetterWithProxy(Notification, 'permission', {
        apply() {
          return 'default';
        }
      });
    }

    // On insecure origins in headful the state is "denied",
    // whereas in headless it's "prompt"
    if (!isSecure) {
      const handler = {
        apply(target, ctx, args) {
          const param = (args || [])[0];

          const isNotifications =
            param && param.name && param.name === 'notifications';
          if (!isNotifications) {
            return utils.cache.Reflect.apply(target, ctx, args);
          }

          return Promise.resolve(
            Object.setPrototypeOf(
              {
                state: 'denied',
                onchange: null
              },
              PermissionStatus.prototype
            )
          );
        }
      };
      utils.replaceWithProxy(Permissions.prototype, 'query', handler);
    }
  } catch (err) {}
})();
`;
