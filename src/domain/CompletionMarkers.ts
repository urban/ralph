export const invocationCompletionMarker = "<promise>INVOCATION_COMPLETE</promise>";
export const workflowCompletionMarker = "<promise>COMPLETE</promise>";

const encoder = new TextEncoder();
const invocationMarkerBytes = encoder.encode(invocationCompletionMarker);
const workflowMarkerBytes = encoder.encode(workflowCompletionMarker);
const retainedTailLength = Math.max(invocationMarkerBytes.length, workflowMarkerBytes.length) - 1;

export interface MarkerScanState {
  readonly invocationComplete: boolean;
  readonly workflowComplete: boolean;
  readonly tail: Uint8Array;
}

export const initialMarkerScanState = (): MarkerScanState => ({
  invocationComplete: false,
  workflowComplete: false,
  tail: new Uint8Array(0),
});

const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
};

const containsBytes = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  if (needle.length > haystack.length) {
    return false;
  }

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }

  return false;
};

export const scanMarkerChunk = (state: MarkerScanState, chunk: Uint8Array): MarkerScanState => {
  const searchable = concatBytes(state.tail, chunk);
  const tailStart = Math.max(0, searchable.length - retainedTailLength);

  return {
    invocationComplete:
      state.invocationComplete || containsBytes(searchable, invocationMarkerBytes),
    workflowComplete: state.workflowComplete || containsBytes(searchable, workflowMarkerBytes),
    tail: searchable.slice(tailStart),
  };
};

export const markerScanTailLimit = retainedTailLength;
