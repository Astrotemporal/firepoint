"use client";

import Link from "next/link";
import { ENGLISH_ONLY_NOTICE, type PublicScreenLocalized } from "@/domain/public-screen-copy";
import { useSheet } from "./use-sheet";

/*
 * Public-homepage information drawer.
 *
 * A draggable bottom sheet on phones / side card on wider screens that replaces the
 * old static card. Shows source-aware UNAVAILABLE states for shelter status and
 * evacuation orders. Never shows an all-clear, live status, route or geolocation.
 *
 * The `shelterSnapshot` and `noticeSnapshot` props are typed future slots — they
 * accept verified, freshness-stamped server data when a real adapter lands.
 * Neither is populated in this PR. Untyped or mocked data must never be passed here.
 *
 * CSS uses `ev-pub-*` classes deliberately separate from `ev-sheet` / `ev-bar`,
 * so the prototype-gate tests stay clean.
 */

// ---------------------------------------------------------------------------
// Future verified-source types — not populated in this PR.
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot from a verified official open-shelter feed.
 *
 * IMPORTANT: `openCount === 0` does NOT mean no shelters are open.
 * Feed coverage is incomplete and per-record timestamps may be absent.
 * Zero is not all-clear.
 */
export type VerifiedShelterSnapshot = {
  /** Human-readable data source name, e.g. "FEMA NSS Open Shelters". */
  source: string;
  /** Canonical URL of the feed or feature service (for user reference). */
  sourceUrl: string;
  /** Publishing agency name, e.g. "FEMA". */
  issuer: string;
  /** ISO 8601 UTC string — when this snapshot was fetched. */
  fetchedAt: string;
  /** Human-readable coverage scope, e.g. "Los Angeles County". */
  coverage: string;
  /**
   * Shelters in the feed appearing open for the stated coverage area.
   * Zero is not all-clear: coverage is incomplete and records may be stale.
   */
  openCount: number;
};

/**
 * A point-in-time snapshot from a verified official evacuation notice / order feed.
 */
export type VerifiedNoticeSnapshot = {
  source: string;
  /** Canonical URL of the source layer or page (for user reference). */
  sourceUrl: string;
  /** Publishing agency, e.g. "LA County OES". */
  issuer: string;
  /** ISO 8601 UTC issued-at from the feed record, or null if unavailable. */
  issuedAt: string | null;
  /** ISO 8601 UTC — when this snapshot was fetched. */
  fetchedAt: string;
  /** Human-readable jurisdiction scope, e.g. "Glendale, CA". */
  jurisdiction: string;
  orderCount: number;
  warningCount: number;
};

// ---------------------------------------------------------------------------
// String constants — smoke-check and tests look for these verbatim.
// ---------------------------------------------------------------------------

/** Shown when no verified open-shelter feed has been loaded. */
export const SHELTER_UNAVAILABLE =
  "Shelter status unavailable — no verified open-shelter feed loaded";

/** Shown when no verified evacuation-notice feed has been loaded. */
export const EVAC_UNAVAILABLE =
  "Evacuation status unavailable — check issuing agency";

/** Always shown; reminds the user this is not an operational all-clear. */
export const NOT_ALL_CLEAR =
  "This is not an all-clear. Follow official sources. To report a fire, call 911.";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  /** Existing translated lines for a non-English visit; null on English. */
  localized?: PublicScreenLocalized | null;
  /**
   * Future slot: pass a freshness-stamped verified snapshot to show live
   * shelter count and source attribution instead of the unavailable message.
   * Must never be synthetic, mocked, or randomly generated.
   */
  shelterSnapshot?: VerifiedShelterSnapshot | null;
  /**
   * Future slot: pass a freshness-stamped verified snapshot to show live
   * evacuation notice count and source attribution.
   * Must never be synthetic, mocked, or randomly generated.
   */
  noticeSnapshot?: VerifiedNoticeSnapshot | null;
};

/**
 * Draggable bottom-sheet for the public homepage on phones;
 * a side card on wider screens.
 *
 * Peek (always visible): shelter row + evacuation-order row.
 * Half / Full: not-all-clear notice, official links, private-mark note.
 *
 * This component does NOT import any routing, geolocation, shelter-data or
 * directions module. Language: the status text and links are English-only.
 * If `localized` is supplied, two existing /prepare guide translations are
 * shown above the English text with an English-only notice, matching the
 * prior static card behaviour.
 */
export function PublicInfoDrawer({
  localized = null,
  shelterSnapshot = null,
  noticeSnapshot = null,
}: Props = {}) {
  const {
    snap,
    dragging,
    style,
    handleProps,
    sheetRef,
    innerRef,
    peekRef,
  } = useSheet();

  const shelterRow = shelterSnapshot === null ? (
    <span>{SHELTER_UNAVAILABLE}</span>
  ) : (
    <span>
      {shelterSnapshot.openCount === 0
        ? `0 shelters listed (${shelterSnapshot.coverage}) — zero is not all-clear`
        : `${shelterSnapshot.openCount} shelter${shelterSnapshot.openCount !== 1 ? "s" : ""} listed — ${shelterSnapshot.issuer}`}
      {" "}<a className="ev-pub-source-link" href={shelterSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
        source ↗
      </a>
    </span>
  );

  const evacRow = noticeSnapshot === null ? (
    <span>{EVAC_UNAVAILABLE}</span>
  ) : (
    <span>
      {noticeSnapshot.orderCount} order{noticeSnapshot.orderCount !== 1 ? "s" : ""}
      {noticeSnapshot.warningCount > 0
        ? `, ${noticeSnapshot.warningCount} warning${noticeSnapshot.warningCount !== 1 ? "s" : ""}`
        : ""}{" "}
      — {noticeSnapshot.issuer}
      {" "}<a className="ev-pub-source-link" href={noticeSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
        source ↗
      </a>
    </span>
  );

  return (
    <section
      ref={sheetRef}
      style={style}
      lang="en"
      aria-label="Status and official sources"
      className={`ev-pub-sheet ev-pub-sheet-${snap}${dragging ? " ev-pub-sheet-dragging" : ""}`}
    >
      {/* Drag handle — keyboard-accessible, cycles peek → half → full. */}
      <button
        type="button"
        className="ev-pub-handle"
        aria-label="Expand status panel"
        {...handleProps}
      >
        <span aria-hidden="true" />
      </button>

      <div className="ev-pub-scroll">
        <div ref={innerRef} className="ev-pub-inner">
          {/* Peek section — always visible above the fold on phones. */}
          <div ref={peekRef} className="ev-pub-peek">
            {localized && (
              <>
                <p lang={localized.locale} className="ev-public-status-localized">
                  <strong>{localized.urgentCall}</strong>{" "}
                  <Link href="/prepare">{localized.guideTitle}</Link>
                </p>
                <p className="ev-public-status-english-only">{ENGLISH_ONLY_NOTICE}</p>
              </>
            )}
            <p className="ev-pub-row">
              <span className="ev-pub-row-icon" aria-hidden="true">🏠</span>
              {shelterRow}
            </p>
            <p className="ev-pub-row">
              <span className="ev-pub-row-icon" aria-hidden="true">⚠️</span>
              {evacRow}
            </p>
          </div>

          {/* Body section — visible when expanded to half or full. */}
          <div className="ev-pub-body">
            <p className="ev-pub-not-all-clear" role="status">{NOT_ALL_CLEAR}</p>
            {/* Static map-symbol legend: explanation only, no live data or map badges. */}
            <div className="ev-pub-legend" aria-label="Map symbol guide">
              <p className="ev-pub-legend-title">Map symbols</p>
              <ul className="ev-pub-legend-list">
                <li><span className="ev-pub-legend-swatch ev-pub-legend-grey" aria-hidden="true" /><span>Grey dashed ring — private mark, this device only, not a report</span></li>
                <li><span className="ev-pub-legend-swatch ev-pub-legend-yellow" aria-hidden="true" /><span>Yellow circle — 3+ unreviewed reports · may include repeat submissions · not a confirmed hazard</span></li>
                <li><span className="ev-pub-legend-swatch ev-pub-legend-red" aria-hidden="true" /><span>Red — agency-confirmed active source notice</span></li>
              </ul>
            </div>
            <div className="ev-pub-links">
              <Link href="/prepare#sources-title">Official sources</Link>
              <Link href="/prepare">Ready, Set, Go guide</Link>
            </div>
            {shelterSnapshot && (
              <p className="ev-note">
                Shelter data: {shelterSnapshot.issuer} via {shelterSnapshot.source}.
                Last fetched: {shelterSnapshot.fetchedAt}.
                Coverage: {shelterSnapshot.coverage}.
                Zero shelters listed does not mean none are open.
              </p>
            )}
            {noticeSnapshot && (
              <p className="ev-note">
                Evacuation data: {noticeSnapshot.issuer} via {noticeSnapshot.source}.
                Last fetched: {noticeSnapshot.fetchedAt}.
                Verify directly with the issuing agency.
              </p>
            )}
            <p className="ev-note">
              The flame places a private mark on this device only. Marks are not
              reports, fire locations or evacuation zones.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}