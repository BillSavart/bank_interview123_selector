import { useEffect, useRef, useState } from 'react';
import { RefreshCcw, Send } from 'lucide-react';
import type { InterviewQuestion } from '../data/types';
import { describeError, streamChat, type ChatMessage } from '../lib/chat';

interface ChatPanelProps {
  // one question for single-question practice, or several for a full interview session
  questions: InterviewQuestion[];
  // change this to start a fresh conversation (e.g. question id, or a restart counter)
  sessionKey: string | number;
}

// Full-page mock-interview chat. Re-seeds itself when `sessionKey` changes.
export function ChatPanel({ questions, sessionKey }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const runAssistantTurn = async (history: ChatMessage[]) => {
    setError('');
    setIsStreaming(true);
    setMessages([...history, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        questions.map((q) => q.question),
        history,
        (delta) => {
          setMessages((current) => {
            const next = current.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta };
            return next;
          });
          scrollToBottom();
        },
        controller.signal,
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(describeError(e));
        setMessages((current) => {
          const last = current[current.length - 1];
          if (last && last.role === 'assistant' && last.content === '') return current.slice(0, -1);
          return current;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  // (Re)start the interview whenever the session changes.
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    void runAssistantTurn([{ role: 'user', content: '請開始這場模擬面試。' }]);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    scrollToBottom();
    void runAssistantTurn(history);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleRestart = () => {
    if (isStreaming) return;
    void runAssistantTurn([{ role: 'user', content: '請重新開始這場模擬面試。' }]);
  };

  // hide the seed "請開始這場模擬面試" user turn from the transcript
  const visible = messages.filter((m, i) => !(i === 0 && m.role === 'user'));

  return (
    <div className="chat-panel">
      <div className="chat-body" ref={scrollRef}>
        {visible.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.content || (isStreaming && i === visible.length - 1 ? '思考中…' : '')}
          </div>
        ))}
        {error && <div className="chat-error">{error}</div>}
      </div>

      <div className="chat-input-row">
        <button
          className="btn btn-outline-dark chat-restart"
          type="button"
          onClick={handleRestart}
          disabled={isStreaming}
          aria-label="重新開始"
          title="重新開始這題"
        >
          <RefreshCcw size={18} />
        </button>
        <textarea
          className="chat-input"
          placeholder="輸入你的回答，Enter 送出 / Shift+Enter 換行"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isStreaming}
        />
        <button
          className="btn btn-dark chat-send"
          type="button"
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          aria-label="送出"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
