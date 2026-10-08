import { useEffect, useState } from "react";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LoadingManager, Mesh } from "three";
import {
  assetKey,
  type AssetRef,
  type CharacterPack,
} from "../../shared/assets";
import { disposeAvatar, type AvatarAsset } from "./avatar";

export async function characterRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Character could not be loaded.");
  return data;
}
export async function loadCharacter(ref: AssetRef): Promise<AvatarAsset> {
  const base = `/api/characters/${assetKey(ref)}`;
  const pack = await characterRequest<CharacterPack>(base);
  const urls = new Map<string, string>();
  const buffers = new Map<string, ArrayBuffer>();
  try {
    // Check the entire pinned pack before exposing its bytes to the renderer.
    for (const file of pack.manifest.files) {
      const response = await fetch(`${base}/files/${file.path}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error ?? "Character file missing.",
        );
      const buffer = await response.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (buffer.byteLength !== file.bytes || hash !== file.sha256)
        throw new Error(
          "Character hash mismatch. Reimport the assigned version.",
        );
      buffers.set(file.path, buffer);
      urls.set(
        file.path,
        URL.createObjectURL(
          new Blob([buffer], {
            type:
              response.headers.get("content-type") ??
              "application/octet-stream",
          }),
        ),
      );
    }
    const model = pack.manifest.model;
    const directory = model.includes("/")
      ? model.slice(0, model.lastIndexOf("/") + 1)
      : "";
    const manager = new LoadingManager();
    manager.setURLModifier((url) => {
      // GLTFLoader creates its own blob URLs for validated embedded images.
      if (url.startsWith("blob:")) return url;
      const mapped = urls.get(url);
      if (!mapped) throw new Error("Undeclared character dependency.");
      return mapped;
    });
    const gltf = await new GLTFLoader(manager).parseAsync(
      buffers.get(model)!,
      directory,
    );
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = false;
      }
    });
    return {
      gltf,
      anchors: pack.manifest.anchors,
      scale: pack.manifest.coordinates.scale,
      offset: pack.manifest.coordinates.offset,
      hash: ref.sha256,
      bounds: [],
      clips: pack.manifest.clips,
    };
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

type Loaded = { asset?: AvatarAsset; error?: string };
type Entry = {
  users: number;
  result: Promise<Loaded>;
  value?: Loaded;
  disposal?: ReturnType<typeof setTimeout>;
};
const cache = new Map<string, Entry>();
function acquire(ref: AssetRef) {
  const key = assetKey(ref);
  let entry = cache.get(key);
  if (!entry) {
    entry = { users: 0, result: Promise.resolve({}) };
    const current = entry;
    current.result = loadCharacter(ref)
      .then(
        (asset) => ({ asset }),
        (error) => ({ error: (error as Error).message }),
      )
      .then((result) => {
        current.value = result;
        return result;
      });
    cache.set(key, current);
  }
  clearTimeout(entry.disposal);
  entry.users++;
  return {
    result: entry.result,
    release: () => {
      entry!.users--;
      if (entry!.users) return;
      entry!.disposal = setTimeout(() => {
        if (entry!.users) return;
        if (cache.get(key) === entry) cache.delete(key);
        void entry!.result.then((result) => {
          if (result.asset) disposeAvatar(result.asset.gltf);
        });
      }, 0);
    },
  };
}
export function retryMissingCharacters() {
  for (const [key, entry] of cache) if (entry.value?.error) cache.delete(key);
  window.dispatchEvent(new Event("blueoffice-character-refresh"));
}

/** A single load per unique pack, with independent skeletons/mixers per Avatar. */
export function useCharacters(refs: (AssetRef | null | undefined)[]) {
  const refsKey = JSON.stringify([
    ...new Map(
      refs.filter((r): r is AssetRef => !!r).map((r) => [assetKey(r), r]),
    ).values(),
  ]);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry((n) => n + 1);
    window.addEventListener("blueoffice-character-refresh", refresh);
    return () =>
      window.removeEventListener("blueoffice-character-refresh", refresh);
  }, []);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  useEffect(() => {
    let active = true;
    const unique: AssetRef[] = JSON.parse(refsKey);
    setLoaded((previous) =>
      Object.fromEntries(
        unique.flatMap((ref) =>
          previous[assetKey(ref)]?.asset
            ? [[assetKey(ref), previous[assetKey(ref)]]]
            : [],
        ),
      ),
    );
    const handles = unique.map((ref) => {
      const handle = acquire(ref);
      void handle.result.then((value) => {
        if (active)
          setLoaded((previous) => ({ ...previous, [assetKey(ref)]: value }));
      });
      return handle;
    });
    return () => {
      active = false;
      handles.forEach((h) => h.release());
    };
  }, [refsKey, retry]);
  return loaded;
}
