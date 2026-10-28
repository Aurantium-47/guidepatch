export function validateAlignments(data, input) {
  if (!data || !Array.isArray(data.alignments) || data.alignments.length > 160) throw new Error('invalid_model_alignment');
  const oldIds = new Set(input.oldSteps.map((step) => step.id));
  const newIds = new Set(input.newSteps.map((step) => step.id));
  const oldSeen = new Set();
  const newSeen = new Set();
  const kinds = ['unchanged', 'changed', 'moved', 'added', 'removed'];
  const alignments = data.alignments.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_model_alignment');
    const { oldId, newId, kind, reason, description, uncertainty } = item;
    if ((oldId !== null && typeof oldId !== 'string') || (newId !== null && typeof newId !== 'string') || (oldId === null && newId === null)) throw new Error('invalid_model_alignment');
    if (!kinds.includes(kind)) throw new Error('invalid_model_alignment');
    if ([reason, description, uncertainty].some((value) => typeof value !== 'string' || value.length > 2000)) throw new Error('invalid_model_alignment');
    if (oldId !== null) {
      if (!oldIds.has(oldId) || oldSeen.has(oldId)) throw new Error('model_step_reference_invalid');
      oldSeen.add(oldId);
    }
    if (newId !== null) {
      if (!newIds.has(newId) || newSeen.has(newId)) throw new Error('model_step_reference_invalid');
      newSeen.add(newId);
    }
    if (kind === 'added' ? oldId !== null || newId === null : kind === 'removed' ? newId !== null || oldId === null : oldId === null || newId === null) throw new Error('model_alignment_kind_mismatch');
    return { oldId, newId, kind, reason, description, uncertainty };
  });
  if (oldSeen.size !== oldIds.size || newSeen.size !== newIds.size) throw new Error('model_step_coverage_incomplete');
  return alignments;
}
