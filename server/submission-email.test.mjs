import { describe, expect, it, vi } from 'vitest';
import { createSubmissionEmailNotifier } from './submission-email.mjs';

const post = {
  id: 'da308a96-f799-4caa-a330-0c169cc55ac6',
  title: ' 第一銀行\n面試心得 ',
  author: '',
  category: 'work',
  content: '第一段面試流程。\n\n第二段心得與建議。',
  createdAt: '2026-07-15T02:30:00.000Z',
};

describe('submission email notifier', () => {
  it('stays disabled when mail secrets are not configured', async () => {
    const fetchImpl = vi.fn();
    const notifier = createSubmissionEmailNotifier({
      apiKey: '',
      from: '',
      recipients: '',
      fetchImpl,
    });

    expect(notifier.enabled).toBe(false);
    expect(await notifier.notify(post)).toEqual({ sent: false, reason: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends a plain-text notification with an admin link and idempotency key', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-123' }),
    }));
    const notifier = createSubmissionEmailNotifier({
      apiKey: 're_test_key',
      from: '網站通知 <notifications@example.com>',
      recipients: 'owner@example.com, backup@example.com',
      adminBaseUrl: 'https://admin.example.com/',
      fetchImpl,
    });

    expect(notifier.enabled).toBe(true);
    await expect(notifier.notify(post)).resolves.toEqual({ sent: true, id: 'email-123' });
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, request] = fetchImpl.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe('https://api.resend.com/emails');
    expect(request.headers.Authorization).toBe('Bearer re_test_key');
    expect(request.headers['Idempotency-Key']).toBe(`submission-${post.id}`);
    expect(body).toMatchObject({
      from: '網站通知 <notifications@example.com>',
      to: ['owner@example.com', 'backup@example.com'],
      subject: '[待審核投稿] 第一銀行 面試心得',
    });
    expect(body.text).toContain('作者：匿名');
    expect(body.text).toContain('分類：工作篇');
    expect(body.text).toContain('投稿時間：2026/07/15 10:30');
    expect(body.text).toContain('文章內文：\n第一段面試流程。\n\n第二段心得與建議。');
    expect(body.text).toContain('審核後台：https://admin.example.com');
  });

  it('uses a fallback when the submitted post has no content', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-456' }),
    }));
    const notifier = createSubmissionEmailNotifier({
      apiKey: 're_test_key',
      from: '網站通知 <notifications@example.com>',
      recipients: 'owner@example.com',
      fetchImpl,
    });

    await notifier.notify({ ...post, content: ' \n ' });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text).toContain('文章內文：\n（無文章內文）');
  });

  it('surfaces provider failures without exposing the API key', async () => {
    const notifier = createSubmissionEmailNotifier({
      apiKey: 're_secret_value',
      from: '網站通知 <notifications@example.com>',
      recipients: 'owner@example.com',
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => 'sender domain is not verified',
      })),
    });

    const error = await notifier.notify(post).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Resend API 422');
    expect(error.message).not.toContain('re_secret_value');
  });
});
