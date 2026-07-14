import { assert, describe, it } from "@effect/vitest";

import {
  initialMarkerScanState,
  invocationCompletionMarker,
  markerScanTailLimit,
  resolveMarkerScanState,
  scanMarkerChunk,
  workflowCompletionMarker,
} from "./CompletionMarkers";

const encoder = new TextEncoder();

const scanChunks = (chunks: ReadonlyArray<string>) =>
  chunks.reduce(
    (state, chunk) => scanMarkerChunk(state, encoder.encode(chunk)),
    initialMarkerScanState(),
  );

describe("completion marker scanning", () => {
  it("detects a trailing standalone marker block across every two-chunk split", () => {
    const output = `native stdout\n${invocationCompletionMarker}\n${workflowCompletionMarker}\n`;

    for (let split = 0; split <= output.length; split += 1) {
      const markers = resolveMarkerScanState(
        scanChunks([output.slice(0, split), output.slice(split)]),
      );
      assert.isTrue(markers.invocationComplete, `invocation marker split at ${split}`);
      assert.isTrue(markers.workflowComplete, `workflow marker split at ${split}`);
    }
  });

  it("detects trailing standalone markers in either order", () => {
    const invocationFirst = resolveMarkerScanState(
      scanChunks([`${invocationCompletionMarker}\n${workflowCompletionMarker}\n`]),
    );
    const workflowFirst = resolveMarkerScanState(
      scanChunks([`${workflowCompletionMarker}\n${invocationCompletionMarker}\n`]),
    );

    assert.isTrue(invocationFirst.invocationComplete);
    assert.isTrue(invocationFirst.workflowComplete);
    assert.isTrue(workflowFirst.invocationComplete);
    assert.isTrue(workflowFirst.workflowComplete);
  });

  it("rejects case and formatting variants", () => {
    const markers = resolveMarkerScanState(
      scanChunks([
        "<promise>invocation_complete</promise>\n",
        "<promise> INVOCATION_COMPLETE </promise>\n",
        "<PROMISE>COMPLETE</PROMISE>\n",
      ]),
    );

    assert.isFalse(markers.invocationComplete);
    assert.isFalse(markers.workflowComplete);
  });

  it("rejects embedded marker text", () => {
    const markers = resolveMarkerScanState(
      scanChunks([
        `prefix ${invocationCompletionMarker} suffix\n`,
        `prefix ${workflowCompletionMarker} suffix\n`,
      ]),
    );

    assert.isFalse(markers.invocationComplete);
    assert.isFalse(markers.workflowComplete);
  });

  it("ignores marker lines when later stdout follows them", () => {
    const markers = resolveMarkerScanState(
      scanChunks([
        `${invocationCompletionMarker}\n`,
        `${workflowCompletionMarker}\n`,
        "summary after markers\n",
      ]),
    );

    assert.isFalse(markers.invocationComplete);
    assert.isFalse(markers.workflowComplete);
  });

  it("accepts trailing blank lines after the final marker block", () => {
    const markers = resolveMarkerScanState(
      scanChunks(["prefix\n", `${workflowCompletionMarker}\n${invocationCompletionMarker}\n\n`]),
    );

    assert.isTrue(markers.invocationComplete);
    assert.isTrue(markers.workflowComplete);
  });

  it("retains only the bounded marker recognition tail", () => {
    const state = scanMarkerChunk(initialMarkerScanState(), encoder.encode("x".repeat(100_000)));

    assert.isAtMost(state.tail.length, markerScanTailLimit);
  });
});
