import { configureUi } from '@mimik/ui/env';
import { getRecordableTabs } from '@/capture/recordable-tabs';
import { startInsertRecording } from '@/capture/start-insert-recording';
import {
  createTab,
  focusWindow,
  getActiveTab,
  getTab,
  openSidebar,
  queryTabs,
  requestHostPermissions,
  updateTab,
} from '@/lib/browser-api';
import { sendMessage } from '@/lib/messaging';

configureUi({
  tabs: {
    active: () => getActiveTab() as never,
    get: (tabId) => getTab(tabId) as never,
    query: (query) => queryTabs(query as never) as never,
    create: (url) => createTab({ url }) as never,
    update: (tabId, props) => updateTab(tabId, props as never) as never,
    focusWindow: (windowId) => focusWindow(windowId) as never,
    recordable: () => getRecordableTabs() as never,
    startInsertRecording: (guideId, index, tabId) => startInsertRecording(guideId, index, tabId) as never,
  },
  panel: {
    open: () => openSidebar(),
    requestHostPermissions: () => requestHostPermissions(),
  },
  send: (name, payload) => sendMessage(name as never, payload as never) as never,
});
