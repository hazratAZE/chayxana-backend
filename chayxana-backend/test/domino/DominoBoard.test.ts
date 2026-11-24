import { describe, it } from "mocha";
import assert from "node:assert/strict";
import {
  createDominoBoard,
  canPlaceTile,
  placeTile,
  hasPlayableTile,
} from "../../src/games/domino/shared/DominoBoard.js";

describe("DominoBoard", () => {
  it("should create an empty board", () => {
    const board = createDominoBoard();

    assert.equal(board.tiles.length, 0);
    assert.equal(board.leftEnd, null);
    assert.equal(board.rightEnd, null);
  });

  it("should allow any tile on an empty board", () => {
    const board = createDominoBoard();

    assert.equal(
      canPlaceTile(board, {
        id: "2-5",
        left: 2,
        right: 5,
      }),
      true
    );
  });

  it("should reject a tile that matches neither end", () => {
    const board = createDominoBoard();

    board.tiles.push({
      id: "2-5",
      left: 2,
      right: 5,
    });

    board.leftEnd = 2;
    board.rightEnd = 5;

    assert.equal(
      canPlaceTile(board, {
        id: "3-4",
        left: 3,
        right: 4,
      }),
      false
    );
  });

  it("should place the first tile", () => {
    const board = createDominoBoard();

    const result = placeTile(
      board,
      { id: "2-5", left: 2, right: 5 },
      "right"
    );

    assert.equal(result.tiles.length, 1);
    assert.equal(result.leftEnd, 2);
    assert.equal(result.rightEnd, 5);
  });

  it("should place a matching tile on the right", () => {
    const board = createDominoBoard();

    const first = placeTile(
      board,
      { id: "2-5", left: 2, right: 5 },
      "right"
    );

    const result = placeTile(
      first,
      { id: "5-3", left: 5, right: 3 },
      "right"
    );

    assert.equal(result.tiles.length, 2);
    assert.equal(result.leftEnd, 2);
    assert.equal(result.rightEnd, 3);
  });

  it("should reverse a tile when placing on the left", () => {
    const board = createDominoBoard();

    const first = placeTile(
      board,
      { id: "2-5", left: 2, right: 5 },
      "right"
    );

    const result = placeTile(
      first,
      { id: "4-2", left: 4, right: 2 },
      "left"
    );

    assert.equal(result.leftEnd, 4);
    assert.equal(result.rightEnd, 5);
    assert.equal(result.tiles[0].left, 4);
    assert.equal(result.tiles[0].right, 2);
  });

  it("should reject an invalid placement", () => {
    const board = createDominoBoard();

    const first = placeTile(
      board,
      { id: "2-5", left: 2, right: 5 },
      "right"
    );

    assert.throws(() => {
      placeTile(
        first,
        { id: "3-4", left: 3, right: 4 },
        "right"
      );
    });
  });

  it("should detect a playable tile", () => {
    const board = createDominoBoard();

    const first = placeTile(
      board,
      { id: "2-5", left: 2, right: 5 },
      "right"
    );

    const hand = [
      { id: "1-3", left: 1, right: 3 },
      { id: "5-6", left: 5, right: 6 },
    ];

    assert.equal(hasPlayableTile(first, hand), true);
  });

  it("should detect when no tile can be played", () => {
    const board = createDominoBoard();

    const first = placeTile(
      board,
      { id: "2-5", left: 2, right: 5 },
      "right"
    );

    const hand = [
      { id: "0-1", left: 0, right: 1 },
      { id: "3-4", left: 3, right: 4 },
    ];

    assert.equal(hasPlayableTile(first, hand), false);
  });
});
