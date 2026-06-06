import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Trophy, Timer, ClipboardCheck, RotateCcw } from 'lucide-react';
import {
  buildRound,
  checkGameData,
  scoreForAnswer,
  SECONDS_PER_QUESTION,
  type CheckAnswer,
  type CheckQuestion,
} from '../data/checkGame';
import {
  fetchLeaderboard,
  loadPlayerName,
  savePlayerName,
  submitScore,
  type LeaderboardEntry,
} from '../lib/leaderboard';

type Phase = 'intro' | 'playing' | 'result';

const ANSWER_LABEL: Record<CheckAnswer, string> = { can: '可以', cannot: '不可以' };

export function CheckGamePage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [name, setName] = useState(loadPlayerName());

  // Per-round state
  const [round, setRound] = useState<CheckQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [picked, setPicked] = useState<CheckAnswer | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [secondsAtAnswer, setSecondsAtAnswer] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [lastGain, setLastGain] = useState(0);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const current = round[index];
  const isLast = index === round.length - 1;

  const refreshLeaderboard = useCallback(() => {
    fetchLeaderboard()
      .then(setLeaderboard)
      .catch(() => {
        /* leaderboard is best-effort; ignore network errors */
      });
  }, []);

  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  // --- Countdown timer -----------------------------------------------------
  const revealAnswer = useCallback((remaining: number) => {
    setSecondsAtAnswer(remaining);
    setRevealed(true);
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || revealed) return;

    if (secondsLeft <= 0) {
      revealAnswer(0);
      return;
    }

    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, revealed, secondsLeft, revealAnswer]);

  // Award score once when an answer is revealed.
  useEffect(() => {
    if (!revealed || !current) return;
    const correct = picked === current.answer;
    const gain = scoreForAnswer(correct, secondsAtAnswer);
    setLastGain(gain);
    setTotalScore((prev) => prev + gain);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    savePlayerName(trimmed);
    setRound(buildRound());
    setIndex(0);
    setSecondsLeft(SECONDS_PER_QUESTION);
    setPicked(null);
    setRevealed(false);
    setSecondsAtAnswer(0);
    setTotalScore(0);
    setLastGain(0);
    setSubmitState('idle');
    setMyRank(null);
    setPhase('playing');
  };

  const pick = (answer: CheckAnswer) => {
    if (revealed) return;
    setPicked(answer);
    revealAnswer(secondsLeft);
  };

  const next = () => {
    if (isLast) {
      finishGame();
      return;
    }
    setIndex((i) => i + 1);
    setSecondsLeft(SECONDS_PER_QUESTION);
    setPicked(null);
    setRevealed(false);
    setSecondsAtAnswer(0);
  };

  const finishGame = () => {
    setPhase('result');
    setSubmitState('submitting');
    submitScore(name.trim(), totalScore)
      .then((res) => {
        if (res.error) {
          setSubmitState('error');
          return;
        }
        if (res.leaderboard) setLeaderboard(res.leaderboard);
        setMyRank(res.rank ?? null);
        setSubmitState('done');
      })
      .catch(() => setSubmitState('error'));
  };

  const correct = revealed && current ? picked === current.answer : false;

  return (
    <div className="container py-4 checkgame-page">
      <div className="interview-kicker">
        <ClipboardCheck size={18} />
        支票審查員
      </div>

      <div className="checkgame-layout">
        <div className="checkgame-main">
          {phase === 'intro' && (
            <IntroCard
              name={name}
              onNameChange={setName}
              onStart={startGame}
              intro={checkGameData.intro}
            />
          )}

          {phase === 'playing' && current && (
            <QuestionCard
              question={current}
              index={index}
              total={round.length}
              secondsLeft={secondsLeft}
              picked={picked}
              revealed={revealed}
              correct={correct}
              lastGain={lastGain}
              isLast={isLast}
              onPick={pick}
              onNext={next}
            />
          )}

          {phase === 'result' && (
            <ResultCard
              name={name}
              totalScore={totalScore}
              rank={myRank}
              submitState={submitState}
              onReplay={startGame}
            />
          )}
        </div>

        <aside className="checkgame-side">
          <LeaderboardPanel entries={leaderboard} playerName={name} />
        </aside>
      </div>
    </div>
  );
}

// --- Intro -----------------------------------------------------------------

function IntroCard({
  name,
  onNameChange,
  onStart,
  intro,
}: {
  name: string;
  onNameChange: (v: string) => void;
  onStart: () => void;
  intro: string;
}) {
  return (
    <div className="checkgame-card checkgame-intro">
      <h1 className="display-title checkgame-title">支票審查員</h1>
      <p className="checkgame-intro-text">{intro}</p>

      <form
        className="checkgame-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}
      >
        <label htmlFor="checkgame-name" className="checkgame-label">
          你的暱稱
        </label>
        <input
          id="checkgame-name"
          className="checkgame-input"
          type="text"
          value={name}
          maxLength={24}
          placeholder="輸入暱稱（最多 24 字）"
          onChange={(e) => onNameChange(e.target.value)}
        />
        <button type="submit" className="checkgame-btn checkgame-btn-primary" disabled={!name.trim()}>
          開始挑戰
        </button>
      </form>
    </div>
  );
}

// --- Question --------------------------------------------------------------

function QuestionCard({
  question,
  index,
  total,
  secondsLeft,
  picked,
  revealed,
  correct,
  lastGain,
  isLast,
  onPick,
  onNext,
}: {
  question: CheckQuestion;
  index: number;
  total: number;
  secondsLeft: number;
  picked: CheckAnswer | null;
  revealed: boolean;
  correct: boolean;
  lastGain: number;
  isLast: boolean;
  onPick: (a: CheckAnswer) => void;
  onNext: () => void;
}) {
  const pct = (secondsLeft / SECONDS_PER_QUESTION) * 100;
  const low = secondsLeft <= 5;
  const [zoomed, setZoomed] = useState<string | null>(null);

  return (
    <div className="checkgame-card">
      <div className="checkgame-qhead">
        <span className="checkgame-qcount">
          第 {index + 1} / {total} 題
        </span>
        <span className={`checkgame-timer ${low ? 'is-low' : ''}`}>
          <Timer size={16} />
          {secondsLeft} 秒
        </span>
      </div>

      <div className="checkgame-progress">
        <div
          className={`checkgame-progress-bar ${low ? 'is-low' : ''}`}
          style={{ width: `${Math.max(0, pct)}%` }}
        />
      </div>

      <p className="checkgame-desc">{question.description}</p>

      <div className="checkgame-images">
        {question.images.map((src, i) => (
          <img
            key={i}
            className="checkgame-image"
            src={src}
            alt={`支票圖片 ${i + 1}`}
            loading="lazy"
            onClick={() => setZoomed(src)}
          />
        ))}
      </div>

      {zoomed && (
        <div className="checkgame-lightbox" onClick={() => setZoomed(null)} role="presentation">
          <img src={zoomed} alt="放大檢視" />
        </div>
      )}

      <div className="checkgame-choices">
        {(['can', 'cannot'] as CheckAnswer[]).map((value) => {
          const isAnswer = revealed && question.answer === value;
          const isWrongPick = revealed && picked === value && picked !== question.answer;
          return (
            <button
              key={value}
              type="button"
              className={`checkgame-choice ${value === 'can' ? 'is-can' : 'is-cannot'} ${
                isAnswer ? 'is-correct' : ''
              } ${isWrongPick ? 'is-wrong' : ''}`}
              disabled={revealed}
              onClick={() => onPick(value)}
            >
              {value === 'can' ? <Check size={20} /> : <X size={20} />}
              {ANSWER_LABEL[value]}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className={`checkgame-reveal ${correct ? 'is-correct' : 'is-wrong'}`}>
          <div className="checkgame-reveal-head">
            <span className="checkgame-reveal-verdict">
              {picked === null ? '時間到！' : correct ? '答對了！' : '答錯了'}
              　正解：{ANSWER_LABEL[question.answer]}
            </span>
            <span className="checkgame-reveal-gain">+{lastGain} 分</span>
          </div>
          <p className="checkgame-explanation">{question.explanation}</p>
          <button type="button" className="checkgame-btn checkgame-btn-primary" onClick={onNext}>
            {isLast ? '看結算' : '下一題'}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Result ----------------------------------------------------------------

function ResultCard({
  name,
  totalScore,
  rank,
  submitState,
  onReplay,
}: {
  name: string;
  totalScore: number;
  rank: number | null;
  submitState: 'idle' | 'submitting' | 'done' | 'error';
  onReplay: () => void;
}) {
  return (
    <div className="checkgame-card checkgame-result">
      <Trophy size={48} className="checkgame-result-icon" />
      <h2 className="checkgame-result-title">{name}，挑戰結束！</h2>
      <div className="checkgame-result-score">{totalScore}</div>
      <div className="checkgame-result-label">總分</div>

      {submitState === 'submitting' && <p className="checkgame-result-note">成績上傳中…</p>}
      {submitState === 'done' && rank != null && (
        <p className="checkgame-result-note">你在排行榜排名第 {rank} 名 🎉</p>
      )}
      {submitState === 'done' && rank == null && (
        <p className="checkgame-result-note">可惜這次沒擠進前十名，再接再厲！</p>
      )}
      {submitState === 'error' && (
        <p className="checkgame-result-note is-error">成績上傳失敗，但不影響你再玩一次。</p>
      )}

      <button type="button" className="checkgame-btn checkgame-btn-primary" onClick={onReplay}>
        <RotateCcw size={18} />
        再玩一次
      </button>
    </div>
  );
}

// --- Leaderboard -----------------------------------------------------------

function LeaderboardPanel({ entries, playerName }: { entries: LeaderboardEntry[]; playerName: string }) {
  const medals = useMemo(() => ['🥇', '🥈', '🥉'], []);
  return (
    <div className="checkgame-card checkgame-board">
      <h3 className="checkgame-board-title">
        <Trophy size={18} />
        排行榜
      </h3>
      {entries.length === 0 ? (
        <p className="checkgame-board-empty">還沒有人上榜，當第一個吧！</p>
      ) : (
        <ol className="checkgame-board-list">
          {entries.map((entry, i) => (
            <li
              key={`${entry.name}-${entry.createdAt}-${i}`}
              className={`checkgame-board-row ${entry.name === playerName ? 'is-me' : ''}`}
            >
              <span className="checkgame-board-rank">{medals[i] ?? i + 1}</span>
              <span className="checkgame-board-name">{entry.name}</span>
              <span className="checkgame-board-score">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
