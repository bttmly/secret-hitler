// @flow

// This is the game state machine. The game state can only be changed through `event` messages.

import { playerSetup, policies } from './rules.mjs';
import { assert, pluckRandom, pluck } from './utils.mjs';
/* :: import type { Game, Message, Player, Policy } from './types'; */

export default function update(game /* : Game */, message /* : Message */, now /* : number */) /* : Game */ {
  if (message.type === 'START_GAME') {
    if (canStart(game)) {
      game = startGame(game, now);
    }
  } else if (message.type === 'PLAYER_JOIN') {
    const player = game.players.find(player => player.id === message.body.playerId);
    if (player) {
      // NOOP
    } else {
      // create a player
      // TODO Handle error case for when game has already started.
      if (!game.isStarted) {
        const newPlayer = {
          id: message.body.playerId,
          name: `Player ${game.players.length + 1}`,
          role: undefined,
          revealRole: false,
          seenRole: false,
          vote: undefined,
        };
        game = {
          ...game,
          players: [...game.players, newPlayer]
        };
      }
    }
  } else if (message.type === 'UPDATE_PLAYER_NAME') {
    const { name, playerId } = message.body;
    game = {
      ...game,
      players: game.players.map(player => {
        if (player.id === playerId) {
          return { ...player, name };
        }
        return player;
      })
    };
  } else if (message.type === 'REVEAL_ROLE') {
    const { playerId } = message.body;
    const player = getPlayer(playerId, game);
    game = {
      ...game,
      players: game.players.map(player => {
        if (player.id === playerId) {
          return { ...player, revealRole: !player.revealRole, seenRole: true };
        }
        return player;
      })
    };
    if (game.phase.name === 'VIEW_ROLES') {
      const unseenPlayers = game.players.filter(player => !player.seenRole);
      if (unseenPlayers.length === 0) {
        // All players have seen their role. move to election phase.
        game = {
          ...game,
          phase: {
            name: 'ELECTION_START',
            timestamp: now
          }
        }
        if (game.chancellorCandidate === undefined) {
          game = {
            ...game,
            chancellorCandidate: getRandomPlayer(game).id
          };
        }
      }
    }
  } else if (message.type === 'SELECT_CHANCELLOR_CANDIDATE') {
    const { playerId } = message.body;
    game = {
      ...game,
      chancellorCandidate: playerId,
      phase: {
        name: 'VOTE_ON_TICKET',
        timestamp: now
      }
    };
  } else if (message.type === 'VOTE_ON_TICKET') {
    const { playerId, vote } = message.body;
    const player = getPlayer(playerId, game);
    game = {
      ...game,
      players: game.players.map(player => {
        if (player.id === playerId) {
          return { ...player, vote };
        }
        return player;
      })
    }
    const notVoted = game.players.filter(player => player.vote === undefined);
    if (notVoted.length === 0) {
      game = {
        ...game,
        phase: {
          name: 'REVEAL_TICKET_RESULTS',
          timestamp: now
        }
      };
    }
  } else if (message.type === 'CLOCK_TICK') {
    if (
      game.phase.name === 'REVEAL_TICKET_RESULTS' &&
      (now - game.phase.timestamp > 4000)
    ) {
      const jas = game.players.reduce((jas /* :  number */, player) => {
        return player.vote === 'ja' ? (jas + 1) : jas;
      }, 0);
      const win = jas > (game.players.length / 2);
      if (win) {
        game = {
          ...game,
          phase: {
            name: 'LEGISLATIVE_SESSION_START',
            timestamp: Date.now()
          },
          policies: game.policies.reduce((accum, policy) => {
            let newPolicy = policy;
            let found = accum.found;
            if (policy.location === 'deck' && accum.found < 3) {
              found = found + 1;
              newPolicy = {
                ...policy,
                location: 'president'
              };
            }
            return { found, policies: [...accum.policies, newPolicy] };
          }, { found: 0, policies: []}).policies,
          electedChancellor: game.chancellorCandidate,
          electedPresident: game.presidentCandidate,
          chancellorCandidate: undefined,
          presidentCandidate: undefined
        };
      } else {
        game = {
          ...game,
          phase: {
            name: 'VOTE_ON_TICKET',
            timestamp: Date.now()
          }
        };
      }
      game = {
        ...game,
        players: game.players.map(player => {
          return { ...player, vote: undefined };
        })
      };
    }
  } else if (message.type === 'PRESIDENT_DISCARD_POLICY') {
    const index = game.policies.findIndex(policy => policy.id === message.body.policyId);
    const [discarded, policies] /*: [Policy, $ReadOnlyArray<Policy>] */ = pluck(game.policies, index);
    game = {
      ...game,
      phase: { name: 'CHANCELLOR_POLICY_TURN', timestamp: now },
      policies: [...policies.map((policy /*: Policy */) => {
        if (policy.location === 'president') {
          return { ...policy, location: 'chancellor' };
        }
        return policy;
      }), { ...discarded, location: 'discard' }]
    };
  } else if (message.type === 'CHANCELLOR_DISCARD_POLICY') {
    const index = game.policies.findIndex(policy => policy.id === message.body.policyId);
    const [discarded, policies] = pluck(game.policies, index);
    game = {
      ...game,
      phase: { name: 'REVEAL_NEW_POLICY', timestamp: now },
      policies: [...policies.map((policy /*: Policy */) => {
        if (policy.location === 'chancellor') {
          return {
            ...policy,
            location: policy.type
          };
        }
        return policy;
      }), { ...discarded, location: 'discard' } ]
    }
  }
  return game;
}

function getRandomPlayer(game) {
  const randomIndex = Math.floor(Math.random() * game.players.length);
  return game.players[randomIndex];
}

function getPlayer(playerId, game) {
  const index = game.players.reduce((accum, player, index) => {
    if (player.id === playerId) {
      return index;
    }
    return accum;
  }, -1);
  assert(index !== -1);
  return game.players[index];
}

function startGame(game /*: Game */, now /* : number */)/*: Game */ {
  const oldPlayers = game.players;
  let [hitler, unmatchedPlayers] = pluckRandom(game.players);
  hitler = { ...hitler, role: 'fascist' };
  let matchedPlayers /* : $ReadOnlyArray<Player> */ = [hitler];
  let player;
  const numFascists = playerSetup[String(game.players.length)].fascists;
  for (let i = 0; i < numFascists; i++) {
    [player, unmatchedPlayers] = pluckRandom(unmatchedPlayers);
    player = {...player, role: 'fascist' };
    matchedPlayers = [...matchedPlayers, player];
  }
  matchedPlayers = [
    ...matchedPlayers,
    ...unmatchedPlayers.map(player => ({ ...player, role: 'liberal' }))
  ];
  return {
    ...game,
    isStarted: true,
    phase: { name: 'VIEW_ROLES', timestamp: now },
    players: matchedPlayers,
    presidentCandidate: getRandomPlayer(game).id,
    hitler: hitler.id,
  };
}

const canStart = (game) => game && game.isStarted === false && game.players.length >= 5;