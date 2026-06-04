import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import type { InterviewQuestion } from './data/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface InterviewChatProps {
  question: InterviewQuestion;
  onClose: () => void;
}

// Streams from the proxy's normalized SSE: lines of `data: {"text":"..."}` / {"done":true} / {"error":"..."}.
async function streamChat(
  question: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    if (res.status === 429) throw new Error('請求過於頻繁，請稍候再試。');
    throw new Error('連線失敗，請稍後再試。');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      try {
        const payload = JSON.parse(trimmed.slice(5).trim());
        if (payload.error) throw new Error(payload.error);
        if (payload.text) onDelta(payload.text);
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e;
      }
    }
  }
}

export function InterviewChat({ question, onClose }: InterviewChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // Run one streamed assistant turn over the given conversation.
  const runAssistantTurn = async (history: ChatMessage[]) => {
    setError('');
    setIsStreaming(true);
    setMessages([...history, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        question.question,
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
        setError(e instanceof Error ? e.message : '發生未知錯誤。');
        // drop the empty assistant bubble on failure
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

  // Kick off the interviewer's opening question once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runAssistantTurn([{ role: 'user', content: '請開始這場模擬面試。' }]);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // hide the seed "請開始這場模擬面試" user turn from the transcript
  const visible = messages.filter((m, i) => !(i === 0 && m.role === 'user'));

  return (
    <div className="chat-modal" role="dialog" aria-modal="true" aria-label="模擬面試">
      <button className="chat-backdrop" type="button" aria-label="關閉模擬面試" onClick={onClose} />
      <div className="chat-drawer">
        <header className="chat-header">
          <div className="chat-header-title">
            <Sparkles size={18} />
            <div>
              <span>模擬面試</span>
              <strong>{question.category}</strong>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="關閉" onClick={onClose}>
            <X size={19} />
          </button>
        </header>

        <p className="chat-question">{question.question}</p>

        <div className="chat-body" ref={scrollRef}>
          {visible.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.content || (isStreaming && i === visible.length - 1 ? '思考中…' : '')}
            </div>
          ))}
          {error && <div className="chat-error">{error}</div>}
        </div>

        <div className="chat-input-row">
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
    </div>
  );
}
