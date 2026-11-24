import assert from "assert";

import {
  settleDomino365Round,
  type Domino365RoundInput,
  type Domino365RoundPlayer,
} from "../../src/games/domino/domino365/Domino365RoundManager.js";

import type { DominoTile } from "../../src/games/domino/shared/DominoTile.js";

function tile(left: number, right: number): DominoTile {
  return {
    id: `${left}-${right}`,
    left,
    right,
  };
}

function player(
  playerId: string,
  teamId: "A" | "B",
  hand: DominoTile[]
): Domino365RoundPlayer {
  return { playerId, teamId, hand };
}

function createInput(
  players: Domino365RoundPlayer[],
  endReason: Domino365RoundInput["endReason"],
  scores = { A: 0, B: 0 },
  endgameMode = false
): Domino365RoundInput {
  return {
    players,
    scores,
    endReason,
    endgameMode,
  };
}

describe("Domino365RoundManager", () => {
  it("should award the opponent team's remaining pips when a player finishes", () => {
    const input = createInput(
      [
        player("p1", "A", []),
        player("p2", "A", []),
        player("p3", "B", [tile(0, 6), tile(0, 6)]),
        player("p4", "B", [tile(0, 5)]),
      ],
      { type: "player_finished", playerId: "p1" }
    );

    const result = settleDomino365Round(input);

    assert.equal(result.remainingPips.B, 17);
    assert.equal(result.bonusPoints.A, 15);
    assert.equal(result.scores.A, 15);
    assert.equal(result.bonusReason, "player_finished");
  });

  it("should award the lower-pip team when the round is blocked", () => {
    const input = createInput(
      [
        player("p1", "A", [tile(0, 6)]),
        player("p2", "A", [tile(0, 6)]),
        player("p3", "B", [tile(0, 6), tile(0, 6)]),
        player("p4", "B", [tile(0, 6), tile(0, 1)]),
      ],
      { type: "blocked" }
    );

    const result = settleDomino365Round(input);

    assert.equal(result.remainingPips.A, 12);
    assert.equal(result.remainingPips.B, 19);
    assert.equal(result.bonusPoints.A, 20);
    assert.equal(result.scores.A, 20);
    assert.equal(result.bonusReason, "blocked");
  });

  it("should award no points when blocked teams have equal pips", () => {
    const input = createInput(
      [
        player("p1", "A", [tile(0, 5)]),
        player("p2", "A", [tile(0, 5)]),
        player("p3", "B", [tile(0, 6)]),
        player("p4", "B", [tile(0, 4)]),
      ],
      { type: "blocked" }
    );

    const result = settleDomino365Round(input);

    assert.equal(result.remainingPips.A, 10);
    assert.equal(result.remainingPips.B, 10);
    assert.equal(result.bonusPoints.A, 0);
    assert.equal(result.bonusPoints.B, 0);
    assert.equal(result.bonusReason, "blocked_tie");
  });

  it("should not award hand bonuses in endgame mode", () => {
    const input = createInput(
      [
        player("p1", "A", []),
        player("p2", "A", []),
        player("p3", "B", [tile(0, 6), tile(0, 6)]),
        player("p4", "B", [tile(0, 6)]),
      ],
      { type: "player_finished", playerId: "p1" },
      { A: 310, B: 200 },
      true
    );

    const result = settleDomino365Round(input);

    assert.equal(result.bonusPoints.A, 0);
    assert.equal(result.bonusPoints.B, 0);
    assert.equal(result.scores.A, 310);
    assert.equal(result.bonusReason, "endgame_no_bonus");
    assert.equal(result.endgameMode, true);
  });

  it("should activate endgame mode when a team reaches 300 after the round", () => {
    const input = createInput(
      [
        player("p1", "A", []),
        player("p2", "A", []),
        player("p3", "B", [tile(0, 5)]),
        player("p4", "B", []),
      ],
      { type: "player_finished", playerId: "p1" },
      { A: 295, B: 200 }
    );

    const result = settleDomino365Round(input);

    assert.equal(result.scores.A, 300);
    assert.equal(result.endgameMode, true);
  });

  it("should declare a winner when a team reaches 365 after the round", () => {
    const input = createInput(
      [
        player("p1", "A", []),
        player("p2", "A", []),
        player("p3", "B", [tile(0, 5)]),
        player("p4", "B", []),
      ],
      { type: "player_finished", playerId: "p1" },
      { A: 360, B: 200 }
    );

    const result = settleDomino365Round(input);

    assert.equal(result.scores.A, 365);
    assert.equal(result.sessionEnded, true);
    assert.equal(result.sessionWinnerTeamId, "A");
  });

  it("should reject a finishing player who still has tiles", () => {
    const input = createInput(
      [
        player("p1", "A", [tile(1, 2)]),
        player("p2", "A", []),
        player("p3", "B", []),
        player("p4", "B", []),
      ],
      { type: "player_finished", playerId: "p1" }
    );

    assert.throws(
      () => settleDomino365Round(input),
      /empty hand/
    );
  });

  it("should reject a round with fewer than four players", () => {
    const input = createInput(
      [
        player("p1", "A", []),
        player("p2", "A", []),
        player("p3", "B", []),
      ],
      { type: "blocked" }
    );

    assert.throws(
      () => settleDomino365Round(input),
      /exactly 4 players/
    );
  });
});
