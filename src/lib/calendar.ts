// 招考行事曆的型別與 API 呼叫。公開讀取走 /api/calendar；後台編輯走
// /api/admin/calendar/*，由管理員工作階段驗證。
import { adminFetch } from './adminSession';

export interface CalendarEvent {
  id: string;
  /** 招考機關 / 名稱，例如「台灣銀行 一般金融人員」。 */
  org: string;
  /** 報名起始日（YYYY-MM-DD）。 */
  signupStart: string;
  /** 報名截止日（YYYY-MM-DD）。 */
  signupEnd: string;
  /** 筆試日期（YYYY-MM-DD，可含時間 HH:MM）。 */
  writtenExam: string;
  /** 試題與解答公告日（YYYY-MM-DD，可含時間 HH:MM）。 */
  answerKey: string;
  /** 筆試結果公佈日（YYYY-MM-DD，可含時間 HH:MM）。 */
  writtenResult: string;
  /** 面試（一面）日期（YYYY-MM-DD）。 */
  interview: string;
  /** 二面日期（YYYY-MM-DD）。 */
  interview2: string;
  /** 放榜日（YYYY-MM-DD）。 */
  finalResult: string;
  /** 簡章連結。 */
  link: string;
  /** 備註。 */
  note: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 後台表單可編輯的欄位（不含 id / 時間戳）。 */
export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;

export const emptyEventInput = (): CalendarEventInput => ({
  org: '',
  signupStart: '',
  signupEnd: '',
  writtenExam: '',
  answerKey: '',
  writtenResult: '',
  interview: '',
  interview2: '',
  finalResult: '',
  link: '',
  note: '',
});

/** 公開讀取行事曆事件（已由後端依日期排序）。 */
export async function fetchCalendar(): Promise<CalendarEvent[]> {
  const res = await fetch('/api/calendar', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('calendar fetch failed');
  const payload = (await res.json()) as { events?: CalendarEvent[] };
  return payload.events || [];
}

/** 取回管理員行事曆，同時確認工作階段有效。 */
export async function fetchAdminCalendar(): Promise<CalendarEvent[]> {
  const res = await adminFetch('/api/admin/calendar');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('admin calendar fetch failed');
  const payload = (await res.json()) as { events?: CalendarEvent[] };
  return payload.events || [];
}

export async function createEvent(input: CalendarEventInput): Promise<CalendarEvent[]> {
  const res = await adminFetch('/api/admin/calendar', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return handleWriteResponse(res);
}

export async function updateEvent(
  id: string,
  input: CalendarEventInput,
): Promise<CalendarEvent[]> {
  const res = await adminFetch(`/api/admin/calendar/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return handleWriteResponse(res);
}

export async function deleteEvent(id: string): Promise<CalendarEvent[]> {
  const res = await adminFetch(`/api/admin/calendar/${id}`, {
    method: 'DELETE',
  });
  return handleWriteResponse(res);
}

async function handleWriteResponse(res: Response): Promise<CalendarEvent[]> {
  const payload = (await res.json().catch(() => ({}))) as { events?: CalendarEvent[]; error?: string };
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(payload.error || '操作失敗，請稍後再試。');
  return payload.events || [];
}
