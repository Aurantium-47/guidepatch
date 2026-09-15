import { useEffect, useState } from 'react';
import LibraryContent from '@mimik/ui/fullview/LibraryContent';
import GuideContent from '@mimik/ui/fullview/GuideContent';
import { TooltipProvider } from '@mimik/ui/components/ui/tooltip';
import SettingsPanel from './SettingsPanel';
import TopBar from './TopBar';

export default function App() {
  const [guideId, setGuideId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      const match = window.location.hash.match(/^#guide\/(.+)$/);
      setGuideId(match ? match[1] : null);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <TopBar onSettings={() => setSettingsOpen(true)} />
        {settingsOpen ? (
          <main className="flex-1">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </main>
        ) : guideId ? (
          <main className="flex-1 py-10 px-6">
            <div className="mx-auto max-w-[720px]">
              <GuideContent guideId={guideId} />
            </div>
          </main>
        ) : (
          <main className="flex-1 p-8 max-w-6xl mx-auto w-full">
            <LibraryContent category="all" />
          </main>
        )}
      </div>
    </TooltipProvider>
  );
}
