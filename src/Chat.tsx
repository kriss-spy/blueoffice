import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  presentAgent,
  type OfficeAgent,
  type PendingRequest,
} from "../shared/office";
import { command } from "./api";
import { RequestCard } from "./RequestCard";

export function Chat({
  agent,
  connected,
  run,
  focusRequest,
  acting,
  settings,
  newConversation,
  visible = true,
}: {
  agent: OfficeAgent;
  connected: boolean;
  run: (action: string, body?: unknown) => Promise<void>;
  focusRequest?: { id: string };
  acting: boolean;
  settings: () => void;
  newConversation: () => Promise<void>;
  visible?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const savedPosition = useRef(readPosition(agent.id));
  const follow = useRef(savedPosition.current.follow);
  const savePosition = () => {
    if (!transcript.current?.getClientRects().length) return;
    savedPosition.current = {
      top: transcript.current.scrollTop,
      follow: follow.current,
    };
    try {
      localStorage.setItem(
        `blueoffice.chat-position.v1:${agent.id}`,
        JSON.stringify({
          top: transcript.current.scrollTop,
          follow: follow.current,
        }),
      );
    } catch {
      /* Browser storage may be disabled. */
    }
  };
  useEffect(() => {
    if (visible && transcript.current)
      transcript.current.scrollTop = follow.current
        ? transcript.current.scrollHeight
        : savedPosition.current.top;
  }, [visible]);
  useEffect(() => {
    window.addEventListener("pagehide", savePosition);
    return () => {
      savePosition();
      window.removeEventListener("pagehide", savePosition);
    };
  }, [agent.id]);
  const view = presentAgent(agent, connected);
  const pending = view.requests;
  const ready =
    connected && agent.lifecycle === "ready" && agent.freshness === "current";
  const conversationReason =
    !connected || agent.freshness !== "current"
      ? "Reconnect and verify this assistant before changing conversations."
      : !["ready", "stopped"].includes(agent.lifecycle)
        ? "Wait for this assistant to finish starting or stopping. Recover an uncertain runtime first."
        : agent.busy ||
            pending.length ||
            (agent.lifecycle === "ready" &&
              ["working", "tool", "interrupting", "unknown"].includes(
                agent.work,
              ))
          ? "Finish or explicitly stop the current task before starting a new conversation."
          : "";
  useEffect(() => {
    if (visible && follow.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [agent.messages, agent.requests, visible]);
  useEffect(() => {
    if (!visible || !focusRequest) return;
    const card = [
      ...(transcript.current?.querySelectorAll<HTMLElement>(
        "[data-request-id]",
      ) ?? []),
    ].find((el) => el.dataset.requestId === focusRequest.id);
    card?.focus();
    card?.scrollIntoView({ block: "nearest" });
  }, [focusRequest, visible]);
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
    const receipt = (await command(`/api/agents/${agent.id}/reply`, {
      requestId: request.id,
      commandId: crypto.randomUUID(),
      target: { epoch: request.epoch, sessionId: request.sessionId },
      answer,
    })) as { state: string; message: string };
    if (receipt.state === "failed" || receipt.state === "unknown")
      throw new Error(receipt.message);
  };
  const lock = async (
    request: PendingRequest,
    questionId: string,
    answer: string,
  ) => {
    const receipt = (await command(`/api/agents/${agent.id}/answer-question`, {
      requestId: request.id,
      commandId: crypto.randomUUID(),
      target: { epoch: request.epoch, sessionId: request.sessionId },
      questionId,
      answer,
    })) as { state: string; message: string };
    if (receipt.state === "failed" || receipt.state === "unknown")
      throw new Error(receipt.message);
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
            {view.label}
            {view.detail ? ` · ${view.detail}` : ""}
          </p>
        </div>
        <span className="chat-label">Conversation</span>
      </header>
      <div className="chat-agent-actions">
        <button
          className="primary"
          disabled={
            !connected ||
            acting ||
            ["starting", "ready", "stopping"].includes(agent.lifecycle)
          }
          onClick={() => void run("start")}
        >
          {agent.lifecycle === "starting"
            ? "Starting agent…"
            : agent.lifecycle === "ready"
              ? "Agent is running"
              : "Start agent"}
        </button>
        <button disabled={!connected} onClick={settings}>
          Agent settings
        </button>
        <button
          disabled={acting || sending || !!conversationReason}
          title={
            conversationReason ||
            "Start a fresh conversation with the same assistant, character and workstation."
          }
          onClick={() => {
            setError("");
            void newConversation().catch((err) =>
              setError((err as Error).message),
            );
          }}
        >
          New conversation
        </button>
        {conversationReason && (
          <small role="status">{conversationReason}</small>
        )}
        <details className="chat-agent-details">
          <summary>Agent details</summary>
          <dl>
            <dt>Workspace</dt>
            <dd>{agent.workspace}</dd>
            <dt>Model</dt>
            <dd>{agent.model}</dd>
            <dt>Character</dt>
            <dd>
              {agent.avatarId === "unassigned"
                ? "Not assigned yet"
                : agent.avatarId}
            </dd>
            <dt>Workstation</dt>
            <dd>{agent.deskId ?? "Not assigned yet"}</dd>
          </dl>
          <p>
            Interrupt ends a task. Stop closes this agent’s runtime. Closing
            this tab keeps it running.
          </p>
        </details>
      </div>
      <div
        className="transcript"
        ref={transcript}
        onScroll={() => {
          if (!visible || !transcript.current?.getClientRects().length) return;
          const el = transcript.current!;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          savePosition();
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
        {agent.requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            disabled={!ready}
            onReply={reply}
            onLock={lock}
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
      <details className="current-activity">
        <summary>
          Activity · {view.label}
          {view.detail ? ` · ${view.detail}` : ""}
        </summary>
        <div>
          {agent.messages
            .filter(
              (message) =>
                message.turnId === agent.turnId && message.role === "tool",
            )
            .slice(-5)
            .map((message) => (
              <p key={message.id}>
                {message.text} <small>({message.state})</small>
              </p>
            ))}
          {!agent.messages.some(
            (message) =>
              message.turnId === agent.turnId && message.role === "tool",
          ) && <p>No public tool activity in this turn.</p>}
        </div>
      </details>
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

function readPosition(id: string): { top: number; follow: boolean } {
  try {
    const value = JSON.parse(
      localStorage.getItem(`blueoffice.chat-position.v1:${id}`) ?? "null",
    );
    if (
      value &&
      Number.isFinite(value.top) &&
      value.top >= 0 &&
      typeof value.follow === "boolean"
    )
      return value;
  } catch {
    /* Restore the default following behavior if no valid checkpoint exists. */
  }
  return { top: 0, follow: true };
}
