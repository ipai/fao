import _ from 'lodash';
import GAME_PHASE from '../common/game-phase.js';
import GameError from './game-error.js';
import Stroke from '../common/stroke.js';
import * as Util from '../common/util.js';
import * as Prompts from './prompts/prompts-api.js';

const MAX_USERS = 20;

class GameRoom {
	constructor(roomCode, host) {
		this.roomCode = roomCode;
		this.users = [];
		this.host = host;
		this.maxUsers = MAX_USERS;
		console.log(`Room ${roomCode} created with max users: ${this.maxUsers}`);

		this.round = 0;
		this.phase = GAME_PHASE.SETUP;

		this.turn = -1;
		this.keyword = undefined;
		this.hint = undefined;
		this.faker = undefined;

		this.strokes = [];
	}

	validateNewUser(user) {
		if (this.users.length >= this.maxUsers) {
			return `Room ${this.roomCode} is full (max ${this.maxUsers} players)`;
		}
		return null;
	}

	addUser(user, isHost = false) {
		const validationError = this.validateNewUser(user);
		if (validationError) {
			throw new GameError(validationError);
		}
		console.log(`Room ${this.roomCode} adding user. Current count: ${this.users.length}`);
		this.users.push(user);
		if (isHost) {
			this.host = user;
		}
		return true;
	}

	readdUser(user) {
		let userTargetIdx = this.users.findIndex((u) => u.name === user.name);
		if (userTargetIdx !== -1) {
			this.users[userTargetIdx] = user;
		} else {
			throw new GameError(
				`Could not readd ${user.logName}. Existing user target DNE.`,
				'Could not rejoin'
			);
		}
	}

	dropUser(user) {
		let idx = this.users.indexOf(user);
		this.users.splice(idx, 1);
		return this.users.length;
	}

	findUser(name) {
		return this.users.find((p) => p.name === name);
	}

	startNewRound() {
		this.round++;
		this.shuffleUsers();
		this.phase = GAME_PHASE.PLAY;
		this.turn = 1;
		let prompt = Prompts.getRandomPrompt(); // TODO ensure no duplicate prompt
		this.keyword = prompt.keyword;
		this.hint = prompt.hint;
		this.faker = Util.randomItemFrom(this.users);
		this.strokes = [];
		console.log(`Rm${this.roomCode} New round ${this.round}`);
	}

	invokeSetup() {
		console.log(`Rm${this.roomCode} Force setup`);
		this.phase = GAME_PHASE.SETUP;
		// Reset game state
		this.turn = -1;
		this.keyword = undefined;
		this.hint = undefined;
		this.faker = undefined;
		// If anyone disconnected during the game, forget about them during setup
		this.users = this.users.filter((u) => u.connected);
	}

	whoseTurn() {
		if (this.phase === GAME_PHASE.PLAY) {
			let idx = (this.turn - 1) % this.users.length;
			return this.users[idx];
		}
		return undefined;
	}

	shuffleUsers() {
		Util.shuffle(this.users);
	}

	addStroke(username, points) {
		this.strokes.push(new Stroke(username, points));
		return this.strokes;
	}

	nextTurn() {
		if (this.isGameInProgress()) {
			this.turn++;
			if (this.turn - 1 >= this.users.length * 2) {
				// 2 rounds per user
				this.phase = GAME_PHASE.VOTE;
			}
			return this.turn;
		}
		return undefined;
	}

	isGameInProgress() {
		return this.phase === GAME_PHASE.PLAY || this.phase === GAME_PHASE.VOTE;
	}

	isFull() {
		return this.users.length >= MAX_USERS;
	}

	isDead() {
		// all users are disconnected
		return this.users.length === 0 || _.every(this.users, (u) => !u.connected);
	}

	canAddUser() {
		return this.users.length < this.maxUsers;
	}
}

const ClientAdapter = {
	generateStateJson(gameRoom, pickFields) {
		let res = {
			roomCode: gameRoom.roomCode,
			users: _.map(gameRoom.users, (u) => ({
				name: u.name,
				connected: u.connected,
			})),
			round: gameRoom.round,
			phase: gameRoom.phase,
			turn: gameRoom.turn,
			whoseTurn: gameRoom.whoseTurn() ? gameRoom.whoseTurn().name : null, // null, so the empty value still gets passed to the client
			keyword: gameRoom.keyword,
			hint: gameRoom.hint,
			fakerName: gameRoom.faker ? gameRoom.faker.name : undefined,
			strokes: gameRoom.strokes,
		};
		if (pickFields) {
			res = _.pick(res, pickFields);
		}
		return res;
	},
	hideKeyword(stateJson) {
		let res = _.cloneDeep(stateJson);
		res.keyword = '???';
		return res;
	},
	hideFaker(stateJson) {
		let res = _.cloneDeep(stateJson);
		res.fakerName = undefined;
		return res;
	},
};

export { GameRoom, ClientAdapter };
