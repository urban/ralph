export const invocationCompletionMarker = "<promise>INVOCATION_COMPLETE</promise>";
export const workflowCompletionMarker = "<promise>COMPLETE</promise>";

const decoder = new TextDecoder();
const retainedTailLength = 4096;

export interface MarkerScanState {
  readonly tail: Uint8Array;
}

export const initialMarkerScanState = (): MarkerScanState => ({
  tail: new Uint8Array(0),
});

const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
};

export const scanMarkerChunk = (state: MarkerScanState, chunk: Uint8Array): MarkerScanState => {
  const searchable = concatBytes(state.tail, chunk);
  const tailStart = Math.max(0, searchable.length - retainedTailLength);

  return {
    tail: searchable.slice(tailStart),
  };
};

const trimCarriageReturn = (line: string): string =>
  line.endsWith("\r") ? line.slice(0, -1) : line;

const isMarkerLine = (line: string): boolean =>
  line === invocationCompletionMarker || line === workflowCompletionMarker;

export const resolveMarkerScanState = (state: MarkerScanState) => {
  const lines = decoder.decode(state.tail).split("\n").map(trimCarriageReturn);
  let index = lines.length - 1;

  while (index >= 0) {
    const line = lines.at(index);

    if (line === undefined || line !== "") {
      break;
    }

    index -= 1;
  }

  let invocationComplete = false;
  let workflowComplete = false;

  while (index >= 0) {
    const line = lines.at(index);

    if (line === undefined || !isMarkerLine(line)) {
      break;
    }

    invocationComplete = invocationComplete || line === invocationCompletionMarker;
    workflowComplete = workflowComplete || line === workflowCompletionMarker;
    index -= 1;
  }

  return {
    invocationComplete,
    workflowComplete,
  };
};

export const markerScanTailLimit = retainedTailLength;
