import { createDominoTile, type DominoTile } from "./DominoTile.js";

export function createDominoSet(): DominoTile[] {
  const tiles: DominoTile[] = [];

  for (let left = 0; left <= 6; left++) {
    for (let right = left; right <= 6; right++) {
      tiles.push(createDominoTile(left, right));
    }
  }

  return tiles;
}

export function shuffleDominoSet(
  tiles: DominoTile[],
  random: () => number = Math.random
): DominoTile[] {
  const shuffled = [...tiles];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));

    if (j < 0 || j > i) {
      throw new Error("Invalid random number generator");
    }

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export interface DominoDeal {
  hands: DominoTile[][];
  remaining: DominoTile[];
}

export function dealDominoTiles(
  tiles: DominoTile[],
  playerCount: number,
  tilesPerPlayer: number
): DominoDeal {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new Error("Player count must be a positive integer");
  }

  if (!Number.isInteger(tilesPerPlayer) || tilesPerPlayer < 1) {
    throw new Error("Tiles per player must be a positive integer");
  }

  if (playerCount * tilesPerPlayer > tiles.length) {
    throw new Error("Not enough domino tiles to deal");
  }

  const hands: DominoTile[][] = Array.from(
    { length: playerCount },
    (): DominoTile[] => []
  );

  let index = 0;

  for (let round = 0; round < tilesPerPlayer; round++) {
    for (let player = 0; player < playerCount; player++) {
      hands[player].push(tiles[index++]);
    }
  }

  return {
    hands,
    remaining: tiles.slice(index),
  };
}
