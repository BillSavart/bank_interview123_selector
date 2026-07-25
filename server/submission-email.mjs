const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 5000;

const cleanSingleLine = (value, fallback) => {
  const cleaned = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return cleaned || fallback;
};

const cleanMultiline = (value, fallback) => {
  const cleaned = typeof value === 'string'
    // 移除不適合出現在純文字郵件中的控制字元，但保留換行與 tab。
    // eslint-disable-next-line no-control-regex
    ? value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim()
    : '';
  return cleaned || fallback;
};

const formatSubmittedAt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanSingleLine(value, '未知');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
};

const categoryLabel = (category) => (category === 'work' ? '工作篇' : '考試篇');

/**
 * 建立「使用者投稿成功後寄信」的通知器。三個郵件環境變數缺一時保持停用，
 * 讓本機開發與尚未設定郵件服務的部署不受影響。
 */
export function createSubmissionEmailNotifier({
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.SUBMISSION_EMAIL_FROM,
  recipients = process.env.SUBMISSION_NOTIFY_EMAIL,
  adminBaseUrl = process.env.ADMIN_BASE_URL,
  endpoint = RESEND_EMAIL_ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const normalizedFrom = typeof from === 'string' ? from.trim() : '';
  const to = typeof recipients === 'string'
    ? recipients.split(',').map((email) => email.trim()).filter(Boolean)
    : [];
  const normalizedAdminBaseUrl = typeof adminBaseUrl === 'string'
    ? adminBaseUrl.trim().replace(/\/$/, '')
    : '';

  const values = {
    RESEND_API_KEY: normalizedApiKey,
    SUBMISSION_EMAIL_FROM: normalizedFrom,
    SUBMISSION_NOTIFY_EMAIL: to.length > 0 ? to.join(',') : '',
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
  const configured = Object.values(values).some(Boolean);
  const enabled = missing.length === 0;

  return {
    enabled,
    partiallyConfigured: configured && !enabled,
    missing,

    async notify(post) {
      if (!enabled) return { sent: false, reason: 'disabled' };

      const title = cleanSingleLine(post?.title, '（未命名投稿）').slice(0, 100);
      const author = cleanSingleLine(post?.author, '匿名');
      const content = cleanMultiline(post?.content, '（無文章內文）');
      const adminLine = normalizedAdminBaseUrl
        ? `審核後台：${normalizedAdminBaseUrl}`
        : '請登入網站管理後台進行審核。';
      const text = [
        '網站收到一篇新的使用者投稿，正在等待審核。',
        '',
        `標題：${title}`,
        `作者：${author}`,
        `分類：${categoryLabel(post?.category)}`,
        `投稿時間：${formatSubmittedAt(post?.createdAt)}`,
        `投稿編號：${cleanSingleLine(post?.id, '未知')}`,
        '',
        '文章內文：',
        content,
        '',
        adminLine,
      ].join('\n');

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalizedApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `submission-${post.id}`,
        },
        body: JSON.stringify({
          from: normalizedFrom,
          to,
          subject: `[待審核投稿] ${title}`,
          text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend API ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
      }

      const payload = await response.json().catch(() => ({}));
      return { sent: true, id: payload.id || null };
    },
  };
}
