import { useEffect, useState } from 'react';
import { i18n } from '@mimik/core/env';
import type { CaptureSettings } from '../main/capture/settings';
import { Button } from '@mimik/ui/components/ui/button';

const STYLES: CaptureSettings['cursorStyle'][] = ['arrow', 'hand', 'dot'];

export default function SettingsPanel({ onClose }: { onClose(): void }) {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);

  useEffect(() => {
    window.mimik.capture.settings.get().then(setSettings);
  }, []);

  const save = async (patch: Partial<CaptureSettings>) => {
    setSettings(await window.mimik.capture.settings.set(patch));
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-8">
      <div className="mb-6 flex items-center">
        <h1 className="mr-auto text-lg font-semibold text-foreground">{i18n.t('settings_title')}</h1>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {i18n.t('common_close')}
        </Button>
      </div>

      {settings && (
        <section className="mb-8 rounded-xl border border-border bg-secondary/40 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {i18n.t('desktop_capturingSection')}
          </h2>

          <label className="mb-3 flex items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={settings.showCursor}
              onChange={(e) => save({ showCursor: e.target.checked })}
            />
            {i18n.t('desktop_showCursor')}
          </label>

          <label className="mb-3 flex items-center gap-3 text-sm text-foreground">
            <span className="mr-auto">{i18n.t('desktop_pointerStyle')}</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={settings.cursorStyle}
              disabled={!settings.showCursor}
              onChange={(e) => save({ cursorStyle: e.target.value as CaptureSettings['cursorStyle'] })}
            >
              {STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 flex items-center gap-3 text-sm text-foreground">
            <span className="mr-auto">{i18n.t('desktop_screenshotDelay')}</span>
            <input
              type="number"
              min={0}
              max={2000}
              step={50}
              className="w-24 rounded-md border border-border bg-background px-2 py-1"
              value={settings.screenshotDelayMs}
              onChange={(e) => save({ screenshotDelayMs: Number(e.target.value) })}
            />
            <span className="text-muted-foreground">{i18n.t('desktop_milliseconds')}</span>
          </label>

          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={settings.captureOutsideClicks}
              onChange={(e) => save({ captureOutsideClicks: e.target.checked })}
            />
            {i18n.t('desktop_captureOutside')}
          </label>
        </section>
      )}

    </div>
  );
}
