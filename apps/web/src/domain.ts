import type { Guide, Step, Screenshot } from '@mimik/core/guides/types';

export interface ImportedGuide {
  guide: Guide;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
  fileName: string;
}

export type ChangeKind = 'unchanged' | 'changed' | 'moved' | 'added' | 'removed';
export interface Alignment {
  oldId: string | null;
  newId: string | null;
  kind: ChangeKind;
  reason: string;
  description: string;
  uncertainty: string;
  moved?: boolean;
  imageChanged?: boolean;
}
export interface ReviewRow extends Alignment {
  id: string;
  decision: 'pending' | 'accept' | 'reject';
  editedDescription?: string;
  noteAnchorOldId?: string | null;
  notePosition?: 'before' | 'after';
}
export interface AnalysisResult {
  source: 'local' | 'nebius';
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  estimatedCostUsd?: number;
  alignments: Alignment[];
}
export type OrderChoice = 'original' | 'latest';
export interface Workspace {
  oldGuide: ImportedGuide;
  newGuide: ImportedGuide;
  rows: ReviewRow[];
  analysis: AnalysisResult;
  order: OrderChoice;
  title: string;
  savedAt: number;
}
