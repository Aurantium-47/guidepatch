import { useEffect, useState } from 'react';
import { ImageOff, LoaderCircle } from 'lucide-react';
import type { Screenshot as Shot } from '@mimik/core/guides/types';
import { screenshotUrl } from '../lib/guide-files';

export function Screenshot({ shot, focus = false, alt }: { shot?: Shot; focus?: boolean; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true, made: string | null = null;
    setUrl(null); setError(false);
    screenshotUrl(shot, focus).then(value => { made = value; if (active) setUrl(value); else if (value) URL.revokeObjectURL(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [shot, focus]);
  if (!shot || error) return <div className="shot-empty"><ImageOff size={24}/><span>{error ? 'This image could not be rendered.' : 'No screenshot recorded for this step.'}</span></div>;
  if (!url) return <div className="shot-empty"><LoaderCircle size={23} className="spin"/><span>Preparing screenshot…</span></div>;
  return <img className="screenshot" src={url} alt={alt}/>;
}
