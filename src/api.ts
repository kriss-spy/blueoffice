import type { Snapshot } from "../shared/office";
let csrf = "";
export async function session(): Promise<Snapshot> {
  const response = await fetch("/api/session");
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not connect to BlueOffice.");
  csrf = data.csrf;
  return data.snapshot;
}
export async function command(
  path: string,
  body: unknown = {},
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BlueOffice-CSRF": csrf },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The command failed.");
  return data;
}
