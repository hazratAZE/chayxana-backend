import assert from "assert";

import {
  createDomino365Board,
  placeDomino365Tile,
} from "../../src/games/domino/domino365/Domino365Board.js";

import {
  calculateDomino365MoveScore,
} from "../../src/games/domino/domino365/Domino365Scoring.js";

describe("Domino365Scoring", () => {
  it("should award 5 points for opening 0-5", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "0-5", left: 0, right: 5 }
    );

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.points, 5);
    assert.equal(result.reason, "opening");
  });

  it("should award 10 points for opening 5-5", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "5-5", left: 5, right: 5 }
    );

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.points, 10);
    assert.equal(result.reason, "opening");
  });

  it("should not award opening points for 2-3", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "2-3", left: 2, right: 3 }
    );

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.openEndsTotal, 5);
    assert.equal(result.points, 0);
  });

  it("should not award opening points for 4-6", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "4-6", left: 4, right: 6 }
    );

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.openEndsTotal, 10);
    assert.equal(result.points, 0);
  });

  it("should award points when all open ends total 5", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "3-3", left: 3, right: 3 }
    );

    const end = board.openEnds[0];

    board = placeDomino365Tile(
      board,
      { id: "2-3", left: 2, right: 3 },
      end.id
    );

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.openEndsTotal, 5);
    assert.equal(result.points, 5);
    assert.equal(result.reason, "multiple_of_five");
  });

  it("should award zero when open ends do not total a multiple of five", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "2-4", left: 2, right: 4 }
    );

    const end = board.openEnds.find((e) => e.value === 4)!;

    board = placeDomino365Tile(
      board,
      { id: "4-6", left: 4, right: 6 },
      end.id
    );

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.openEndsTotal, 8);
    assert.equal(result.points, 0);
  });

  it("should count all four open ends after spinner activation", () => {
    let board = createDomino365Board();

    board = placeDomino365Tile(
      board,
      { id: "3-3", left: 3, right: 3 }
    );

    board = placeDomino365Tile(
      board,
      { id: "0-3", left: 0, right: 3 },
      board.openEnds[0].id
    );

    const remainingDoubleEnd = board.openEnds.find(
      (end) => end.sourceTileId === "3-3"
    )!;

    board = placeDomino365Tile(
      board,
      { id: "3-4", left: 3, right: 4 },
      remainingDoubleEnd.id
    );

    assert.equal(board.spinner?.tileId, "3-3");
    assert.equal(board.openEnds.length, 4);

    const result = calculateDomino365MoveScore(board);

    assert.equal(result.openEndsTotal, 10);
    assert.equal(result.points, 10);
  });

  it("should reject scoring an empty board", () => {
    const board = createDomino365Board();

    assert.throws(
      () => calculateDomino365MoveScore(board),
      /empty board/
    );
  });
});
