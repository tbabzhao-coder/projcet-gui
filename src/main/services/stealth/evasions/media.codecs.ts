/**
 * Media Codecs Evasion
 *
 * Fix Chromium not reporting "probably" to codecs like videoEl.canPlayType('video/mp4; codecs="avc1.42E01E"').
 * Chromium doesn't support proprietary codecs, only Chrome does.
 * Ported from puppeteer-extra-plugin-stealth (MIT License).
 */

export const mediaCodecsEvasion = `
(function() {
  try {
    const parseInput = arg => {
      const [mime, codecStr] = arg.trim().split(';');
      let codecs = [];
      if (codecStr && codecStr.includes('codecs="')) {
        codecs = codecStr
          .trim()
          .replace('codecs="', '')
          .replace('"', '')
          .trim()
          .split(',')
          .filter(x => !!x)
          .map(x => x.trim());
      }
      return {
        mime,
        codecStr,
        codecs
      };
    };

    const canPlayType = {
      apply: function(target, ctx, args) {
        if (!args || !args.length) {
          return target.apply(ctx, args);
        }
        const { mime, codecs } = parseInput(args[0]);
        // This specific mp4 codec is missing in Chromium
        if (mime === 'video/mp4') {
          if (codecs.includes('avc1.42E01E')) {
            return 'probably';
          }
        }
        // This mimetype is only supported if no codecs are specified
        if (mime === 'audio/x-m4a' && !codecs.length) {
          return 'maybe';
        }
        // This mimetype is only supported if no codecs are specified
        if (mime === 'audio/aac' && !codecs.length) {
          return 'probably';
        }
        // Everything else as usual
        return target.apply(ctx, args);
      }
    };

    utils.replaceWithProxy(
      HTMLMediaElement.prototype,
      'canPlayType',
      canPlayType
    );
  } catch (err) {}
})();
`;
