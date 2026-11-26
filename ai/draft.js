// Tickmark Hybrid: drafting the question for another team. The case is turned into a short, redacted brief
// (facts and what is missing, no names or account numbers); the model drafts the question on this device,
// streamed, and suggests a classification as an enum. The person edits both; the rules and the person decide.
import { run, stream } from './hybrid.js';
import './redact.js';

const Redact = self.TickmarkRedact;

export const CLASSES = {
  timing: 'Timing or sync gap',
  'source-error': 'Suspected source error',
  business: 'Real business difference',
  insufficient: 'Not enough evidence',
};

// A redacted brief of the case: what is wrong, the facts on record, what is missing and who can supply it.
export function brief(c, x, recipientLabel) {
  const live = (c.evidence || []).filter((e) => !e.superseded);
  const facts = [];
  for (const e of live) for (const [k, v] of Object.entries(e.facts || {})) facts.push(`${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? v.toFixed(2) : v} (source: ${e.system})`);
  const lines = [
    `Case ${c.id}: ${c.title}.`,
    x ? `Open finding: ${x.title}.` : '',
    x && x.cause ? `Possible cause (not confirmed): ${x.cause}` : '',
    'Facts on record:', ...facts.slice(0, 12).map((f) => `- ${f}`),
    x && x.missing && x.missing.length ? `Still missing: ${x.missing.map((m) => m.what).join('; ')}.` : '',
    `What it holds up: ${c.affects || 'the case'}.`,
    `Recipient: ${recipientLabel}.`,
  ].filter(Boolean).join('\n');
  // names of people and firms on the case file are removed too, not only patterns
  return Redact.redact(lines, { known: [] });
}

// Stream a question to the recipient. Redacted text only; on device when the model is there.
export async function draftQuestion(c, x, recipientLabel, onText) {
  const b = brief(c, x, recipientLabel);
  const prompt = `You help a mortgage servicing officer ask another team one precise question.
Write the question to ${recipientLabel} in 2 to 3 short sentences: say exactly what you need them to confirm or decide, cite the facts that matter (amounts, dates, times), and say what it holds up. No greeting, no sign-off, no speculation. Keep tokens in square brackets such as [NAME_1] exactly as they are.

${b.text}`;
  const r = await stream({ task: `Draft question to ${recipientLabel}`, dataClass: 'redacted_text', prompt, onText });
  return { ...r, brief: b };
}

// Suggest a classification as an enum (structured output). A suggestion only.
export async function suggestClass(c, x) {
  const b = brief(c, x, 'the team');
  const r = await run({
    task: 'Suggest a classification', dataClass: 'redacted_text',
    schema: { type: 'object', properties: { classification: { type: 'string', enum: Object.keys(CLASSES) }, reason: { type: 'string' } }, required: ['classification', 'reason'] },
    prompt: `Classify this finance exception. timing = the records will agree once something posts or arrives; source-error = one record was entered wrong; business = the amounts really differ for a business reason; insufficient = not enough evidence to say. Give one short reason.\n\n${b.text}`,
  });
  const cls = r.json && CLASSES[r.json.classification] ? r.json.classification : 'insufficient';
  return { classification: cls, reason: (r.json && r.json.reason) || '', ranOn: r.ranOn, ms: r.ms };
}
