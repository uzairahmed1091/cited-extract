"use client";

import { useEffect, useState } from "react";
import { Analytics as VercelAnalytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Marks a browser as the site owner's, so their own use doesn't count as traffic.
 *
 *   Open the site with ?notrack  -> this browser stops being counted
 *   Open the site with ?track    -> counting turns back on
 *
 * The flag lives in this browser's localStorage, so do it once on each device. It does two
 * jobs: page views from this browser are dropped before they reach Vercel Analytics, and
 * extraction requests are sent with `x-ce-owner: 1`, so the server stores them in
 * `extraction_events` with `owner = true` (see lib/runs.ts).
 */
const OWNER_FLAG = "ce-owner";

type Switch = "off" | "on" | null;

function applyUrlSwitch(): Switch {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("notrack")) {
      window.localStorage.setItem(OWNER_FLAG, "1");
      return "off";
    }
    if (params.has("track")) {
      window.localStorage.removeItem(OWNER_FLAG);
      return "on";
    }
  } catch {
    // Storage blocked (private mode, strict settings): nothing to remember.
  }
  return null;
}

// Read the URL once per page load. The effect below strips the parameter, React may run
// effects twice, and the first page view can be sent before any effect runs, so every
// reader goes through this and reuses the first answer.
let urlSwitch: Switch | undefined;
function readUrlSwitch(): Switch {
  if (urlSwitch === undefined) urlSwitch = applyUrlSwitch();
  return urlSwitch;
}

/** True in a browser the owner has marked with ?notrack. */
export function isOwner(): boolean {
  readUrlSwitch();
  try {
    return window.localStorage.getItem(OWNER_FLAG) === "1";
  } catch {
    return false; // storage blocked: treat as a visitor
  }
}

const beforeSend = (event: BeforeSendEvent) => (isOwner() ? null : event);

/** Cookieless page views and referrers, minus the owner's own visits. */
export function Analytics() {
  const [notice, setNotice] = useState<Switch>(null);

  useEffect(() => {
    const change = readUrlSwitch();
    if (!change) return;

    // Remove ?notrack / ?track from the address bar so it isn't copied into shared links.
    const url = new URL(window.location.href);
    url.searchParams.delete("notrack");
    url.searchParams.delete("track");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    // Deferred so the notice isn't set synchronously inside the effect.
    const show = setTimeout(() => setNotice(change), 0);
    const hide = setTimeout(() => setNotice(null), 5000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <>
      <VercelAnalytics beforeSend={beforeSend} />
      {notice ? (
        <div
          role="status"
          className="panel fixed right-4 bottom-4 left-4 z-[60] px-4 py-3 font-mono text-xs text-ink sm:left-auto sm:max-w-sm"
        >
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-mark align-middle" aria-hidden />
          {notice === "off"
            ? "Tracking off: page views and extractions from this browser won't be counted."
            : "Tracking on: page views and extractions from this browser will be counted again."}
        </div>
      ) : null}
    </>
  );
}
