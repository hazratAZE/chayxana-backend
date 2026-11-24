import assert from "assert";

import {
  createDomino365Game,
  getDomino365CurrentPlayer,
  playDomino365GameTile,
  passDomino365GameTurn,
  startNextDomino365Round,
} from "../../src/games/domino/domino365/Domino365Game.js";

import {
  createDomino365Board,
  placeDomino365Tile,
} from "../../src/games/domino/domino365/Domino365Board.js";

import type { Domino365GameState } from "../../src/games/domino/domino365/Domino365Game.js";

import type { DominoTile } from "../../src/games/domino/shared/DominoTile.js";

const setup = [
  { playerId: "p1", teamId: "A" as const },
  { playerId: "p2", teamId: "B" as const },
  { playerId: "p3", teamId: "A" as const },
  { playerId: "p4", teamId: "B" as const },
];

function tile(left: number, right: number): DominoTile {
  return {
    id: `${left}-${right}`,
    left,
    right,
  };
}

describe("Domino365Game", () => {
  it("should create a game and deal 7 tiles to each player", () => {
    const game = createDomino365Game(setup, 0, () => 0);

    assert.equal(game.players.length, 4);
    assert.equal(game.players[0].hand.length, 7);
    assert.equal(game.players[1].hand.length, 7);
    assert.equal(game.players[2].hand.length, 7);
    assert.equal(game.players[3].hand.length, 7);

    assert.equal(game.board.tiles.length, 0);
    assert.equal(game.status, "playing");
  });

  it("should select the configured first player", () => {
    const game = createDomino365Game(setup, 2, () => 0);

    assert.equal(
      getDomino365CurrentPlayer(game).playerId,
      "p3"
    );
  });

  it("should reject an invalid first player index", () => {
    assert.throws(
      () => createDomino365Game(setup, 4),
      /Invalid first player index/
    );
  });

  it("should reject a move from the wrong player", () => {
    const game = createDomino365Game(setup, 0, () => 0);
    const tileId = game.players[0].hand[0].id;

    assert.throws(
      () => playDomino365GameTile(game, "p2", tileId),
      /not this player's turn/
    );
  });

  it("should place a tile and advance the turn", () => {
    const game = createDomino365Game(setup, 0, () => 0);
    const firstTile = game.players[0].hand[0];

    const nextGame = playDomino365GameTile(
      game,
      "p1",
      firstTile.id
    );

    assert.equal(nextGame.board.tiles.length, 1);
    assert.equal(nextGame.players[0].hand.length, 6);
    assert.equal(nextGame.currentPlayerIndex, 1);
    assert.equal(nextGame.consecutivePasses, 0);
    assert.equal(nextGame.status, "playing");
  });

  it("should reject a tile that does not match the selected end", () => {
    const game = createDomino365Game(setup, 0, () => 0);
    const firstTile = game.players[0].hand[0];

    const afterFirstMove = playDomino365GameTile(
      game,
      "p1",
      firstTile.id
    );

    const nextPlayer = getDomino365CurrentPlayer(afterFirstMove);

    const invalidTile = nextPlayer.hand.find(
      (item) =>
        item.left !== firstTile.left &&
        item.left !== firstTile.right &&
        item.right !== firstTile.left &&
        item.right !== firstTile.right
    );

    if (!invalidTile) {
      throw new Error("Test setup could not find an invalid tile");
    }

    assert.throws(
      () =>
        playDomino365GameTile(
          afterFirstMove,
          nextPlayer.playerId,
          invalidTile.id,
          afterFirstMove.board.openEnds[0].id
        ),
      /Invalid tile placement/
    );
  });

  it("should reject passing when the player has a playable tile", () => {
    const game = createDomino365Game(setup, 0, () => 0);

    assert.throws(
      () => passDomino365GameTurn(game, "p1"),
      /cannot pass/
    );
  });

  it("should end the round after four consecutive passes", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    const board = createDomino365Board();

    game = {
      ...game,
      board: placeDomino365Tile(board, tile(0, 1)),
      players: game.players.map((player) => ({
        ...player,
        hand: [tile(6, 6)],
      })),
    };

    for (let i = 0; i < 4; i++) {
      const currentPlayer = getDomino365CurrentPlayer(game);

      game = passDomino365GameTurn(
        game,
        currentPlayer.playerId
      );
    }

    assert.equal(game.consecutivePasses, 4);
    assert.equal(game.status, "round_ended");
    assert.equal(game.roundResult?.bonusReason, "blocked_tie");
  });

  it("should finish the round when a player uses the last tile", () => {
    let game: Domino365GameState = createDomino365Game(
      setup,
      0,
      () => 0
    );

    game = {
      ...game,
      players: [
        { ...game.players[0], hand: [tile(1, 2)] },
        { ...game.players[1], hand: [] },
        { ...game.players[2], hand: [] },
        { ...game.players[3], hand: [tile(0, 5)] },
      ],
    };

    game = playDomino365GameTile(game, "p1", "1-2");

    assert.equal(game.players[0].hand.length, 0);
    assert.equal(game.status, "round_ended");
    assert.equal(game.roundResult?.bonusReason, "player_finished");
    assert.equal(game.scores.A, 5);
  });

  it("should start the next round after the previous round ends", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    game = {
      ...game,
      status: "round_ended",
    };

    const nextGame = startNextDomino365Round(
      game,
      () => 0
    );

    assert.equal(nextGame.roundNumber, 2);
    assert.equal(nextGame.status, "playing");
    assert.equal(nextGame.board.tiles.length, 0);
    assert.equal(nextGame.consecutivePasses, 0);
    assert.equal(nextGame.roundResult, null);
    assert.equal(nextGame.lastMoveScore, null);
  });

  it("should rotate the first player by one seat", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    game = {
      ...game,
      status: "round_ended",
    };

    const nextGame = startNextDomino365Round(
      game,
      () => 0
    );

    assert.equal(nextGame.roundStartingPlayerIndex, 1);
    assert.equal(nextGame.currentPlayerIndex, 1);
    assert.equal(
      getDomino365CurrentPlayer(nextGame).playerId,
      "p2"
    );
  });

  it("should preserve team scores between rounds", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    game = {
      ...game,
      status: "round_ended",
      scores: {
        A: 125,
        B: 90,
      },
    };

    const nextGame = startNextDomino365Round(
      game,
      () => 0
    );

    assert.equal(nextGame.scores.A, 125);
    assert.equal(nextGame.scores.B, 90);
  });

  it("should preserve endgame mode between rounds", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    game = {
      ...game,
      status: "round_ended",
      endgameMode: true,
    };

    const nextGame = startNextDomino365Round(
      game,
      () => 0
    );

    assert.equal(nextGame.endgameMode, true);
  });

  it("should deal 7 new tiles to every player", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    game = {
      ...game,
      status: "round_ended",
    };

    const nextGame = startNextDomino365Round(
      game,
      () => 0
    );

    for (const player of nextGame.players) {
      assert.equal(player.hand.length, 7);
    }

    const allTiles = nextGame.players.flatMap(
      (player) => player.hand
    );

    assert.equal(allTiles.length, 28);
    assert.equal(
      new Set(allTiles.map((tile) => tile.id)).size,
      28
    );
  });

  it("should reject starting a new round while the current round is playing", () => {
    const game = createDomino365Game(setup, 0, () => 0);

    assert.throws(
      () => startNextDomino365Round(game),
      /has not ended/
    );
  });

  it("should reject starting a new round after the session finishes", () => {
    let game = createDomino365Game(setup, 0, () => 0);

    game = {
      ...game,
      status: "finished",
    };

    assert.throws(
      () => startNextDomino365Round(game),
      /already finished/
    );
  });
});
