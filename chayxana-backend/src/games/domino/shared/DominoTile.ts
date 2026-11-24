export interface DominoTile {
  id: string;
  left: number;
  right: number;
}

export function createDominoTile(
  left: number,
  right: number
): DominoTile {
  if (
    !Number.isInteger(left) ||
    !Number.isInteger(right) ||
    left < 0 ||
    right > 6 ||
    left > right
  ) {
    throw new Error("Invalid domino tile values");
  }

  return {
    id: `${left}-${right}`,
    left,
    right,
  };
}
