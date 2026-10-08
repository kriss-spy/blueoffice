import { z } from "zod";
import type { PendingRequest, Question } from "./office.js";

const question = z
  .object({
    qid: z.string().min(1).max(200),
    question: z.string().min(1).max(32000),
    choices: z
      .array(z.string().min(1).max(16000))
      .max(20)
      .nullable()
      .optional(),
    multi_select: z.boolean().optional(),
  })
  .strict();
const params = z
  .object({
    session_id: z.string(),
    question: z.string().min(1).max(32000).nullable().optional(),
    choices: question.shape.choices,
    multi_select: z.boolean().nullable().optional(),
    questions: z.array(question).min(1).max(5).nullable().optional(),
    answers: z.record(z.string(), z.string().max(16000)).optional(),
  })
  .strict();

/** The installed Hermes clarify contract permits an Other answer for choice questions.
 * Unknown schemas fail closed instead of silently losing constraints or options. */
export function parseClarification(value: unknown) {
  const parsed = params.safeParse(value);
  if (!parsed.success) return undefined;
  const p = parsed.data;
  if (!p.questions && !p.question) return undefined;
  const questions: Question[] = (p.questions ?? []).map((q) => ({
    qid: q.qid,
    question: q.question,
    choices: q.choices ?? [],
    multiSelect: q.multi_select === true,
    allowFreeText: true,
    state: "open",
  }));
  if (new Set(questions.map((q) => q.qid)).size !== questions.length)
    return undefined;
  if (
    p.answers &&
    Object.keys(p.answers).some((id) => !questions.some((q) => q.qid === id))
  )
    return undefined;
  for (const q of questions) {
    const answer = p.answers?.[q.qid];
    if (answer !== undefined) {
      if (!validClarificationAnswer(q, answer)) return undefined;
      q.answer = answer;
      q.state = "locked";
    }
  }
  return {
    text: p.question ?? "",
    choices: p.choices ?? [],
    questions,
    multiSelect: p.multi_select === true,
    allowFreeText: true,
    responseSchema: "hermes.clarify.v1" as const,
  };
}

export function singleQuestion(request: PendingRequest): Question {
  return {
    qid: "single",
    question: request.text,
    choices: request.choices,
    multiSelect: request.multiSelect === true,
    allowFreeText: request.allowFreeText !== false,
    state: "open",
    answer: request.answer,
  };
}

export function validClarificationAnswer(
  q: Question,
  value: unknown,
): value is string {
  if (typeof value !== "string" || value.length > 16000 || !value.trim())
    return false;
  if (!q.multiSelect || !q.choices.length)
    return q.allowFreeText !== false || q.choices.includes(value);
  try {
    const answers: unknown = JSON.parse(value);
    return (
      Array.isArray(answers) &&
      answers.length > 0 &&
      answers.length <= 21 &&
      new Set(answers).size === answers.length &&
      answers.every(
        (a) =>
          typeof a === "string" &&
          a.trim().length > 0 &&
          (q.allowFreeText !== false || q.choices.includes(a)),
      )
    );
  } catch {
    return false;
  }
}
