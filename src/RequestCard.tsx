import { useState, type FormEvent } from "react";
import type { PendingRequest } from "../shared/office";

export function RequestCard({
  request,
  disabled,
  onReply,
}: {
  request: PendingRequest;
  disabled: boolean;
  onReply: (
    request: PendingRequest,
    answer: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const waiting = request.state === "delivered";
  const submit = async (answer: Record<string, unknown>) => {
    setSubmitting(true);
    setError("");
    try {
      await onReply(request, answer);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(
      request.questions.length ? { answers } : { answer: answers.single ?? "" },
    );
  };
  const questions = request.questions.length
    ? request.questions
    : [
        {
          qid: "single",
          question: request.text,
          choices: request.choices,
          multiSelect: false,
        },
      ];
  return (
    <section
      className={`request-card ${request.kind}`}
      aria-label={
        request.kind === "approval" ? "Permission request" : "Question request"
      }
    >
      <h3>
        <span aria-hidden="true">
          {request.kind === "approval" ? "◇" : "?"}
        </span>
        {request.kind === "approval"
          ? "Permission needed"
          : request.kind === "unsupported"
            ? "Private input needed"
            : "A question for you"}
      </h3>
      {request.kind !== "clarify" ? (
        <p className="request-text">{request.text}</p>
      ) : null}
      {waiting ? (
        <p role="status">Reply delivered. Waiting for confirmation…</p>
      ) : null}
      {request.kind === "clarify" ? (
        <form onSubmit={onSubmit}>
          {questions.map((q) => (
            <fieldset key={q.qid} disabled={disabled || submitting || waiting}>
              <legend>{q.question}</legend>
              {q.choices.length ? (
                <div className="choices">
                  {q.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={answers[q.qid] === choice}
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [q.qid]: choice,
                        }))
                      }
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="answer-label">
                {q.choices.length
                  ? "Your answer or another choice"
                  : "Your answer"}
                <input
                  required
                  value={answers[q.qid] ?? ""}
                  maxLength={16000}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      [q.qid]: e.target.value,
                    }))
                  }
                />
              </label>
            </fieldset>
          ))}
          <button
            className="primary"
            disabled={disabled || submitting || waiting}
          >
            {submitting ? "Sending answer…" : "Send answer"}
          </button>
        </form>
      ) : request.kind === "approval" ? (
        <div className="permission-choices">
          {request.choices.map((choice) => (
            <button
              key={choice}
              className={choice === "deny" ? "deny" : "primary"}
              disabled={disabled || submitting || waiting}
              onClick={() => void submit({ choice })}
            >
              {(
                {
                  once: "Allow once",
                  session: "Allow for session",
                  always: "Always allow",
                  deny: "Deny",
                } as Record<string, string>
              )[choice] ?? choice}
            </button>
          ))}
        </div>
      ) : (
        <p>Use Interrupt task to end this wait.</p>
      )}
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
