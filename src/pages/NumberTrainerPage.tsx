import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, Timer, Hash, RotateCcw, X } from 'lucide-react';
import {
  buildRound,
  numberGameIntro,
  scoreForAnswer,
  SECONDS_PER_QUESTION,
  type NumberQuestion,
} from '../data/numberGame';
import { PLACE_HEADERS } from '../lib/chineseNumerals';
import {
  fetchLeaderboard,
  loadPlayerName,
  savePlayerName,
  submitScore,
  type LeaderboardEntry,
} from '../lib/leaderboard';

type Phase = 'intro' | 'playing' | 'result';

export function NumberTrainerPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [name, setName] = useState(loadPlayerName());

  // Per-round state
  const [round, setRound] = useState<NumberQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [answer, setAnswer] = useState(''); // raw digits the user typed (no commas)
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

  const enteredValue = answer ? Number(answer) : NaN;
  const correct = revealed && current ? enteredValue === current.value : false;

  const refreshLeaderboard = useCallback(() => {
    fetchLeaderboard('numbergame')
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
    const gain = scoreForAnswer(enteredValue === current.value, secondsAtAnswer);
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
    setAnswer('');
    setRevealed(false);
    setSecondsAtAnswer(0);
    setTotalScore(0);
    setLastGain(0);
    setSubmitState('idle');
    setMyRank(null);
    setPhase('playing');
  };

  const submitAnswer = () => {
    if (revealed) return;
    revealAnswer(secondsLeft);
  };

  const next = () => {
    if (isLast) {
      finishGame();
      return;
    }
    setIndex((i) => i + 1);
    setSecondsLeft(SECONDS_PER_QUESTION);
    setAnswer('');
    setRevealed(false);
    setSecondsAtAnswer(0);
  };

  const finishGame = () => {
    setPhase('result');
    setSubmitState('submitting');
    submitScore('numbergame', name.trim(), totalScore)
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

  return (
    <div className="container py-4 checkgame-page">
      <div className="interview-kicker">
        <Hash size={18} />
        大寫數字訓練器
      </div>

      <div className="checkgame-layout">
        <div className="checkgame-main">
          {phase === 'intro' && (
            <IntroCard name={name} onNameChange={setName} onStart={startGame} intro={numberGameIntro} />
          )}

          {phase === 'playing' && current && (
            <QuestionCard
              question={current}
              index={index}
              total={round.length}
              secondsLeft={secondsLeft}
              answer={answer}
              onAnswerChange={setAnswer}
              revealed={revealed}
              correct={correct}
              lastGain={lastGain}
              isLast={isLast}
              onSubmit={submitAnswer}
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
      <h1 className="display-title checkgame-title">大寫數字訓練器</h1>
      <p className="checkgame-intro-text">{intro}</p>

      <form
        className="checkgame-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}
      >
        <label htmlFor="numbergame-name" className="checkgame-label">
          你的暱稱
        </label>
        <input
          id="numbergame-name"
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
  answer,
  onAnswerChange,
  revealed,
  correct,
  lastGain,
  isLast,
  onSubmit,
  onNext,
}: {
  question: NumberQuestion;
  index: number;
  total: number;
  secondsLeft: number;
  answer: string;
  onAnswerChange: (next: string) => void;
  revealed: boolean;
  correct: boolean;
  lastGain: number;
  isLast: boolean;
  onSubmit: () => void;
  onNext: () => void;
}) {
  const pct = (secondsLeft / SECONDS_PER_QUESTION) * 100;
  const low = secondsLeft <= 3;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the answer box when a new question appears.
  useEffect(() => {
    inputRef.current?.focus();
  }, [question.id]);

  // Show the typed digits with thousands separators; strip non-digits and clamp
  // to 9 digits (max 999,999,999) when reading them back.
  const display = answer ? Number(answer).toLocaleString('en-US') : '';

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 9);
    onAnswerChange(digits);
  };

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

      {question.kind === 'grid' ? (
        <>
          <p className="numbergame-prompt-label">把方格裡的大寫金額填回阿拉伯數字（✗ 代表該位是 0）</p>
          <div className="numbergame-grid" role="group" aria-label="大寫金額方格">
            {PLACE_HEADERS.map((header, i) => {
              const cell = question.cells[i];
              return (
                <div key={i} className="numbergame-col">
                  <span className="numbergame-head">{header}</span>
                  <div className={`numbergame-cell is-${cell.kind}`}>
                    {cell.kind === 'digit' && cell.char}
                    {cell.kind === 'zero' && '零'}
                    {cell.kind === 'cross' && <X size={20} strokeWidth={2.5} />}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="numbergame-prompt-label">把這張支票的大寫金額填回阿拉伯數字</p>
          <div className="numbergame-check">新臺幣 {question.capital}</div>
        </>
      )}

      <div className="numbergame-answer">
        <input
          ref={inputRef}
          className="numbergame-answer-input"
          type="text"
          inputMode="numeric"
          aria-label="你的答案（阿拉伯數字）"
          placeholder="輸入金額"
          value={display}
          disabled={revealed}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter 送出答案（與「送出答案」按鈕相同）。
            if (e.key === 'Enter' && !revealed) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <span className="numbergame-answer-unit">元</span>
      </div>

      {!revealed && (
        <button type="button" className="checkgame-btn checkgame-btn-primary numbergame-submit" onClick={onSubmit}>
          送出答案
        </button>
      )}

      {revealed && (
        <div className={`checkgame-reveal ${correct ? 'is-correct' : 'is-wrong'}`}>
          <div className="checkgame-reveal-head">
            <span className="checkgame-reveal-verdict">
              {correct ? '答對了！' : '答錯了'}
              　正解：{question.value.toLocaleString('en-US')} 元
            </span>
            <span className="checkgame-reveal-gain">+{lastGain} 分</span>
          </div>
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
