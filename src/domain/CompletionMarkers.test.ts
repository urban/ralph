import { assert, describe, it } from "@effect/vitest";

import {
  initialMarkerScanState,
  invocationCompletionMarker,
  markerScanTailLimit,
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
  it("detects both exact markers across every two-chunk split", () => {
    const output = `prefix ${invocationCompletionMarker} middle ${workflowCompletionMarker} suffix`;

    for (let split = 0; split <= output.length; split += 1) {
      const state = scanChunks([output.slice(0, split), output.slice(split)]);
      assert.isTrue(state.invocationComplete, `invocation marker split at ${split}`);
      assert.isTrue(state.workflowComplete, `workflow marker split at ${split}`);
    }
  });

  it("rejects case and formatting variants", () => {
    const state = scanChunks([
      "<promise>invocation_complete</promise>",
      "<promise> INVOCATION_COMPLETE </promise>",
      "<PROMISE>COMPLETE</PROMISE>",
    ]);

    assert.isFalse(state.invocationComplete);
    assert.isFalse(state.workflowComplete);
  });

  it("retains only the bounded marker recognition tail", () => {
    const state = scanMarkerChunk(initialMarkerScanState(), encoder.encode("x".repeat(100_000)));

    assert.isAtMost(state.tail.length, markerScanTailLimit);
  });
});
