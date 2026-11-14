import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLeaderboard, gameRequest, loadPlayerName, savePlayerName,
  type GameKey, type LeaderboardEntry, type RoundGrade, type RoundQuestion, type ScoreResult,
} from './leaderboard';

export function useRankedGame<Question, Answer>(game: GameKey) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'result'>('intro');
  const [name, setName] = useState(loadPlayerName);
  const [round, setRound] = useState<RoundQuestion<Question> | null>(null);
  const [grade, setGrade] = useState<RoundGrade<Answer> | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const deadline = useRef(0);

  useEffect(() => {
    fetchLeaderboard(game).then(setLeaderboard).catch(() => {});
  }, [game]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '遊戲連線失敗，請稍後再試。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const showQuestion = (next: RoundQuestion<Question>) => {
    setRound(next);
    setGrade(null);
    deadline.current = performance.now() + next.secondsLeft * 1000;
    setSecondsLeft(next.secondsLeft);
  };

  const start = () => {
    const nickname = name.trim();
    if (!nickname) return;
    void run(async () => {
      const question = await gameRequest<RoundQuestion<Question>>(game, 'round', { name: nickname });
      savePlayerName(nickname);
      showQuestion(question);
      setSubmitState('idle');
      setRank(null);
      setPhase('playing');
    });
  };

  const answer = useCallback((value: Answer | null) => {
    if (!round || grade) return;
    void run(async () => {
      setGrade(await gameRequest<RoundGrade<Answer>>(game, 'answer', {
        roundId: round.roundId, index: round.index, answer: value,
      }));
    });
  }, [game, grade, round, run]);

  useEffect(() => {
    if (phase !== 'playing' || !round || grade || error || busy) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setSecondsLeft(remaining);
      if (!remaining) answer(null);
    };
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [answer, busy, error, grade, phase, round]);

  const next = () => {
    if (!round || !grade) return;
    if (round.index + 1 < round.total) {
      void run(async () => {
        showQuestion(await gameRequest<RoundQuestion<Question>>(game, 'next', { roundId: round.roundId, index: round.index }));
      });
      return;
    }
    void run(async () => {
      setPhase('result');
      setSubmitState('submitting');
      try {
        const result = await gameRequest<ScoreResult>(game, 'score', { roundId: round.roundId });
        setLeaderboard(result.leaderboard);
        setRank(result.rank);
        setSubmitState('done');
      } catch {
        setSubmitState('error');
      }
    });
  };

  return { phase, name, setName, round, grade, secondsLeft, leaderboard, rank, submitState, busy, error, start, answer, next };
}
