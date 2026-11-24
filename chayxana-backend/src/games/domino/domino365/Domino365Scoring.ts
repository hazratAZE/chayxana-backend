import type { Domino365Board } from "./Domino365Board.js";
import { getDomino365OpenEndsTotal } from "./Domino365Board.js";

export interface Domino365ScoreResult {
  points: number;
  openEndsTotal: number;
  reason: "opening" | "multiple_of_five" | "no_score";
}

export function calculateDomino365MoveScore(
  board: Domino365Board
): Domino365ScoreResult {
  if (board.tiles.length === 0) {
    throw new Error("Cannot calculate score for an empty board");
  }

  const openEndsTotal = getDomino365OpenEndsTotal(board);

  // Special opening rules
  if (board.tiles.length === 1) {
    const firstTile = board.tiles[0].tile;

    if (
      (firstTile.left === 0 && firstTile.right === 5) ||
      (firstTile.left === 5 && firstTile.right === 0)
    ) {
      return {
        points: 5,
        openEndsTotal,
        reason: "opening",
      };
    }

    if (firstTile.left === 5 && firstTile.right === 5) {
      return {
        points: 10,
        openEndsTotal,
        reason: "opening",
      };
    }

    return {
      points: 0,
      openEndsTotal,
      reason: "no_score",
    };
  }

  // Normal scoring: all active ends must total a positive multiple of 5.
  if (openEndsTotal > 0 && openEndsTotal % 5 === 0) {
    return {
      points: openEndsTotal,
      openEndsTotal,
      reason: "multiple_of_five",
    };
  }

  return {
    points: 0,
    openEndsTotal,
    reason: "no_score",
  };
}
