import { randomBytes } from 'node:crypto';
import checkData from '../src/data/checkGame.json' with { type: 'json' };
import { shuffle, SECONDS_PER_QUESTION as checkSeconds, scoreForAnswer as scoreCheck } from '../src/data/checkGame.ts';
import {
  buildRound as buildNumberRound,
  SECONDS_PER_QUESTION as numberSeconds,
  scoreForAnswer as scoreNumber,
} from '../src/data/numberGame.ts';

const lifetimeMs = 30 * 60 * 1000;
const maxRounds = 384;
const checkGame = {
  build: () => shuffle(checkData.questions),
  limit: checkSeconds,
  score: scoreCheck,
};
const numberGame = { build: buildNumberRound, limit: numberSeconds, score: scoreNumber };
const roundError = (message, status = 409) => Object.assign(new Error(message), { status });

const publicQuestion = ({ answer, explanation, value, ...question }) => question;

const present = (round) => ({
  roundId: round.id,
  index: round.index,
  total: round.questions.length,
  question: publicQuestion(round.questions[round.index]),
  secondsLeft: Math.max(0, Math.ceil((round.deadline - Date.now()) / 1000)),
});

export function createGameRounds() {
  const rounds = new Map();

  return {
    start(game, name) {
      const now = Date.now();
      for (const [id, round] of rounds) {
        if (round.expiresAt > now) break;
        rounds.delete(id);
      }
      if (rounds.size >= maxRounds) throw roundError('遊戲目前忙碌，請稍後再試。', 429);
      const rules = game === 'checkgame' ? checkGame : numberGame;
      const id = randomBytes(24).toString('hex');
      const round = {
        id, game, name, rules,
        expiresAt: now + lifetimeMs,
        deadline: now + rules.limit * 1000,
        questions: rules.build(),
        index: 0,
        score: 0,
        grade: null,
        submission: null,
      };
      rounds.set(id, round);
      return present(round);
    },

    get(game, id) {
      const round = rounds.get(id);
      if (!round || round.game !== game || round.expiresAt <= Date.now()) {
        throw roundError('這個回合已失效，請重新開始。');
      }
      return round;
    },

    answer(round, index, answer) {
      if (index !== round.index) throw roundError('題目已變更，請重新開始。');
      if (round.grade) return round.grade;
      const question = round.questions[index];
      const remainingMs = round.deadline - Date.now();
      const timedOut = remainingMs <= 0 || answer === null;
      const correctAnswer = round.game === 'checkgame' ? question.answer : question.value;
      const correct = !timedOut && answer === correctAnswer;
      const gain = round.rules.score(correct, Math.ceil(remainingMs / 1000));
      round.score += gain;
      round.grade = {
        correct,
        timedOut,
        gain,
        totalScore: round.score,
        answer: correctAnswer,
        explanation: question.explanation,
      };
      return round.grade;
    },

    next(round, index) {
      if (index === round.index - 1) return present(round);
      if (index !== round.index || !round.grade || index >= round.questions.length - 1) {
        throw roundError('這一題尚未完成或已是最後一題。');
      }
      round.index += 1;
      round.grade = null;
      round.deadline = Date.now() + round.rules.limit * 1000;
      return present(round);
    },

    complete(round, record) {
      if (!round.grade || round.index !== round.questions.length - 1) {
        throw roundError('請先完成全部題目。');
      }
      round.submission ??= record(round.name, round.score).catch((error) => {
        round.submission = null;
        throw error;
      });
      return round.submission;
    },
  };
}
