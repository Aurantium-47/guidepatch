import type { AnalysisResult, ImportedGuide } from '../domain';
import { requestSteps, validateAlignment } from './review';

export interface ServerStatus {
  provider: string; configured: boolean; enabled: boolean; model: string;
  remainingUsd: number; budgetUsd: number; phase?: string; liveCalls?: number;
}

export async function getStatus(): Promise<ServerStatus> {
  const r = await fetch('/api/status');
  if (!r.ok) throw new Error('The model service is not reachable. Local review is available.');
  return r.json();
}

export async function semanticAlign(oldGuide: ImportedGuide, newGuide: ImportedGuide, accessToken: string): Promise<AnalysisResult> {
  const r = await fetch('/api/align', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { 'X-Guidepatch-Token': accessToken } : {}) },
    body: JSON.stringify({ oldSteps: requestSteps(oldGuide), newSteps: requestSteps(newGuide) }), signal: AbortSignal.timeout(75000),
  });
  const data = await r.json();
  if (!r.ok) {
    const messages: Record<string, string> = { live_inference_disabled: 'Live alignment is not enabled. No model call was made.', unauthorized: 'Check the reviewer access code in Settings.', budget_exceeded: 'The available application budget has been reached.', rate_limited: 'Too many requests. Please wait before trying again.', invalid_alignment: 'The model returned incomplete step references. Your review is unchanged.', provider_error: 'The model service could not complete the request. Your review is unchanged.' };
    throw new Error(messages[data.error] ?? `Alignment could not complete (${r.status}). Your existing review is unchanged.`);
  }
  return { ...data, source: 'nebius', alignments: validateAlignment(data.alignments, oldGuide.steps, newGuide.steps) };
}
