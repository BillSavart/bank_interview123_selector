import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, Timer, Hash, RotateCcw, X } from 'lucide-react';
import {
  numberGameIntro, SECONDS_PER_QUESTION, type GridQuestion, type CheckQuestion,
} from '../data/numberGame';
import { PLACE_HEADERS } from '../lib/chineseNumerals';
import type { LeaderboardEntry } from '../lib/leaderboard';
import { useRankedGame } from '../lib/useRankedGame';

type NumberPrompt = Omit<GridQuestion, 'value'> | Omit<CheckQuestion, 'value'>;

export function NumberTrainerPage() {
  const game = useRankedGame<NumberPrompt, number>('numbergame');
  const { phase, name, round, grade, busy, error } = game;
  const [answer, setAnswer] = useState('');
  const start = () => { setAnswer(''); game.start(); };
  const next = () => { setAnswer(''); game.next(); };

  return (
    <div className="container py-4 checkgame-page">
      <div className="interview-kicker">
        <Hash size={18} />
        大寫數字訓練器
      </div>

      <div className="checkgame-layout">
        <div className="checkgame-main">
          {error && (
            <div className="mb-3">
              <p className="text-danger" role="alert">{error}</p>
              {phase === 'playing' && <button type="button" className="checkgame-btn" onClick={start}>重新開始</button>}
            </div>
          )}
          {phase === 'intro' && (
            <IntroCard name={name} onNameChange={game.setName} onStart={start} intro={numberGameIntro} busy={busy} />
          )}

          {phase === 'playing' && round && (
            <QuestionCard
              question={round.question}
              index={round.index}
              total={round.total}
              secondsLeft={game.secondsLeft}
              answer={answer}
              onAnswerChange={setAnswer}
              revealed={!!grade}
              correct={grade?.correct || false}
              correctAnswer={grade?.answer}
              timedOut={grade?.timedOut || false}
              lastGain={grade?.gain || 0}
              isLast={round.index + 1 === round.total}
              busy={busy}
              onSubmit={() => game.answer(answer ? Number(answer) : null)}
              onNext={next}
            />
          )}

          {phase === 'result' && (
            <ResultCard
              name={name}
              totalScore={grade?.totalScore || 0}
              rank={game.rank}
              submitState={game.submitState}
              onReplay={start}
              busy={busy}
            />
          )}
        </div>

        <aside className="checkgame-side">
          <LeaderboardPanel entries={game.leaderboard} playerName={name} />
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
  busy,
}: {
  name: string;
  onNameChange: (v: string) => void;
  onStart: () => void;
  intro: string;
  busy: boolean;
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
        <button type="submit" className="checkgame-btn checkgame-btn-primary" disabled={busy || !name.trim()}>
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
  correctAnswer,
  timedOut,
  busy,
  lastGain,
  isLast,
  onSubmit,
  onNext,
}: {
  question: NumberPrompt;
  index: number;
  total: number;
  secondsLeft: number;
  answer: string;
  onAnswerChange: (next: string) => void;
  revealed: boolean;
  correct: boolean;
  correctAnswer?: number;
  timedOut: boolean;
  busy: boolean;
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
          disabled={revealed || busy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter 送出答案（與「送出答案」按鈕相同）。
            if (e.key === 'Enter' && !revealed && !busy) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <span className="numbergame-answer-unit">元</span>
      </div>

      {!revealed && (
        <button type="button" className="checkgame-btn checkgame-btn-primary numbergame-submit" onClick={onSubmit} disabled={busy}>
          送出答案
        </button>
      )}

      {revealed && (
        <div className={`checkgame-reveal ${correct ? 'is-correct' : 'is-wrong'}`}>
          <div className="checkgame-reveal-head">
            <span className="checkgame-reveal-verdict">
              {timedOut ? '時間到！' : correct ? '答對了！' : '答錯了'}
              　正解：{correctAnswer?.toLocaleString('en-US')} 元
            </span>
            <span className="checkgame-reveal-gain">+{lastGain} 分</span>
          </div>
          <button type="button" className="checkgame-btn checkgame-btn-primary" onClick={onNext} disabled={busy}>
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
  busy,
}: {
  name: string;
  totalScore: number;
  rank: number | null;
  submitState: 'idle' | 'submitting' | 'done' | 'error';
  onReplay: () => void;
  busy: boolean;
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

      <button type="button" className="checkgame-btn checkgame-btn-primary" onClick={onReplay} disabled={busy}>
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
