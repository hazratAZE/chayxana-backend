import { describe, it } from "mocha";
import assert from "node:assert/strict";

import {
  createDominoSet,
  shuffleDominoSet,
  dealDominoTiles,
} from "../../src/games/domino/shared/DominoSet.js";

describe("DominoSet", () => {
  it("should create exactly 28 unique tiles", () => {
    const tiles = createDominoSet();

    assert.equal(tiles.length, 28);

    const ids = tiles.map((tile) => tile.id);

    assert.equal(new Set(ids).size, 28);
  });

  it("should contain the double-six tile", () => {
    const tiles = createDominoSet();

    assert.ok(tiles.some(
      (tile) => tile.left === 6 && tile.right === 6
    ));
  });

  it("should deal 7 tiles to each of 4 players", () => {
    const tiles = shuffleDominoSet(createDominoSet());

    const result = dealDominoTiles(tiles, 4, 7);

    assert.equal(result.hands.length, 4);

    for (const hand of result.hands) {
      assert.equal(hand.length, 7);
    }

    assert.equal(result.remaining.length, 0);
  });

  it("should reject an impossible deal", () => {
    const tiles = createDominoSet();

    assert.throws(() => {
      dealDominoTiles(tiles, 4, 8);
    });
  });
});
