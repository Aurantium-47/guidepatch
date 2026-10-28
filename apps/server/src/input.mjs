function clean(value) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:bearer\s+)[a-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{8,})\b/gi, '[credential]')
    .replace(/\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|key|password|secret|authorization)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]');
}

export function prepareInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_request');
  const result = {};
  for (const field of ['oldSteps', 'newSteps']) {
    const steps = body[field];
    if (!Array.isArray(steps) || steps.length > 80) throw new Error('expected_at_most_80_steps_per_guide');
    const ids = new Set();
    result[field] = steps.map((step) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error('invalid_step');
      if (typeof step.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(step.id) || ids.has(step.id)) throw new Error('invalid_or_duplicate_step_id');
      ids.add(step.id);
      if (!Number.isInteger(step.index) || step.index < 0 || step.index > 10_000) throw new Error('invalid_step_index');
      if (typeof step.description !== 'string' || step.description.length > 1600) throw new Error('invalid_step_description');
      if (typeof step.action !== 'string' || step.action.length > 120) throw new Error('invalid_step_action');
      if (typeof step.url !== 'string' || step.url.length > 2048) throw new Error('invalid_step_url');
      if (step.label !== undefined && (typeof step.label !== 'string' || step.label.length > 300)) throw new Error('invalid_step_label');
      let url = '';
      if (step.url) {
        try {
          const parsed = new URL(step.url);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
          url = clean(`${parsed.origin}${parsed.pathname}`);
        } catch {
          throw new Error('invalid_step_url');
        }
      }
      return {
        id: step.id,
        index: step.index,
        description: clean(step.description),
        action: clean(step.action),
        url,
        ...(step.label !== undefined ? { label: clean(step.label) } : {}),
      };
    });
  }
  if (result.oldSteps.length + result.newSteps.length === 0) throw new Error('empty_guides');
  return result;
}
