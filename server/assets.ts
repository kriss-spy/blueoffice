import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, posix } from "node:path";
import validator from "gltf-validator";
import {
  assetPath,
  assetKey,
  importPackSchema,
  mappedClips,
  reviewSchema,
  type AssetRef,
  type CharacterPack,
} from "../shared/assets.js";
import { OfficeStore } from "./store.js";

export class AssetError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const hash = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
// Canonical JSON pins metadata as well as every declared byte, regardless of key order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
function reject(message: string): never {
  throw new AssetError(message);
}
function parseGlb(bytes: Buffer) {
  if (
    bytes.length < 28 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    reject("Invalid or incomplete glTF 2.0 binary.");
  let json: any,
    binary: Buffer | undefined,
    offset = 12,
    count = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) reject("Truncated GLB chunk.");
    const length = bytes.readUInt32LE(offset),
      type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length)
      reject("Invalid GLB chunk length.");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (count === 0 && type === 0x4e4f534a) {
      try {
        json = JSON.parse(chunk.toString("utf8"));
      } catch {
        reject("Invalid GLB JSON.");
      }
    } else if (count === 1 && type === 0x004e4942) binary = chunk;
    else reject("Only JSON and BIN GLB chunks are supported.");
    offset += 8 + length;
    count++;
  }
  if (!json || json.asset?.version !== "2.0")
    reject("Missing glTF 2.0 document.");
  return { json, binary };
}
function imagePixels(bytes: Buffer) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i++] !== 0xff) break;
      while (bytes[i] === 0xff) i++;
      const marker = bytes[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      const size = bytes.readUInt16BE(i);
      if (size < 2 || i + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker))
        return [bytes.readUInt16BE(i + 5), bytes.readUInt16BE(i + 3)];
      i += size;
    }
  }
  reject("Images must be valid PNG or baseline/progressive JPEG.");
}

/** Imports never read caller-supplied host paths. Only checked bytes enter content storage. */
export class CharacterRegistry {
  private importing = false;
  constructor(
    private store: OfficeStore,
    private root: string,
  ) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  private objectPath(digest: string) {
    return resolve(this.root, digest);
  }
  private bytes(file: { sha256: string; bytes: number }) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(this.objectPath(file.sha256));
    } catch {
      throw new AssetError(
        "Character file missing. Reimport this exact pack to restore it.",
        409,
      );
    }
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256)
      throw new AssetError(
        "Character file hash mismatch. Reimport this exact pack to restore it.",
        409,
      );
    return bytes;
  }
  get(ref: AssetRef) {
    const pack = this.store
      .characterPacks()
      .find((pack) => assetKey(pack.ref) === assetKey(ref));
    if (!pack)
      throw new AssetError(
        "Character version missing or mismatched. Import the assigned version.",
        404,
      );
    for (const file of pack.manifest.files) this.bytes(file);
    return pack;
  }
  list(): CharacterPack[] {
    return this.store.characterPacks().map((pack) => {
      try {
        this.get(pack.ref);
        return pack;
      } catch (error) {
        return { ...pack, diagnostic: (error as Error).message };
      }
    });
  }
  file(ref: AssetRef, path: string) {
    const pack = this.get(ref);
    const file = pack.manifest.files.find((file) => file.path === path);
    if (!file) throw new AssetError("File is not declared by this pack.", 404);
    return this.bytes(file);
  }
  review(input: unknown) {
    const review = reviewSchema.parse(input),
      pack = this.get(review.ref);
    const clips = mappedClips(pack.manifest);
    if (
      review.clips.length !== clips.length ||
      !clips.every((clip) => review.clips.includes(clip))
    )
      reject("Review every mapped clip before making the character usable.");
    const next = {
      ...pack,
      review: {
        ...review,
        at: new Date().toISOString(),
        scene: "office-v1" as const,
      },
    };
    this.store.saveCharacterPack(next);
    return next;
  }
  assignable(ref: AssetRef) {
    const pack = this.get(ref);
    if (!pack.review)
      throw new AssetError(
        "Preview and review this character before assigning it.",
        409,
      );
    return pack;
  }
  async import(input: unknown) {
    if (this.importing)
      throw new AssetError(
        "Another character import is in progress. Try again shortly.",
        409,
      );
    this.importing = true;
    try {
      return await this.validateAndSave(input);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError)
        throw new AssetError("Malformed character pack or GLB structure.");
      throw error;
    } finally {
      this.importing = false;
    }
  }
  private async validateAndSave(input: unknown) {
    const { manifest, files } = importPackSchema.parse(input);
    if (
      files.length !== manifest.files.length ||
      new Set(files.map((f) => f.path)).size !== files.length
    )
      reject("Pack files must exactly match the manifest.");
    const contents = new Map<string, Buffer>();
    let total = 0;
    for (const file of files) {
      if (!/\.(glb|bin|png|jpg|jpeg)$/.test(file.path))
        reject(
          "Only GLB, BIN, PNG and JPEG files are supported; scripts are forbidden.",
        );
      if (
        !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) ||
        file.base64.length % 4 !== 0
      )
        reject("Invalid file encoding.");
      const bytes = Buffer.from(file.base64, "base64"),
        declared = manifest.files.find((f) => f.path === file.path);
      total += bytes.length;
      if (total > 32_000_000) reject("Character packs must be at most 32 MB.");
      if (
        !declared ||
        bytes.length !== declared.bytes ||
        hash(bytes) !== declared.sha256
      )
        reject(`Size or SHA-256 mismatch: ${file.path}`);
      contents.set(file.path, bytes);
    }
    const model = contents.get(manifest.model)!;
    const { json, binary } = parseGlb(model);
    const dependency = (uri: string) => {
      if (!assetPath.safeParse(uri).success)
        reject(
          "Remote, encoded or traversing resource references are forbidden.",
        );
      const path = posix.join(posix.dirname(manifest.model), uri);
      const bytes = contents.get(path);
      if (!bytes) reject(`Undeclared local dependency: ${path}`);
      return bytes;
    };
    const walk = (value: any, depth = 0) => {
      if (depth > 40) reject("GLB document nesting exceeds the limit.");
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (key === "uri") {
          if (typeof item !== "string") reject("Invalid resource URI.");
          dependency(item);
        }
        if (
          key === "extensions" &&
          item &&
          Object.keys(item).some((name) => name !== "KHR_materials_unlit")
        )
          reject("This pack uses an unsupported glTF extension.");
        walk(item, depth + 1);
      }
    };
    walk(json);
    if (
      [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])].some(
        (name) => name !== "KHR_materials_unlit",
      )
    )
      reject("This pack uses an unsupported glTF extension.");
    if (
      !Array.isArray(json.meshes) ||
      !json.meshes.length ||
      json.meshes.length > 128 ||
      (json.nodes?.length ?? 0) > 2048 ||
      (json.animations?.length ?? 0) > 128 ||
      (json.accessors?.length ?? 0) > 20000
    )
      reject("Character complexity exceeds supported limits.");
    if (
      (json.accessors ?? []).some(
        (a: any) =>
          !Number.isSafeInteger(a.count) || a.count < 1 || a.count > 2_000_000,
      )
    )
      reject("Accessor size exceeds supported limits.");
    const components: Record<string, number> = {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4,
      MAT2: 4,
      MAT3: 9,
      MAT4: 16,
    };
    if (
      (json.accessors ?? []).reduce(
        (sum: number, a: any) => sum + a.count * (components[a.type] ?? 16) * 4,
        0,
      ) > 128_000_000
    )
      reject("Decoded accessor data exceeds 128 MB.");
    const names = (json.animations ?? []).map((clip: any) => clip.name);
    if (
      !mappedClips(manifest).every(
        (name) => names.filter((n: string) => n === name).length === 1,
      )
    )
      reject("Every mapped animation must exist with a unique name.");
    let pixels = 0;
    for (const image of json.images ?? []) {
      let data: Buffer;
      if (image.uri) data = dependency(image.uri);
      else {
        const view = json.bufferViews?.[image.bufferView],
          buffer = json.buffers?.[view?.buffer];
        if (!view || !buffer) reject("Invalid image buffer view.");
        const source = buffer.uri ? dependency(buffer.uri) : binary;
        if (
          !source ||
          !Number.isSafeInteger(view.byteLength) ||
          (view.byteOffset ?? 0) < 0 ||
          (view.byteOffset ?? 0) + view.byteLength > source.length
        )
          reject("Image buffer is out of bounds.");
        data = source.subarray(
          view.byteOffset ?? 0,
          (view.byteOffset ?? 0) + view.byteLength,
        );
      }
      const [width, height] = imagePixels(data);
      pixels += width * height;
      if (
        !width ||
        !height ||
        width > 4096 ||
        height > 4096 ||
        pixels > 32_000_000
      )
        reject(
          "Texture dimensions exceed the 4096px / 32 million pixel pack limit.",
        );
    }
    const report = await validator.validateBytes(new Uint8Array(model), {
      maxIssues: 100,
      ignoredIssues: ["UNUSED_OBJECT"],
      externalResourceFunction: async (uri: string) =>
        new Uint8Array(dependency(uri)),
    });
    if (report.issues.truncated)
      reject(
        "GLB validation exceeded the diagnostic limit. Fix reported issues before importing.",
      );
    if (report.issues.numErrors)
      reject(
        `GLB validation failed (${report.issues.numErrors} errors): ${report.issues.messages.find((m: any) => m.severity === 0)?.message ?? "invalid glTF"}`,
      );
    const ref = {
      assetId: manifest.assetId,
      version: manifest.version,
      sha256: hash(canonical(manifest)),
    };
    const existing = this.store
      .characterPacks()
      .find(
        (p) => p.ref.assetId === ref.assetId && p.ref.version === ref.version,
      );
    if (existing && existing.ref.sha256 !== ref.sha256)
      throw new AssetError(
        "Asset IDs and versions are immutable. Use a new version for changed content or metadata.",
        409,
      );
    // All validation is complete before touching the registry or any assignment.
    for (const file of manifest.files) {
      const path = this.objectPath(file.sha256),
        temporary = `${path}.import`;
      writeFileSync(temporary, contents.get(file.path)!, { mode: 0o600 });
      renameSync(temporary, path);
    }
    const pack: CharacterPack = {
      ref,
      manifest,
      warnings: report.issues.numWarnings,
      ...(existing?.review ? { review: existing.review } : {}),
    };
    this.store.saveCharacterPack(pack);
    return pack;
  }
}
