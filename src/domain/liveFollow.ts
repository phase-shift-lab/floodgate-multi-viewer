export interface LivePositionUpdate {
  ply: number;
  hasNewMoves: boolean;
}

export function updateLivePosition(
  currentPly: number,
  previousLength: number,
  nextLength: number,
  followingLatest: boolean,
): LivePositionUpdate {
  const length = Math.max(0, nextLength);
  if (followingLatest || currentPly === Number.MAX_SAFE_INTEGER) {
    return { ply: length, hasNewMoves: false };
  }

  const ply = Math.max(0, Math.min(currentPly, length));
  return {
    ply,
    hasNewMoves: length > previousLength && ply < length,
  };
}
