import type { DominoTile } from "./DominoTile.js";

export type DominoSide = "left" | "right";

export interface DominoBoard {
  tiles: DominoTile[];
  leftEnd: number | null;
  rightEnd: number | null;
}

export function createDominoBoard(): DominoBoard {
  return {
    tiles: [],
    leftEnd: null,
    rightEnd: null,
  };
}

export function canPlaceTile(
  board: DominoBoard,
  tile: DominoTile
): boolean {
  if (board.tiles.length === 0) {
    return true;
  }

  return (
    tile.left === board.leftEnd ||
    tile.right === board.leftEnd ||
    tile.left === board.rightEnd ||
    tile.right === board.rightEnd
  );
}

export function hasPlayableTile(
  board: DominoBoard,
  hand: DominoTile[]
): boolean {
  return hand.some((tile) => canPlaceTile(board, tile));
}

export function placeTile(
  board: DominoBoard,
  tile: DominoTile,
  side: DominoSide
): DominoBoard {
  if (!["left", "right"].includes(side)) {
    throw new Error("Invalid placement side");
  }

  if (board.tiles.length === 0) {
    return {
      tiles: [{ ...tile }],
      leftEnd: tile.left,
      rightEnd: tile.right,
    };
  }

  if (!canPlaceTile(board, tile)) {
    throw new Error("Tile cannot be placed on this board");
  }

  const newTiles = [...board.tiles];

  if (side === "left") {
    if (tile.right === board.leftEnd) {
      newTiles.unshift({ ...tile });
      return {
        tiles: newTiles,
        leftEnd: tile.left,
        rightEnd: board.rightEnd,
      };
    }

    if (tile.left === board.leftEnd) {
      newTiles.unshift({
        ...tile,
        left: tile.right,
        right: tile.left,
      });

      return {
        tiles: newTiles,
        leftEnd: tile.right,
        rightEnd: board.rightEnd,
      };
    }
  }

  if (side === "right") {
    if (tile.left === board.rightEnd) {
      newTiles.push({ ...tile });
      return {
        tiles: newTiles,
        leftEnd: board.leftEnd,
        rightEnd: tile.right,
      };
    }

    if (tile.right === board.rightEnd) {
      newTiles.push({
        ...tile,
        left: tile.right,
        right: tile.left,
      });

      return {
        tiles: newTiles,
        leftEnd: board.leftEnd,
        rightEnd: tile.left,
      };
    }
  }

  throw new Error("Tile cannot be placed on selected side");
}
