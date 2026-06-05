import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { interviewQuestions } from '../data/questions.generated';
import { tagLabels } from '../lib/scoring';
import { ChatPanel } from '../components/ChatPanel';

export function InterviewPage() {
  const { id } = useParams();
  const question = interviewQuestions.find((q) => String(q.id) === id);

  if (!question) {
    return (
      <div className="container py-5 interview-missing">
        <h1>找不到這道題目</h1>
        <p>題號可能有誤，請回題庫重新選擇。</p>
        <Link className="btn btn-dark" to="/interview">
          <ArrowLeft size={17} />
          回模擬面試選題
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-4 interview-page">
      <Link className="back-link" to="/interview">
        <ArrowLeft size={17} />
        選擇其他題目
      </Link>

      <div className="interview-head">
        <div className="interview-kicker">
          <Sparkles size={18} />
          模擬面試
          <span className="interview-meta">{question.category}・{question.difficulty}・#{question.id}</span>
        </div>
        <h1 className="interview-question">{question.question}</h1>
        <div className="tag-row">
          {question.tags.slice(0, 6).map((tag) => (
            <span key={tag}>{tagLabels[tag]}</span>
          ))}
        </div>
      </div>

      <ChatPanel questions={[question]} sessionKey={question.id} />
    </div>
  );
}
