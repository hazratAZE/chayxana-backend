import type { DominoTile } from "../shared/DominoTile.js";

export interface Domino365OpenEnd {
  id: string;
  value: number;
  sourceTileId: string;
  countsForSpinnerActivation: boolean;
}

export interface Domino365DoubleCandidate {
  tileId: string;
  value: number;
  connectedSides: number;
}

export interface Domino365Spinner {
  tileId: string;
  value: number;
  activatedAtTileCount: number;
}

export interface Domino365PlacedTile {
  tile: DominoTile;
  connectedEndId: string | null;
  matchedValue: number | null;
  freeValue: number | null;
}

export interface Domino365Board {
  tiles: Domino365PlacedTile[];
  openEnds: Domino365OpenEnd[];
  doubleCandidates: Record<string, Domino365DoubleCandidate>;
  spinner: Domino365Spinner | null;
  nextEndNumber: number;
}

export function createDomino365Board(): Domino365Board {
  return {
    tiles: [],
    openEnds: [],
    doubleCandidates: {},
    spinner: null,
    nextEndNumber: 1,
  };
}

function createOpenEnd(
  board: Domino365Board,
  value: number,
  sourceTileId: string,
  countsForSpinnerActivation: boolean
): Domino365OpenEnd {
  return {
    id: `end-${board.nextEndNumber++}`,
    value,
    sourceTileId,
    countsForSpinnerActivation,
  };
}

function cloneBoard(board: Domino365Board): Domino365Board {
  return {
    tiles: board.tiles.map((item) => ({
      ...item,
      tile: { ...item.tile },
    })),
    openEnds: board.openEnds.map((end) => ({ ...end })),
    doubleCandidates: Object.fromEntries(
      Object.entries(board.doubleCandidates).map(([id, candidate]) => [
        id,
        { ...candidate },
      ])
    ),
    spinner: board.spinner ? { ...board.spinner } : null,
    nextEndNumber: board.nextEndNumber,
  };
}

function validateTile(tile: DominoTile): void {
  if (
    !Number.isInteger(tile.left) ||
    !Number.isInteger(tile.right) ||
    tile.left < 0 ||
    tile.left > 6 ||
    tile.right < 0 ||
    tile.right > 6
  ) {
    throw new Error("Invalid domino tile");
  }
}

export function canPlaceDomino365Tile(
  board: Domino365Board,
  tile: DominoTile,
  endId?: string
): boolean {
  if (board.tiles.length === 0) {
    return endId === undefined;
  }

  if (!endId) return false;

  const end = board.openEnds.find((item) => item.id === endId);

  if (!end) return false;

  return tile.left === end.value || tile.right === end.value;
}

export function placeDomino365Tile(
  board: Domino365Board,
  tile: DominoTile,
  endId?: string
): Domino365Board {
  validateTile(tile);

  const next = cloneBoard(board);
  const isDouble = tile.left === tile.right;

  // First tile
  if (next.tiles.length === 0) {
    if (endId !== undefined) {
      throw new Error("First tile does not require an end ID");
    }

    next.tiles.push({
      tile: { ...tile },
      connectedEndId: null,
      matchedValue: null,
      freeValue: null,
    });

    if (isDouble) {
      next.doubleCandidates[tile.id] = {
        tileId: tile.id,
        value: tile.left,
        connectedSides: 0,
      };
    }

    next.openEnds.push(
      createOpenEnd(next, tile.left, tile.id, isDouble),
      createOpenEnd(next, tile.right, tile.id, isDouble)
    );

    return next;
  }

  if (!endId) {
    throw new Error("An open end must be selected");
  }

  const endIndex = next.openEnds.findIndex(
    (item) => item.id === endId
  );

  if (endIndex === -1) {
    throw new Error("Selected end does not exist");
  }

  const end = next.openEnds[endIndex];

  let matchedValue: number;
  let freeValue: number;

  if (tile.left === end.value) {
    matchedValue = tile.left;
    freeValue = tile.right;
  } else if (tile.right === end.value) {
    matchedValue = tile.right;
    freeValue = tile.left;
  } else {
    throw new Error("Tile does not match selected end");
  }

  // Remove the consumed end.
  next.openEnds.splice(endIndex, 1);

  // Connect the previous double candidate.
  if (end.countsForSpinnerActivation) {
    const candidate = next.doubleCandidates[end.sourceTileId];

    if (candidate) {
      candidate.connectedSides++;

      // The first double connected on both sides becomes spinner.
      if (
        candidate.connectedSides >= 2 &&
        next.spinner === null
      ) {
        next.spinner = {
          tileId: candidate.tileId,
          value: candidate.value,
          activatedAtTileCount: next.tiles.length + 1,
        };

        // Activate the other two ends of the spinner.
        next.openEnds.push(
          createOpenEnd(
            next,
            candidate.value,
            candidate.tileId,
            false
          ),
          createOpenEnd(
            next,
            candidate.value,
            candidate.tileId,
            false
          )
        );
      }
    }
  }

  // Add the placed tile.
  next.tiles.push({
    tile: { ...tile },
    connectedEndId: endId,
    matchedValue,
    freeValue,
  });

  // A newly placed double can become a spinner candidate.
  if (isDouble) {
    next.doubleCandidates[tile.id] = {
      tileId: tile.id,
      value: tile.left,
      connectedSides: 1,
    };
  }

  // Create the new open end.
  next.openEnds.push(
    createOpenEnd(next, freeValue, tile.id, isDouble)
  );

  return next;
}

export function getDomino365OpenEndsTotal(
  board: Domino365Board
): number {
  return board.openEnds.reduce(
    (total, end) => total + end.value,
    0
  );
}
