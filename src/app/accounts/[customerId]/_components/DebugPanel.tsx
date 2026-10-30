"use client";

import { useEffect, useState } from "react";
import { formatChannelType } from "@/lib/format";
import { displayError } from "@/lib/error-display";
import type { AutoApplyRulesResult, SearchNetworkSettingsResult } from "@/lib/google-ads";
import type { SpendByChannelType, CallTiming } from "../page";

/** Internal diagnostics for the health check — auto-apply rules, search
 * network settings, spend breakdown, and timing. Not meant for end users;
 * hidden behind Ctrl/Cmd+Shift+D so it doesn't show up in a Google OAuth
 * reviewer's walkthrough of the dashboard. */
export function DebugPanel({
  autoApplyResult,
  searchNetworkResult,
  spendByChannelType,
  durationMs,
  callTimings,
}: {
  autoApplyResult: AutoApplyRulesResult | null;
  searchNetworkResult: SearchNetworkSettingsResult | null;
  spendByChannelType: SpendByChannelType[];
  durationMs: number;
  callTimings: CallTiming[];
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={() => setVisible(false)}
    >
      <div
        style={{
          background: "#fff",
          color: "#111",
          borderRadius: 8,
          padding: 24,
          maxWidth: 480,
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Debug info</h2>
          <button
            type="button"
            onClick={() => setVisible(false)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: "1.2em" }}
            aria-label="Close debug panel"
          >
            &times;
          </button>
        </div>
        <p style={{ color: "#888", fontSize: "0.85em" }}>Ctrl/Cmd+Shift+D to toggle</p>

        {autoApplyResult && (
          <>
            <h3>Auto-apply recommendation rules</h3>
            {autoApplyResult.ok ? (
              autoApplyResult.rules.length > 0 ? (
                <p>
                  {autoApplyResult.rules.filter((rule) => rule.status === "ENABLED").length}{" "}
                  enabled,{" "}
                  {autoApplyResult.rules.filter((rule) => rule.status !== "ENABLED").length} not
                  enabled.
                </p>
              ) : (
                <p>No auto-apply rules configured for this account.</p>
              )
            ) : (
              <p style={{ color: "crimson" }}>{displayError(autoApplyResult.error)}</p>
            )}
          </>
        )}

        {searchNetworkResult &&
          (searchNetworkResult.ok ? (
            <p>
              {searchNetworkResult.campaigns.filter((c) => c.searchPartners || c.display).length}{" "}
              search campaigns have Display or Search Partners enabled.{" "}
              {searchNetworkResult.campaigns.filter((c) => c.searchPartners && c.display).length}{" "}
              have both enabled.
            </p>
          ) : (
            <p style={{ color: "crimson" }}>{displayError(searchNetworkResult.error)}</p>
          ))}

        {spendByChannelType.length > 0 && (
          <>
            <h3>Spend by campaign type</h3>
            <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 420 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 12px 4px 0", fontWeight: 600 }}>
                    Campaign type
                  </th>
                  <th style={{ textAlign: "right", padding: "4px 12px", fontWeight: 600 }}>Spend</th>
                  <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600 }}>% of spend</th>
                </tr>
              </thead>
              <tbody>
                {spendByChannelType.map((row) => (
                  <tr key={row.channelType} style={{ borderTop: "1px solid rgba(0, 0, 0, 0.1)" }}>
                    <td style={{ padding: "4px 12px 4px 0" }}>{formatChannelType(row.channelType)}</td>
                    <td style={{ textAlign: "right", padding: "4px 12px" }}>
                      ${(row.costMicros / 1_000_000).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 0" }}>{row.pct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p style={{ color: "#888", fontSize: "0.85em", marginTop: 16 }}>
          Health check calculated in {(durationMs / 1000).toFixed(2)}s.
        </p>

        {callTimings.length > 0 && (
          <details style={{ color: "#888", fontSize: "0.85em", marginTop: 4 }}>
            <summary style={{ cursor: "pointer" }}>Per-call timing breakdown</summary>
            <table style={{ borderCollapse: "collapse", marginTop: 8, maxWidth: 420 }}>
              <tbody>
                {[...callTimings]
                  .sort((a, b) => b.ms - a.ms)
                  .map((t) => (
                    <tr key={t.label}>
                      <td style={{ padding: "2px 12px 2px 0" }}>{t.label}</td>
                      <td style={{ textAlign: "right", padding: "2px 0" }}>{t.ms}ms</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  );
}
