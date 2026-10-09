import type { CSSProperties } from "react";

const paths = {
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" />
    </>
  ),
  add: (
    <>
      <path d="M12 4v16M4 12h16" />
    </>
  ),
  office: (
    <>
      <path d="M4 21V5l8-3 8 3v16M2 21h20M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1" />
    </>
  ),
  history: (
    <>
      <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="8" cy="7" r="3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  furniture: (
    <>
      <path d="M5 13V5h14v8M3 13h18v5H3zM5 18v3m14-3v3M8 5v8m8-8v8" />
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-3a7 7 0 0 1 14 0v3" />
      <ellipse cx="12" cy="2" rx="6" ry="1" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  home: (
    <>
      <path d="m3 11 9-8 9 8M6 9v12h12V9M10 21v-7h4v7" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};
export function GameIcon({
  name,
  style,
}: {
  name: keyof typeof paths;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
