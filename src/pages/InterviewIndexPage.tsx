import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Sparkles } from 'lucide-react';
import { CandidateControls } from '../components/CandidateControls';
import { ChatPanel } from '../components/ChatPanel';
import { DismissibleAd } from '../components/DismissibleAd';
import { defaultProfile, isProfileEmpty, rankedForProfile } from '../lib/scoring';
import type { CandidateProfile, InterviewQuestion } from '../data/types';

// How many top-ranked questions one mock-interview session covers.
const SESSION_SIZE = 8;

interface Session {
  questions: InterviewQuestion[];
  key: number;
}

export function InterviewIndexPage() {
  const [profile, setProfile] = useState<CandidateProfile>(defaultProfile);
  const [session, setSession] = useState<Session | null>(null);

  const profileReady = !isProfileEmpty(profile);

  const updateProfile = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => {
    setProfile((current) => {
      if (key === 'hasBankExperience' && value !== 'yes') {
        return { ...current, hasBankExperience: value as CandidateProfile['hasBankExperience'], bankYears: defaultProfile.bankYears };
      }
      return { ...current, [key]: value };
    });
  };

  const handleReset = () => {
    setProfile(defaultProfile);
    setSession(null);
  };

  const startSession = () => {
    if (!profileReady) return;
    setSession({ questions: rankedForProfile(profile, SESSION_SIZE), key: Date.now() });
  };

  return (
    <section className="workspace-band">
      <div className="container py-4">
        <div className="row g-4">
          {/* on mobile this stacks ABOVE the content; on desktop it's the left sidebar */}
          <aside className="col-lg-4 col-xl-3 interview-aside">
            <CandidateControls
              profile={profile}
              onUpdate={updateProfile}
              onReset={handleReset}
              idPrefix="interview"
              showPracticeSize={false}
            />
          </aside>

          <div className="col-lg-8 col-xl-9">
            <div className="interview-kicker">
              <Sparkles size={18} />
              模擬面試
            </div>
            <h1 className="display-title interview-title">AI 模擬面試</h1>
            <p className="page-intro">
              先填寫考生條件，系統會依你的背景挑出最該優先練習的題目，由 AI 面試官帶你進行一場
              約 {SESSION_SIZE} 題的連續模擬面試：逐題發問、針對你的回答給回饋並追問。
              想單獨練某一題，可到<Link to="/"> 首頁 </Link>點該題。
            </p>

            {session ? (
              <>
                <div className="session-bar">
                  <span>本場面試涵蓋 {session.questions.length} 題（依目前條件排序）</span>
                  <button className="btn btn-outline-dark session-restart" type="button" onClick={startSession}>
                    <Play size={15} />
                    依目前條件重新開始
                  </button>
                </div>
                <ChatPanel questions={session.questions} sessionKey={session.key} />
              </>
            ) : (
              <div className="interview-start-card">
                <p className="interview-start-hint">
                  {profileReady ? '條件已就緒，可以開始了。' : '請先填寫考生條件（至少選一項），再開始模擬面試。'}
                </p>
                <button className="btn btn-dark interview-start-btn" type="button" onClick={startSession} disabled={!profileReady}>
                  <Play size={18} />
                  開始模擬面試
                </button>
              </div>
            )}
          </div>
        </div>

        <DismissibleAd slot="2222222222" />
      </div>
    </section>
  );
}
