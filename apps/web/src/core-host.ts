import { configureCore } from '@mimik/core/env';
import type { Settings, SettingsKey } from '@mimik/core/guides/types';

const words: Record<string, string> = {
  'meta.locale': 'en', 'guide.untitled': 'Untitled guide', 'export.stepLabel': 'Step $1',
  'export.stepsCount': '$1 steps', 'export.createdLabel': 'Created $1', 'export.sourceLabel': 'Source: $1',
  'export.madeWith': 'GuidePatch · Built on Mimik', 'export.guide': 'Guide',
  'export.created': 'Created', 'export.steps': 'Steps', 'export.source': 'Source',
  'export.overview': 'Overview', 'export.contents': 'Contents', 'export.step': 'Step',
};

configureCore({
  client: 'extension',
  t: (key, args = []) => args.reduce((s, arg, i) => s.replaceAll(`$${i + 1}`, arg), words[key] ?? key.split('.').at(-1) ?? key),
  assetUrl: (path) => path,
  storage: {
    get: async <K extends SettingsKey>(keys: readonly K[]) => {
      const defaults: Partial<Settings> = { brandLogo: { dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=', width: 1, height: 1 }, brandColor: '#c9593e', brandFooter: 'Reviewed with GuidePatch', brandAttribution: false };
      return Object.fromEntries(keys.map(key => [key, defaults[key]])) as Partial<Pick<Settings, K>>;
    },
    set: async () => {},
  },
});
