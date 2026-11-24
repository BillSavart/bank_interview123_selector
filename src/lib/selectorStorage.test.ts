import { describe, expect, it } from 'vitest';
import { interviewQuestions } from '../data/questions.generated';
import { defaultProfile } from './scoring';
import {
  parsePracticeStatus,
  parseSelectorState,
  profileFromParams,
  profileToParams,
  summarizePractice,
  withoutProfileParams,
} from './selectorStorage';
import type { CandidateProfile } from '../data/types';

const filled: CandidateProfile = {
  ...defaultProfile,
  ageRange: 'under24',
  workYears: 'none',
  isFreshGraduate: 'yes',
  hasBankExperience: 'yes',
  bankYears: '1to3',
  targetFocus: 'sales',
  practiceSize: 35,
};

describe('parseSelectorState', () => {
  it('還原合法的已存條件', () => {
    const state = parseSelectorState({ profile: filled, practiceSizeTouched: true });
    expect(state).toEqual({ profile: filled, practiceSizeTouched: true });
  });

  it('不合法的欄位退回預設值，題數依條件自動決定', () => {
    const state = parseSelectorState({
      profile: { ageRange: 'old', workYears: 'none', targetFocus: 42, practiceSize: 999 },
      practiceSizeTouched: false,
    });
    expect(state?.profile).toEqual({ ...defaultProfile, workYears: 'none', practiceSize: 20 });
    expect(state?.practiceSizeTouched).toBe(false);
  });

  it('手動題數會限制在 10 ~ 題庫總數之間', () => {
    const low = parseSelectorState({ profile: { ...filled, practiceSize: 3 }, practiceSizeTouched: true });
    const high = parseSelectorState({ profile: { ...filled, practiceSize: 999 }, practiceSizeTouched: true });
    expect(low?.profile.practiceSize).toBe(10);
    expect(high?.profile.practiceSize).toBe(interviewQuestions.length);
  });

  it('沒有銀行經驗時，銀行年資回到預設', () => {
    const state = parseSelectorState({ profile: { ...filled, hasBankExperience: 'unset' }, practiceSizeTouched: true });
    expect(state?.profile.bankYears).toBe(defaultProfile.bankYears);
  });

  it('壞資料回傳 null', () => {
    expect(parseSelectorState(null)).toBeNull();
    expect(parseSelectorState('x')).toBeNull();
    expect(parseSelectorState({})).toBeNull();
  });
});

describe('分享網址參數', () => {
  it('來回轉換後條件一致', () => {
    const params = profileToParams(filled);
    expect(profileFromParams(params)).toEqual({ profile: filled, practiceSizeTouched: true });
  });

  it('只輸出與預設不同的欄位，自動題數不寫進網址', () => {
    const profile = { ...defaultProfile, ageRange: '30plus' as const, practiceSize: 20 };
    expect(profileToParams(profile).toString()).toBe('age=30plus');
    expect(profileFromParams(new URLSearchParams('age=30plus'))).toEqual({ profile, practiceSizeTouched: false });
  });

  it('沒有條件參數時回傳 null，並保留其他參數', () => {
    const params = new URLSearchParams('utm_source=line&age=under24&n=15');
    expect(profileFromParams(new URLSearchParams('utm_source=line'))).toBeNull();
    expect(withoutProfileParams(params).toString()).toBe('utm_source=line');
  });

  it('忽略網址中不合法的值', () => {
    const state = profileFromParams(new URLSearchParams('age=99&focus=hack&n=abc'));
    expect(state).toEqual({ profile: { ...defaultProfile }, practiceSizeTouched: false });
  });
});

describe('練習進度', () => {
  it('只保留存在的題號與合法狀態', () => {
    expect(parsePracticeStatus({ 1: 'mastered', 2: 'nope', 9999: 'practiced', abc: 'unfamiliar', 3: 'unfamiliar' })).toEqual({
      1: 'mastered',
      3: 'unfamiliar',
    });
    expect(parsePracticeStatus(null)).toEqual({});
  });

  it('依題目統計各狀態數量', () => {
    const questions = interviewQuestions.slice(0, 4);
    const ids = questions.map((question) => question.id);
    const summary = summarizePractice(questions, { [ids[0]]: 'mastered', [ids[1]]: 'unfamiliar', [ids[2]]: 'mastered' });
    expect(summary).toEqual({ total: 4, unfamiliar: 1, practiced: 0, mastered: 2 });
  });
});
