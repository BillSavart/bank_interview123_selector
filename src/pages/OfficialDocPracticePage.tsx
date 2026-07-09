import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, ImageDown, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  getOfficialDocQuestion,
  officialDocQuestions,
  type OfficialDocAnswer,
  type OfficialDocQuestion,
  type OfficialDocType,
} from '../data/officialDoc';

const blankAnswer: OfficialDocAnswer = {
  subject: '',
  description: '',
  method: '',
  speed: '',
  security: '',
  attachments: '',
  department: '',
};

export function OfficialDocPracticePage() {
  const params = useParams<{ questionId?: string }>();

  if (params.questionId) return <OfficialDocPracticeView questionId={params.questionId} />;
  return <OfficialDocQuestionList />;
}

function OfficialDocQuestionList() {
  const [selectedType, setSelectedType] = useState<OfficialDocType>('函');
  const visibleQuestions = officialDocQuestions.filter((question) => question.document_type === selectedType);

  return (
    <div className="container py-4 official-doc-page">
      <div className="official-doc-heading">
        <div className="interview-kicker">
          <FileText size={18} />
          公文練習器
        </div>
        <h1>臺灣公文練習器</h1>
        <p>選擇簽或函的考試常見情境，直接在對應的公文稿上練習主旨與說明。</p>
      </div>

      <div className="official-doc-type-switch" role="tablist" aria-label="公文類型">
        {(['簽', '函'] as OfficialDocType[]).map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={selectedType === type}
            className={selectedType === type ? 'is-active' : ''}
            onClick={() => setSelectedType(type)}
          >
            <strong>{type}</strong>
          </button>
        ))}
      </div>

      <div className="official-doc-question-grid">
        {visibleQuestions.map((question) => (
          <article className="official-doc-question-card" key={question.id}>
            {question.source_note && <div className="official-doc-source-label">{question.source_note}</div>}
            <h2>{question.title}</h2>
            {question.intro_instruction && (
              <strong className="official-doc-question-instruction">{question.intro_instruction}</strong>
            )}
            <p>{question.scenario}</p>
            {question.supplemental_instruction && (
              <strong className="official-doc-question-instruction">{question.supplemental_instruction}</strong>
            )}
            <Link className="official-doc-primary-link" to={`/official-doc-practice/${question.id}`}>
              <Play size={16} />
              開始練習
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

function OfficialDocPracticeView({ questionId }: { questionId: string }) {
  const question = getOfficialDocQuestion(questionId);
  const [answer, setAnswer] = useState<OfficialDocAnswer>(blankAnswer);
  const [showReference, setShowReference] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);

  useEffect(() => {
    if (!question) return;
    setAnswer(blankAnswer);
  }, [question]);

  if (!question) {
    return (
      <div className="container py-4 official-doc-page">
        <div className="official-doc-empty">
          <h1>找不到題目</h1>
          <Link to="/official-doc-practice">回題目列表</Link>
        </div>
      </div>
    );
  }

  const resetPractice = () => {
    if (!window.confirm('確定要清除本題作答內容嗎？')) return;
    setAnswer(blankAnswer);
  };

  const captureAnswerPaper = async () => {
    const paper = document.querySelector<HTMLElement>('.official-doc-paper-stage .official-doc-a4');
    if (!paper) throw new Error('找不到作答公文');
    await document.fonts.ready;
    const { default: html2canvas } = await import('html2canvas');
    paper.classList.add('is-exporting');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return await html2canvas(paper, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
    } finally {
      paper.classList.remove('is-exporting');
    }
  };

  const saveScreenshot = async () => {
    try {
      setExporting('png');
      const canvas = await captureAnswerPaper();
      const link = document.createElement('a');
      link.download = `${question.id}-作答紀錄.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      window.alert('截圖產生失敗，請稍後再試。');
    } finally {
      setExporting(null);
    }
  };

  const downloadPdf = async () => {
    try {
      setExporting('pdf');
      const canvas = await captureAnswerPaper();
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const renderHeight = Math.min(imageHeight, pageHeight);
      const renderWidth = (canvas.width * renderHeight) / canvas.height;
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        (pageWidth - renderWidth) / 2,
        0,
        renderWidth,
        renderHeight,
      );
      pdf.save(`${question.id}-作答紀錄.pdf`);
    } catch {
      window.alert('PDF 產生失敗，請稍後再試。');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="official-doc-page official-doc-workspace">
      <div className="official-doc-topbar">
        <div className="official-doc-topbar-main">
          <Link className="official-doc-back-link" to="/official-doc-practice">
            題目列表
          </Link>
          <div className="official-doc-topbar-title">
            <FileText size={17} />
            <span>{question.title}</span>
          </div>
          <span className="official-doc-topbar-meta">
            {question.document_type === '簽'
              ? `${question.sender} 擬簽，陳 ${question.receiver}`
              : `${question.sender} 發函 ${question.receiver}`}
          </span>
        </div>
        <div className="official-doc-actions official-doc-actions-inline">
          <button
            type="button"
            className="official-doc-secondary-button official-doc-ai-button"
            aria-pressed={showReference}
            onClick={() => setShowReference((current) => !current)}
          >
            <Sparkles size={16} />
            AI 參考答案
          </button>
          <button
            type="button"
            className="official-doc-secondary-button"
            disabled={exporting !== null}
            onClick={downloadPdf}
          >
            <Download size={16} />
            {exporting === 'pdf' ? '產生中' : '下載 PDF'}
          </button>
          <button
            type="button"
            className="official-doc-secondary-button"
            disabled={exporting !== null}
            onClick={saveScreenshot}
          >
            <ImageDown size={16} />
            {exporting === 'png' ? '產生中' : '儲存截圖'}
          </button>
          <button type="button" className="official-doc-secondary-button" onClick={resetPractice}>
            <RotateCcw size={16} />
            清除內容
          </button>
        </div>
      </div>

      <div className={`official-doc-studio ${showReference ? 'is-comparing' : ''}`}>
        <aside className="official-doc-support-panel">
          <QuestionFacts question={question} />
        </aside>

        <section className="official-doc-paper-stage">
          <LiveOfficialDocPreview question={question} answer={answer} onChange={setAnswer} />
        </section>

        {showReference && (
          <section className="official-doc-reference-stage" aria-labelledby="official-doc-reference-title">
            <div
              className={`official-doc-a4 official-doc-reference-paper ${
                question.document_type === '函' ? 'is-letter-reference' : ''
              }`}
            >
              <button
                type="button"
                className="official-doc-reference-close"
                aria-label="關閉參考答案"
                onClick={() => setShowReference(false)}
              >
                <X size={20} />
              </button>
              <div className="official-doc-reference-model" id="official-doc-reference-title">
                {question.ai_reference_model ? `${question.ai_reference_model} 的參考答案` : 'AI 參考答案'}
              </div>
              {question.ai_reference_model ? (
                <ReferenceAnswerBody question={question} />
              ) : (
                <p className="official-doc-reference-empty">參考答案尚未加入，待提供 GPT 參考答案後顯示於此。</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ReferenceAnswerBody({ question }: { question: OfficialDocQuestion }) {
  if (question.document_type === '函') {
    return (
      <>
        <div className="official-doc-reference-paper-meta">
          <span>檔號：</span>
          <span>保存年限：</span>
        </div>
        <div className="official-doc-preview-title">臺灣銀行股份有限公司　函</div>
        <div className="official-doc-preview-contact">
          <span>地址：○○市○○區○○路○○號</span>
          <span>承辦人：{question.contact_person}</span>
          <span>電話：{question.contact_phone || '○○○○○○○○○○'}</span>
          <span>電子信箱：{question.contact_email || '○○○@mail.bot.com.tw'}</span>
        </div>
        <dl className="official-doc-preview-grid official-doc-header-fields">
          <div>
            <dt>受文者：</dt>
            <dd>{question.receiver}</dd>
          </div>
          <div>
            <dt>發文日期：</dt>
            <dd>中華民國○○○年○○月○○日</dd>
          </div>
          <div>
            <dt>發文字號：</dt>
            <dd>○○字第○○○○○○○○○○號</dd>
          </div>
          <div>
            <dt>速別：</dt>
            <dd>{question.reference_speed}</dd>
          </div>
          <div>
            <dt>密等及解密條件或保密期限：</dt>
            <dd>{question.reference_security || '\u00a0'}</dd>
          </div>
          <div>
            <dt>附件：</dt>
            <dd>{question.reference_attachments}</dd>
          </div>
        </dl>
        <div className="official-doc-reference-content">
          <section>
            <h3>主旨：</h3>
            <p>{question.reference_answer_subject}</p>
          </section>
          <section>
            <h3>說明：</h3>
            <p>{question.reference_answer_description}</p>
          </section>
        </div>
        <dl className="official-doc-preview-grid official-doc-preview-footer">
          <dt>正本：</dt>
          <dd>{question.receiver}</dd>
          <dt>副本：</dt>
          <dd>本行相關單位</dd>
        </dl>
        <div className="official-doc-signature">
          <span>總經理</span>
          <strong>○○○</strong>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="official-doc-reference-paper-meta">
        <span>檔號：</span>
        <span>保存年限：</span>
      </div>
      <div className="official-doc-reference-paper-title">簽</div>
      <dl className="official-doc-reference-sign-meta">
        <dt>日期：</dt>
        <dd>○○○年○○月○○日</dd>
        <dt>於：</dt>
        <dd>{question.sender}</dd>
      </dl>
      <div className="official-doc-reference-content">
        <section>
          <h3>主旨：</h3>
          <p>{question.reference_answer_subject}</p>
        </section>
        <section>
          <h3>說明：</h3>
          <p>{question.reference_answer_description}</p>
        </section>
        <section>
          <h3>擬辦：</h3>
          <p>{question.reference_answer_method}</p>
        </section>
      </div>
      <div className="official-doc-sign-routing">
        <div className="official-doc-routing-cell">承辦單位</div>
        <div className="official-doc-routing-cell">會辦單位</div>
        <div className="official-doc-routing-cell">決行</div>
      </div>
    </>
  );
}

function QuestionFacts({ question }: { question: OfficialDocQuestion }) {
  return (
    <div className="official-doc-facts">
      <div>
        <span>題目</span>
        {question.intro_instruction && (
          <strong className="official-doc-question-instruction">{question.intro_instruction}</strong>
        )}
        <p>{question.scenario}</p>
        {question.supplemental_instruction && (
          <strong className="official-doc-question-instruction">{question.supplemental_instruction}</strong>
        )}
      </div>
    </div>
  );
}

function LiveOfficialDocPreview({
  question,
  answer,
  onChange,
}: {
  question: OfficialDocQuestion;
  answer: OfficialDocAnswer;
  onChange: (next: OfficialDocAnswer) => void;
}) {
  if (question.document_type === '簽') {
    return <LiveSignPreview question={question} answer={answer} onChange={onChange} />;
  }

  const empty = '○○○';

  return (
    <div className="official-doc-a4">
      <div className="official-doc-binding-rail" aria-hidden="true">
        <span>裝</span>
        <span>訂</span>
        <span>線</span>
      </div>

      <div className="official-doc-paper-meta">
        <span className="official-doc-copy-mark">正本</span>
        <div className="official-doc-file-meta">
          <span>檔號：</span>
          <span>保存年限：</span>
        </div>
      </div>

      <div className="official-doc-preview-title">臺灣銀行股份有限公司　函</div>
      <div className="official-doc-preview-contact">
        <span>地址：○○市○○區○○路○○號</span>
        <span>承辦人：{question.contact_person || empty}</span>
        <span>電話：{question.contact_phone || empty}</span>
        <span>電子信箱：{question.contact_email || empty}</span>
      </div>

      <dl className="official-doc-preview-grid official-doc-header-fields">
        <div>
          <dt>受文者：</dt>
          <dd>{question.receiver}</dd>
        </div>
        <div>
          <dt>發文日期：</dt>
          <dd>{empty}年{empty}月{empty}日</dd>
        </div>
        <div>
          <dt>發文字號：</dt>
          <dd>{empty}字第{empty}號</dd>
        </div>
        <div>
          <dt>速別：</dt>
          <dd>
            <EditableInlineField
              label="速別"
              value={answer.speed}
              onChange={(speed) => onChange({ ...answer, speed })}
            />
          </dd>
        </div>
        <div>
          <dt>密等及解密條件或保密期限：</dt>
          <dd>
            <EditableInlineField
              label="密等及解密條件或保密期限"
              value={answer.security}
              onChange={(security) => onChange({ ...answer, security })}
            />
          </dd>
        </div>
        <div>
          <dt>附件：</dt>
          <dd>
            <EditableInlineField
              label="附件"
              value={answer.attachments}
              onChange={(attachments) => onChange({ ...answer, attachments })}
            />
          </dd>
        </div>
      </dl>

      <EditablePreviewSection
        label="主旨"
        value={answer.subject}
        singleLine
        onChange={(subject) => onChange({ ...answer, subject })}
      />
      <EditablePreviewSection
        label="說明"
        value={answer.description}
        onChange={(description) => onChange({ ...answer, description })}
      />

      <dl className="official-doc-preview-grid official-doc-preview-footer">
        <dt>正本：</dt>
        <dd>{question.receiver}</dd>
        <dt>副本：</dt>
        <dd>總行相關單位</dd>
      </dl>

      <div className="official-doc-signature">
        <span>總經理</span>
        <strong>{empty}</strong>
      </div>
    </div>
  );
}

function LiveSignPreview({
  question,
  answer,
  onChange,
}: {
  question: OfficialDocQuestion;
  answer: OfficialDocAnswer;
  onChange: (next: OfficialDocAnswer) => void;
}) {
  const empty = '○○○';

  return (
    <div className="official-doc-a4 official-doc-sign-paper">
      <div className="official-doc-sign-header">
        <div className="official-doc-sign-heading">簽</div>
        <div className="official-doc-file-meta">
          <span>檔號：</span>
          <span>保存年限：</span>
        </div>
      </div>
      <dl className="official-doc-sign-meta">
        <dt>日期：</dt>
        <dd>{empty}年{empty}月{empty}日</dd>
        <dt>於：</dt>
        <dd>
          <EditableInlineField
            label="於"
            value={answer.department}
            onChange={(department) => onChange({ ...answer, department })}
          />
        </dd>
      </dl>

      <EditablePreviewSection
        label="主旨"
        value={answer.subject}
        singleLine
        onChange={(subject) => onChange({ ...answer, subject })}
      />
      <EditablePreviewSection
        label="說明"
        value={answer.description}
        onChange={(description) => onChange({ ...answer, description })}
      />
      <EditablePreviewSection
        label="擬辦"
        value={answer.method}
        onChange={(method) => onChange({ ...answer, method })}
      />

      <div className="official-doc-sign-routing">
        <div className="official-doc-routing-cell">承辦單位</div>
        <div className="official-doc-routing-cell">會辦單位</div>
        <div className="official-doc-routing-cell">決行</div>
      </div>
    </div>
  );
}

function EditableInlineField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = inputRef.current;
    if (!element || element.innerText === value || document.activeElement === element) return;
    element.innerText = value;
  }, [value]);

  return (
    <span
      ref={inputRef}
      className="official-doc-inline-input"
      contentEditable
      role="textbox"
      aria-label={label}
      onInput={(event) => onChange(event.currentTarget.innerText)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault();
      }}
      suppressContentEditableWarning
    />
  );
}

function EditablePreviewSection({
  label,
  value,
  singleLine = false,
  onChange,
}: {
  label: string;
  value: string;
  singleLine?: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = inputRef.current;
    if (!element || element.innerText === value) return;
    if (document.activeElement === element && value) return;
    element.innerText = value;
  }, [value]);

  return (
    <section className="official-doc-preview-section">
      <strong>{label}：</strong>
      <div
        ref={inputRef}
        className={`official-doc-paper-input ${singleLine ? 'is-single-line' : ''}`}
        contentEditable
        onInput={(event) => onChange(event.currentTarget.innerText)}
        onKeyDown={(event) => {
          if (singleLine && event.key === 'Enter') event.preventDefault();
        }}
        role="textbox"
        aria-label={label}
        suppressContentEditableWarning
      />
    </section>
  );
}
