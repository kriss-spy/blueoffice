import { approvalLabel, type ApprovalChoice } from "../shared/approval";
import { useRef, useState, type FormEvent } from "react";
import type { PendingRequest, Question } from "../shared/office";
import {
  singleQuestion,
  validClarificationAnswer,
} from "../shared/clarification";

type Submit = (
  request: PendingRequest,
  answer: Record<string, unknown>,
) => Promise<void>;
export function RequestCard({
  request,
  disabled,
  onReply,
  onLock,
}: {
  request: PendingRequest;
  disabled: boolean;
  onReply: Submit;
  onLock: (
    request: PendingRequest,
    questionId: string,
    answer: string,
  ) => Promise<void>;
}) {
  const section = useRef<HTMLElement>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const terminal = !["open", "delivered"].includes(request.state);
  const waiting = request.state === "delivered";
  const blocked =
    disabled ||
    submitting ||
    waiting ||
    terminal ||
    request.freshness === "unknown" ||
    request.questions.some(
      (q) => q.state === "pending" || q.state === "unknown",
    );
  const submit = async (action: () => Promise<void>) => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
      section.current?.focus({ preventScroll: true });
    }
  };
  const questions = request.questions.length
    ? request.questions
    : [singleQuestion(request)];
  const answerFor = (q: Question) =>
    q.state === "locked"
      ? (q.answer ?? "")
      : (answers[q.qid] ?? q.answer ?? "");
  const set = (qid: string, value: string) =>
    setAnswers((current) => ({ ...current, [qid]: value }));
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    const remaining = questions.filter((q) => q.state !== "locked");
    if (remaining.some((q) => !validClarificationAnswer(q, answerFor(q)))) {
      setError("Answer each remaining question before sending.");
      return;
    }
    void submit(() =>
      onReply(
        request,
        request.questions.length
          ? {
              answers: Object.fromEntries(
                remaining.map((q) => [q.qid, answerFor(q)]),
              ),
            }
          : { answer: answerFor(questions[0]) },
      ),
    );
  };
  return (
    <section
      ref={section}
      tabIndex={-1}
      data-request-id={request.id}
      className={`request-card ${request.kind}`}
      aria-label={
        request.kind === "approval" ? "Permission request" : "Question request"
      }
    >
      <h3>
        <span aria-hidden="true">
          {request.kind === "approval" ? (
            <svg
              width="20"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2 20 5v6c0 5-5 9-8 11-3-2-8-6-8-11V5Z" />
              <path d="M9 11h6v5H9zM10 11V9a2 2 0 0 1 4 0v2" />
            </svg>
          ) : (
            "?"
          )}
        </span>
        {request.kind === "approval"
          ? "Permission needed"
          : request.kind === "unsupported"
            ? "Unsupported input"
            : "A question for you"}
      </h3>
      {request.kind !== "clarify" ? (
        <p className="request-text">{request.text}</p>
      ) : null}
      {request.kind === "approval" ? (
        request.decision ? (
          <p className="permission-decision" role="status">
            Decision recorded:{" "}
            <strong>{approvalLabel[request.decision.choice]}</strong>.
            {request.decision.delivery === "unknown"
              ? " Delivery is unknown; it will not be sent again automatically."
              : request.decision.delivery === "pending"
                ? " Sending…"
                : " Reply delivered."}
          </p>
        ) : (
          <p role="status">
            {request.state === "open"
              ? "Permission pending. Choose one of the actions below."
              : "No decision recorded in BlueOffice."}
          </p>
        )
      ) : null}
      {terminal ? (
        <p role="status">
          {request.state === "resolved"
            ? "Hermes confirmed this request is closed."
            : request.reason || "This request is no longer available."}
        </p>
      ) : null}
      {request.freshness === "unknown" && !terminal ? (
        <p role="status">
          Request status is unknown. Your known request and replies are
          retained; sending is disabled.
        </p>
      ) : null}
      {waiting ? (
        <p role="status">
          Reply delivered. Waiting for Hermes to confirm closure…
        </p>
      ) : null}
      {request.kind === "clarify" ? (
        <form onSubmit={onSubmit}>
          {questions.map((q) => (
            <fieldset key={q.qid} disabled={blocked || q.state === "locked"}>
              <legend>{q.question}</legend>
              <AnswerInput
                question={q}
                value={answerFor(q)}
                onChange={(value) => set(q.qid, value)}
              />
              {q.state === "locked" ? (
                <p role="status">Answer confirmed by Hermes.</p>
              ) : q.state === "pending" ? (
                <p role="status">Sending this answer…</p>
              ) : q.state === "unknown" ? (
                <p role="status">Answer delivery is unknown.</p>
              ) : null}
              {request.questions.length > 1 &&
              typeof request.frameId === "string" &&
              !terminal ? (
                <button
                  type="button"
                  disabled={
                    blocked ||
                    q.state === "locked" ||
                    !validClarificationAnswer(q, answerFor(q))
                  }
                  onClick={() =>
                    void submit(() => onLock(request, q.qid, answerFor(q)))
                  }
                >
                  {q.state === "locked"
                    ? "Answer locked"
                    : "Confirm this answer"}
                </button>
              ) : null}
            </fieldset>
          ))}
          {!terminal ? (
            <button className="primary" disabled={blocked}>
              {submitting ? "Sending answer…" : "Send answer"}
            </button>
          ) : null}
        </form>
      ) : request.kind === "approval" ? (
        <div
          className="permission-choices"
          role="group"
          aria-label="Permission decisions"
        >
          {request.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              className={choice === "deny" ? "deny" : "primary"}
              disabled={blocked}
              onClick={() => void submit(() => onReply(request, { choice }))}
            >
              {approvalLabel[choice as ApprovalChoice]}
            </button>
          ))}
        </div>
      ) : (
        <p>
          This input cannot be entered in BlueOffice. Use Interrupt task to end
          this wait.
        </p>
      )}
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function AnswerInput({
  question: q,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const multi = q.multiSelect && q.choices.length > 0;
  let selected: string[] = [];
  if (multi) {
    try {
      selected = JSON.parse(value || "[]") as string[];
    } catch {
      /* Old unsupported draft. */
    }
  }
  const other = multi
    ? selected.filter((s) => !q.choices.includes(s)).join(", ")
    : q.choices.includes(value)
      ? ""
      : value;
  return (
    <>
      {q.choices.length ? (
        <div className="choices">
          {q.choices.map((choice, index) => (
            <label className="clarify-choice" key={index}>
              <input
                type={multi ? "checkbox" : "radio"}
                name={`choice-${q.qid}`}
                checked={multi ? selected.includes(choice) : value === choice}
                onChange={() =>
                  onChange(
                    multi
                      ? JSON.stringify(
                          selected.includes(choice)
                            ? selected.filter((s) => s !== choice)
                            : [...selected, choice],
                        )
                      : choice,
                  )
                }
              />
              {choice}
            </label>
          ))}
        </div>
      ) : null}
      {q.allowFreeText !== false ? (
        <label className="answer-label">
          {q.choices.length ? "Other answer" : "Your answer"}
          <input
            value={other}
            maxLength={15000}
            onChange={(e) =>
              onChange(
                multi
                  ? JSON.stringify([
                      ...selected.filter((s) => q.choices.includes(s)),
                      ...(e.target.value ? [e.target.value] : []),
                    ])
                  : e.target.value,
              )
            }
          />
        </label>
      ) : null}
    </>
  );
}
