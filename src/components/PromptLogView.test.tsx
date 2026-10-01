import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { AiCallLog, AiUsageCall } from '../api/types';
import { renderWithI18n } from '../test/utils';
import { PromptLogView } from './PromptLogView';

const usage: AiUsageCall = {
  id: 7,
  createdAt: '2026-10-01T04:34:00Z',
  purpose: 'tag',
  model: 'google/gemini-3.8-flash',
  generationId: 'gen-1790829809-abc',
  success: true,
  error: null,
  promptTokens: 1266,
  completionTokens: 608,
  totalTokens: 1874,
  cachedTokens: 0,
  reasoningTokens: 456,
  cost: 0.0032295,
  durationMs: 5100,
  fetchRunId: 12,
  context: 'news#116,115',
  hasLog: true,
};

const fullLog: AiCallLog = {
  id: 1,
  usageId: 7,
  purpose: 'tag',
  model: 'google/gemini-3.8-flash',
  messages: [],
  response: '{"items":[]}',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  request: {
    model: 'google/gemini-3.8-flash',
    messages: [
      { role: 'system', content: 'You tag crypto / finance news stories…' },
      { role: 'user', content: '{"items":[{"id":116,"title":"Bitcoin ETF"}]}' },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  },
  responseBody: {
    id: 'gen-1790829809-abc',
    model: 'google/gemini-3.8-flash',
    provider: 'Google',
    choices: [
      {
        finish_reason: 'stop',
        native_finish_reason: 'STOP',
        message: {
          role: 'assistant',
          content: '{"items":[{"id":116,"assets":[{"symbol":"BTC"}]}]}',
          reasoning: '**Identifying assets** The first story is about Bitcoin ETFs…',
        },
      },
    ],
    usage: { cost_details: { upstream_inference_prompt_cost: 0.00095, upstream_inference_completions_cost: 0.00228 } },
  },
  attempts: [
    { status: 429, durationMs: 120, error: '{"error":{"message":"rate limited"}}' },
    { status: 200, durationMs: 4980 },
  ],
  usage,
  relatedNews: [
    { id: 116, title: 'Bitcoin ETF ฟอร์มดุ' },
    { id: 115, title: null },
  ],
  createdAt: '2026-10-01T04:34:00Z',
};

const open = async (log: AiCallLog) => {
  vi.spyOn(api, 'aiCallLog').mockResolvedValue(log);
  renderWithI18n(<PromptLogView usageId={7} />, 'th');
  return screen.findByRole('region', { name: 'Prompt และคำตอบ' });
};

describe('PromptLogView (detailed)', () => {
  it('overview: models, provider, every HTTP attempt, tokens incl. reasoning share, cost split and the stories sent', async () => {
    const view = await open(fullLog);
    expect(within(view).getByRole('tab', { name: 'ภาพรวม' })).toHaveAttribute('aria-selected', 'true');

    const fact = (label: string) => within(view).getByText(label).nextSibling as HTMLElement;
    expect(fact('ประเภทงาน')).toHaveTextContent('ติดแท็กสินทรัพย์');
    expect(fact('โมเดลที่ขอ')).toHaveTextContent('google/gemini-3.8-flash');
    expect(fact('ผู้ให้บริการ (provider)')).toHaveTextContent('Google');
    expect(fact('การเรียก HTTP (status)')).toHaveTextContent('429 (120 ms) → 200 (4980 ms)');
    expect(fact('เหตุผลที่หยุดตอบ')).toHaveTextContent('stop (STOP)');
    expect(fact('Input token')).toHaveTextContent('1,266');
    expect(fact('ในนั้นเป็น reasoning')).toHaveTextContent('456 token (75% ของ output)');
    expect(fact('เครดิตที่ใช้')).toHaveTextContent('$0.00323');
    expect(fact('ค่า output')).toHaveTextContent('$0.00228');
    expect(fact('รอบดึงข่าว')).toHaveTextContent('#12');

    expect(within(view).getByText('ข่าวที่ส่งไปในการเรียกนี้ (2)')).toBeInTheDocument();
    expect(within(view).getByText(/Bitcoin ETF ฟอร์มดุ/)).toBeInTheDocument();
    expect(within(view).getByText(/ข่าวถูกลบแล้ว/)).toBeInTheDocument();
  });

  it('sent tab: parameters and each message with its size, JSON pretty-printed', async () => {
    const view = await open(fullLog);
    await userEvent.click(within(view).getByRole('tab', { name: 'ส่งไป (Request)' }));

    expect(within(view).getByText('temperature').nextSibling).toHaveTextContent('0');
    expect(within(view).getByText('response_format').nextSibling).toHaveTextContent('{"type":"json_object"}');
    expect(within(view).getByText('ข้อความที่ส่ง (2)')).toBeInTheDocument();
    expect(within(view).getByText('1. System prompt')).toBeInTheDocument();
    expect(within(view).getByText('You tag crypto / finance news stories…')).toBeInTheDocument();
    expect(within(view).getByText('2. User prompt (ข้อมูลที่ส่ง)')).toBeInTheDocument();
    expect(within(view).getByText(/"title": "Bitcoin ETF"/)).toBeInTheDocument();
  });

  it('received tab: the answer used, the model reasoning, and errors from retried attempts', async () => {
    const view = await open(fullLog);
    await userEvent.click(within(view).getByRole('tab', { name: 'ได้รับกลับ (Response)' }));

    expect(within(view).getByText('คำตอบของ AI (ที่ระบบนำไปใช้)')).toBeInTheDocument();
    expect(within(view).getByText(/"symbol": "BTC"/)).toBeInTheDocument();
    expect(within(view).getByText('AI คิดอะไรก่อนตอบ (reasoning)')).toBeInTheDocument();
    expect(within(view).getByText(/Identifying assets/)).toBeInTheDocument();
    expect(within(view).getByText('ข้อผิดพลาดจากการเรียก (status 429)')).toBeInTheDocument();
    expect(within(view).getByText(/"message": "rate limited"/)).toBeInTheDocument();
  });

  it('raw tab: full request and response bodies', async () => {
    const view = await open(fullLog);
    await userEvent.click(within(view).getByRole('tab', { name: 'JSON ดิบ' }));
    expect(within(view).getByText('Request body ทั้งหมด')).toBeInTheDocument();
    expect(within(view).getByText(/"response_format": \{/)).toBeInTheDocument();
    expect(within(view).getByText(/"native_finish_reason": "STOP"/)).toBeInTheDocument();
  });

  it('falls back gracefully for logs recorded before full capture', async () => {
    const view = await open({
      id: 2,
      usageId: 7,
      purpose: 'dedup',
      model: 'google/gemini-3.8-flash',
      messages: [
        { role: 'system', content: 'You are a news de-duplication engine.' },
        { role: 'user', content: 'NEW article…' },
      ],
      response: '{"duplicateOf":null}',
      createdAt: '2026-10-01T04:00:00Z',
    });
    await userEvent.click(within(view).getByRole('tab', { name: 'ส่งไป (Request)' }));
    expect(within(view).getByText('You are a news de-duplication engine.')).toBeInTheDocument();
    await userEvent.click(within(view).getByRole('tab', { name: 'ได้รับกลับ (Response)' }));
    expect(within(view).getByText(/"duplicateOf": null/)).toBeInTheDocument();
    await userEvent.click(within(view).getByRole('tab', { name: 'JSON ดิบ' }));
    expect(within(view).getByText(/บันทึกก่อนเริ่มเก็บข้อมูลดิบ/)).toBeInTheDocument();
  });
});
