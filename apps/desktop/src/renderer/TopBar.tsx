import { Circle, Crop, Settings } from 'lucide-react';
import { i18n } from '@mimik/core/env';
import { Button } from '@mimik/ui/components/ui/button';

export default function TopBar({ onSettings }: { onSettings(): void }) {
  return (
    <header className="flex items-center gap-2 border-b border-border bg-background px-6 py-3">
      <span className="mr-auto text-sm font-semibold text-foreground">{i18n.t('app_name')}</span>

      <Button variant="ghost" size="sm" onClick={() => window.mimik.capture.edit()}>
        <Crop className="size-4" />
        {i18n.t('desktop_captureArea')}
      </Button>

      <Button variant="ghost" size="sm" onClick={onSettings}>
        <Settings className="size-4" />
        {i18n.t('settings_title')}
      </Button>

      <Button size="sm" onClick={() => window.mimik.capture.arm()}>
        <Circle className="size-3 fill-current" />
        {i18n.t('desktop_record')}
      </Button>
    </header>
  );
}
