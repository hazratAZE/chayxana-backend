import assert from "assert";

import {
  createDomino365Board,
  placeDomino365Tile,
  getDomino365OpenEndsTotal,
} from "../../src/games/domino/domino365/Domino365Board.js";

describe("Domino365Board", () => {
  it("should create an empty board", () => {
    const board = createDomino365Board();

    assert.equal(board.tiles.length, 0);
    assert.equal(board.openEnds.length, 0);
    assert.equal(board.spinner, null);
  });

  it("should create two open ends after the first tile", () => {
    const board = createDomino365Board();

    const next = placeDomino365Tile(
      board,
      { id: "3-3", left: 3, right: 3 }
    );

    assert.equal(next.tiles.length, 1);
    assert.equal(next.openEnds.length, 2);
    assert.equal(next.spinner, null);
  });

  it("should not activate spinner after only one side is connected", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "3-3", left: 3, right: 3 }
    );

    const originalEnd = board.openEnds[0];

    board = placeDomino365Tile(
      board,
      { id: "2-3", left: 2, right: 3 },
      originalEnd.id
    );

    assert.equal(board.spinner, null);
    assert.equal(board.openEnds.length, 2);
  });

  it("should activate spinner after both sides are connected", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "3-3", left: 3, right: 3 }
    );

    const firstEnd = board.openEnds[0];

    board = placeDomino365Tile(
      board,
      { id: "2-3", left: 2, right: 3 },
      firstEnd.id
    );

    const secondEnd = board.openEnds.find(
      (end) => end.sourceTileId === "3-3"
    )!;

    board = placeDomino365Tile(
      board,
      { id: "3-5", left: 3, right: 5 },
      secondEnd.id
    );

    assert.notEqual(board.spinner, null);
    assert.equal(board.spinner?.tileId, "3-3");
    assert.equal(board.openEnds.length, 4);
  });

  it("should calculate all active open ends", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "3-3", left: 3, right: 3 }
    );

    assert.equal(getDomino365OpenEndsTotal(board), 6);
  });

  it("should not modify the original board", () => {
    const original = createDomino365Board();

    const next = placeDomino365Tile(
      original,
      { id: "2-5", left: 2, right: 5 }
    );

    assert.equal(original.tiles.length, 0);
    assert.equal(next.tiles.length, 1);
  });
});
