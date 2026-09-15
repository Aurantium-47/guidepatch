import { configureCore } from '@mimik/core/env';
import type { Settings, SettingsKey } from '@mimik/core/guides/types';

configureCore({
  t: (key) => key,
  assetUrl: (path) => new URL(path, document.baseURI).href,
  storage: {
    get: async <K extends SettingsKey>(keys: readonly K[]) => {
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) out[key] = JSON.parse(raw);
      }
      return out as Partial<Pick<Settings, K>>;
    },
    set: async (items: Partial<Settings>) => {
      for (const [key, value] of Object.entries(items)) window.localStorage.setItem(key, JSON.stringify(value));
    },
  },
});
