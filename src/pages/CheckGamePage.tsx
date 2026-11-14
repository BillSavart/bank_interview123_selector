import { useMemo, useState } from 'react';
import { Check, X, Trophy, Timer, ClipboardCheck, RotateCcw } from 'lucide-react';
import { checkGameIntro, SECONDS_PER_QUESTION, type CheckAnswer, type CheckQuestion } from '../data/checkGame';
import type { LeaderboardEntry } from '../lib/leaderboard';
import { useRankedGame } from '../lib/useRankedGame';

type CheckPrompt = Omit<CheckQuestion, 'answer' | 'explanation'>;
const ANSWER_LABEL: Record<CheckAnswer, string> = { can: '可以', cannot: '不可以' };

export function CheckGamePage() {
  const game = useRankedGame<CheckPrompt, CheckAnswer>('checkgame');
  const { phase, name, round, grade, busy, error } = game;
  const [picked, setPicked] = useState<CheckAnswer | null>(null);
  const start = () => { setPicked(null); game.start(); };
  const next = () => { setPicked(null); game.next(); };

  return (
    <div className="container py-4 checkgame-page">
      <div className="interview-kicker">
        <ClipboardCheck size={18} />
        支票審查員
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
            <IntroCard
              name={name}
              onNameChange={game.setName}
              onStart={start}
              intro={checkGameIntro}
              busy={busy}
            />
          )}

          {phase === 'playing' && round && (
            <QuestionCard
              question={round.question}
              index={round.index}
              total={round.total}
              secondsLeft={game.secondsLeft}
              picked={picked}
              revealed={!!grade}
              correct={grade?.correct || false}
              correctAnswer={grade?.answer}
              explanation={grade?.explanation}
              timedOut={grade?.timedOut || false}
              lastGain={grade?.gain || 0}
              isLast={round.index + 1 === round.total}
              busy={busy}
              onPick={(answer) => { setPicked(answer); game.answer(answer); }}
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
  picked,
  revealed,
  correct,
  correctAnswer,
  explanation,
  timedOut,
  busy,
  lastGain,
  isLast,
  onPick,
  onNext,
}: {
  question: CheckPrompt;
  index: number;
  total: number;
  secondsLeft: number;
  picked: CheckAnswer | null;
  revealed: boolean;
  correct: boolean;
  correctAnswer?: CheckAnswer;
  explanation?: string;
  timedOut: boolean;
  busy: boolean;
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
          const isAnswer = revealed && correctAnswer === value;
          const isWrongPick = revealed && picked === value && picked !== correctAnswer;
          return (
            <button
              key={value}
              type="button"
              className={`checkgame-choice ${value === 'can' ? 'is-can' : 'is-cannot'} ${
                isAnswer ? 'is-correct' : ''
              } ${isWrongPick ? 'is-wrong' : ''}`}
              disabled={revealed || busy}
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
              {timedOut ? '時間到！' : correct ? '答對了！' : '答錯了'}
              　正解：{correctAnswer && ANSWER_LABEL[correctAnswer]}
            </span>
            <span className="checkgame-reveal-gain">+{lastGain} 分</span>
          </div>
          <p className="checkgame-explanation">{explanation}</p>
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
