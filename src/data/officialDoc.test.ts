import { describe, expect, it } from 'vitest';
import {
  convertHalfwidthPunctuation,
  findHalfwidthPunctuation,
  officialDocQuestions,
} from './officialDoc';

const question = officialDocQuestions[0];

describe('official document validation', () => {
  it('keeps the official document questions focused on internal branch notices', () => {
    const letter = officialDocQuestions.find((item) => item.document_type === '函');
    expect(letter?.scenario_type).toBe('INTERNAL');
    expect(letter?.receiver).toContain('分行');
    expect(letter?.reference_answer_method).toBe('');
  });

  it('provides both sign and letter practice questions', () => {
    expect(new Set(officialDocQuestions.map((item) => item.document_type))).toEqual(new Set(['簽', '函']));
  });

  it('stores the GPT 5.5 letter reference answer and metadata', () => {
    const letters = officialDocQuestions.filter((item) => item.document_type === '函');
    expect(letters).toHaveLength(2);
    for (const letter of letters) {
      expect(letter.ai_reference_model).toBe('GPT 5.5');
      expect(letter.reference_speed).toBe('普通');
      expect(letter.reference_security).toBe('');
      expect(letter.reference_attachments).toBe('無');
      expect(letter.reference_answer_description).toContain('五、');
    }
  });

  it('separates letter background material from the writing instruction', () => {
    const letters = officialDocQuestions.filter((item) => item.document_type === '函');
    for (const letter of letters) {
      expect(letter.scenario).not.toContain('請參考以上');
      expect(letter.supplemental_instruction).toContain('請參考以上');
    }
  });

  it('separates the sign writing instruction from its background material', () => {
    const sign = officialDocQuestions.find((item) => item.document_type === '簽');
    expect(sign?.intro_instruction).toBe('請試擬簽稿，陳核辦理以下公務事宜。');
    expect(sign?.scenario).not.toContain('請試擬簽稿');
  });

  it('does not treat 1. numbering as a halfwidth punctuation error', () => {
    expect(findHalfwidthPunctuation('1. 請各分行辦理教育訓練。')).toEqual([]);
  });

  it('does not treat email dots as punctuation errors', () => {
    expect(findHalfwidthPunctuation('請洽 service@example.com.tw。')).toEqual([]);
  });

  it('keeps numbering and email intact when converting punctuation', () => {
    expect(convertHalfwidthPunctuation('1. 請洽 service@example.com.tw, 並確認資格!')).toBe(
      '1. 請洽 service@example.com.tw， 並確認資格！',
    );
  });

  it('keeps sign reference answers in subject, description, and method', () => {
    expect(question.reference_answer_subject).toContain('核示');
    expect(question.ai_reference_model).toBe('GPT 5.5');
    expect(question.reference_answer_description).toContain('一、');
    expect(question.reference_answer_description).toContain('四、');
    expect(question.reference_answer_method).toContain('三、奉核後續辦');
  });
});
