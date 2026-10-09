import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GameIcon } from "./GameIcon";

const windowStack: HTMLDialogElement[] = [];
function raiseWindow(node: HTMLDialogElement) {
  const index = windowStack.indexOf(node);
  if (index !== -1) windowStack.splice(index, 1);
  windowStack.push(node);
  windowStack.forEach((window, i) => {
    window.style.zIndex = String(30 + i);
  });
}

/** A movable, non-modal in-room window. The office remains interactive. */
export function GameWindow({
  title,
  close,
  children,
  className = "",
  open = true,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  open?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    if (!open) {
      ref.current?.close();
      return;
    }
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const node = ref.current!;
    node.show();
    raiseWindow(node);
    node.focus();
    return () => {
      const index = windowStack.indexOf(node);
      if (index !== -1) windowStack.splice(index, 1);
      node.close();
      const opener = previousFocus.current;
      // React restores pre-commit focus after layout cleanup. Return focus after
      // that commit, without stealing it from a newly opened window/request.
      queueMicrotask(() => {
        const top = windowStack.at(-1);
        if (top) {
          if (!top.contains(document.activeElement))
            top.focus({ preventScroll: true });
        } else if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        windowStack.at(-1) !== ref.current
      )
        return;
      if (document.querySelector("dialog:modal")) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, close]);
  useEffect(() => {
    const reset = () => setPosition(undefined);
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, []);
  return (
    <dialog
      ref={ref}
      className={`game-window ${className}`}
      aria-label={title}
      tabIndex={-1}
      style={
        position ? { ...position, transform: "none", margin: 0 } : undefined
      }
      onPointerDownCapture={() => {
        if (ref.current) raiseWindow(ref.current);
      }}
    >
      <header
        className="game-window-title"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          const bounds = ref.current!.getBoundingClientRect();
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: bounds.left,
            top: bounds.top,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || !ref.current) return;
          setPosition({
            left: Math.max(
              8,
              Math.min(
                innerWidth - ref.current.offsetWidth - 8,
                drag.current.left + event.clientX - drag.current.x,
              ),
            ),
            top: Math.max(
              8,
              Math.min(
                innerHeight - ref.current.offsetHeight - 8,
                drag.current.top + event.clientY - drag.current.y,
              ),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <h2>{title}</h2>
        <button aria-label={`Close ${title}`} onClick={close}>
          <GameIcon name="close" />
        </button>
      </header>
      <div className="game-window-content">{children}</div>
    </dialog>
  );
}
