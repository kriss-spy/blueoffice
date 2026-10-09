import { useEffect, useRef, useState } from "react";
import {
  SceneMotionController,
  type MotionIntent,
  type SceneActor,
} from "../../shared/scene-motion";
import type { LayoutPlacement } from "../../shared/layout";
export function useSceneMotion(
  intents: MotionIntent[],
  placements: LayoutPlacement[],
  paused: boolean,
) {
  const controller = useRef(new SceneMotionController()),
    latest = useRef({ intents, placements });
  latest.current = { intents, placements };
  const [actors, setActors] = useState<Record<string, SceneActor>>({});
  const active = useRef(false);
  const publish = (next: Record<string, SceneActor>) => {
    active.current = Object.values(next).some((a) => a.walking);
    setActors(next);
  };
  const signature = JSON.stringify([intents, placements]);
  useEffect(() => {
    publish(
      controller.current.update(
        latest.current.intents,
        latest.current.placements,
        0,
      ),
    );
  }, [signature]);
  useEffect(() => {
    if (paused) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        seconds = (now - previous) / 1000;
      previous = now;
      if (!active.current) return;
      publish(
        controller.current.update(
          latest.current.intents,
          latest.current.placements,
          seconds,
        ),
      );
    }, 50);
    return () => clearInterval(timer);
  }, [paused]);
  return actors;
}
