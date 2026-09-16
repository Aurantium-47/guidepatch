import { configureUi } from '@mimik/ui/env';

const unsupported = async (): Promise<never> => {
  throw new Error('this action needs the browser extension');
};

configureUi({
  tabs: {
    active: async () => null,
    get: async () => null,
    query: async () => [],
    create: async () => null,
    update: async () => null,
    focusWindow: async () => undefined,
    recordable: async () => [],
    startInsertRecording: unsupported,
  },
  panel: {
    open: () => undefined,
    requestHostPermissions: async () => false,
  },
  send: unsupported,
});
