import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  attention,
  status,
  type OfficeAgent,
  type PendingRequest,
} from "../shared/office";
import { command } from "./api";
import { RequestCard } from "./RequestCard";

export function Chat({
  agent,
  connected,
  run,
}: {
  agent: OfficeAgent;
  connected: boolean;
  run: (action: string, body?: unknown) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const pending = attention(agent);
  const ready =
    connected && agent.lifecycle === "ready" && agent.freshness === "current";
  useEffect(() => {
    if (follow.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [agent.messages, agent.requests]);
  const target = { epoch: agent.epoch!, sessionId: agent.liveSessionId! };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError("");
    const commandId = crypto.randomUUID();
    try {
      // A command ID lives for this submission only; reconnect never invokes this handler.
      const receipt = (await command(`/api/agents/${agent.id}/prompt`, {
        commandId,
        target,
        text: draft,
      })) as { state: string; message: string };
      if (receipt.state === "failed" || receipt.state === "unknown")
        setError(receipt.message);
      setDraft("");
    } catch (err) {
      setError(
        `${(err as Error).message} Check the command history before trying again.`,
      );
    } finally {
      setSending(false);
    }
  };
  const reply = async (
    request: PendingRequest,
    answer: Record<string, unknown>,
  ) => {
    await command(`/api/agents/${agent.id}/reply`, {
      requestId: request.id,
      commandId: crypto.randomUUID(),
      target: { epoch: request.epoch, sessionId: request.sessionId },
      answer,
    });
  };
  return (
    <section
      className="chat-panel"
      aria-label={`Conversation with ${agent.name}`}
    >
      <header className="chat-header">
        <div className="mini-avatar" aria-hidden="true">
          {agent.name.slice(0, 1)}
        </div>
        <div>
          <h2>{agent.name}</h2>
          <p>
            {connected ? status(agent) : "Connection lost — status unknown"}
          </p>
        </div>
        <span className="chat-label">Conversation</span>
      </header>
      <div
        className="transcript"
        ref={transcript}
        onScroll={() => {
          const el = transcript.current!;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {agent.messages.length === 0 ? (
          <div className="conversation-empty">
            <span aria-hidden="true">✧</span>
            <h3>A little space for good work.</h3>
            <p>
              {agent.lifecycle === "ready"
                ? "Send a task to begin. Questions and permission requests will appear right here."
                : "Start this agent, then give it a task. Your conversations stay with the same assistant."}
            </p>
          </div>
        ) : null}
        {agent.conversations.map((conversation) => (
          <section
            key={conversation.epoch}
            className="conversation-group"
            aria-label={
              conversation.epoch === agent.epoch
                ? "Current conversation"
                : "Earlier conversation"
            }
          >
            <p className="conversation-boundary">
              {conversation.epoch === agent.epoch
                ? "Current conversation"
                : "Earlier conversation"}{" "}
              · {new Date(conversation.createdAt).toLocaleString()}
            </p>
            {conversation.epoch === agent.epoch &&
            !agent.messages.some((m) => m.epoch === conversation.epoch) ? (
              <p className="conversation-note">
                A new conversation is ready. Earlier messages are kept here for
                reference and are not included in this task’s context.
              </p>
            ) : null}
            {agent.messages
              .filter((m) => m.epoch === conversation.epoch)
              .map((message) => (
                <article
                  className={`message ${message.role}`}
                  key={message.id}
                  aria-label={`${message.role} message`}
                >
                  <div className="message-label">
                    {message.role === "user"
                      ? "You"
                      : message.role === "tool"
                        ? "Tool activity"
                        : agent.name}
                    <time dateTime={message.at}>
                      {new Date(message.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>
                    {message.text ||
                      (message.state === "streaming" ? "Working…" : "")}
                  </p>
                  {["pending", "failed", "unknown", "interrupted"].includes(
                    message.state,
                  ) ? (
                    <small>{message.state}</small>
                  ) : null}
                </article>
              ))}
          </section>
        ))}
        {pending.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            disabled={!ready}
            onReply={reply}
          />
        ))}
      </div>
      {agent.error ? (
        <p role="status" className="agent-error">
          {agent.error}
        </p>
      ) : null}
      <form className="composer" onSubmit={send}>
        <label htmlFor="prompt">Message {agent.name}</label>
        <textarea
          id="prompt"
          placeholder={
            pending.length
              ? "Answer the request above to continue"
              : "What would you like to work on?"
          }
          value={draft}
          maxLength={32000}
          disabled={!ready || agent.busy || pending.length > 0 || sending}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
        />
        <div className="composer-footer">
          <span>
            {agent.busy
              ? "One task at a time"
              : ready
                ? "Ready when you are"
                : "Start the agent to send a task"}
          </span>
          <button
            className="primary"
            disabled={
              !ready ||
              agent.busy ||
              pending.length > 0 ||
              !draft.trim() ||
              sending
            }
          >
            {sending ? "Sending…" : "Send task"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="inline-error">
            {error}
          </p>
        ) : null}
      </form>
      <footer className="chat-controls">
        <button
          disabled={!ready || (!agent.busy && !pending.length)}
          onClick={() => void run("interrupt", { target })}
        >
          Interrupt task
        </button>
        <button
          disabled={
            !connected || !["ready", "starting"].includes(agent.lifecycle)
          }
          onClick={() => void run("stop")}
        >
          Stop agent
        </button>
        <details>
          <summary>Command history</summary>
          {agent.receipts.length ? (
            <ul>
              {agent.receipts
                .slice(-8)
                .reverse()
                .map((receipt) => (
                  <li key={receipt.id}>
                    <strong>
                      {receipt.action}: {receipt.state}
                    </strong>
                    <br />
                    {receipt.message}
                  </li>
                ))}
            </ul>
          ) : (
            <p>No commands yet.</p>
          )}
        </details>
      </footer>
    </section>
  );
}
