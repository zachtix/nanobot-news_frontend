import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { AiSettings, SchedulerStatus } from '../api/types';
import { mockShellApi, renderPage } from '../test/utils';
import { SettingsPage } from './SettingsPage';

const DEFAULT_DEDUP = 'You are a news de-duplication engine. Reply with JSON only.';

const baseSettings = (): AiSettings => ({
  provider: { value: 'openrouter', source: 'env', envDefault: 'openrouter' },
  anthropic: {
    apiKey: { configured: false, masked: null, source: 'none' },
    model: { value: 'claude-haiku-4-5', source: 'env', envDefault: 'claude-haiku-4-5' },
  },
  apiKey: { configured: true, masked: 'sk-or-v1-f…af96', source: 'env' },
  managementKey: { configured: false, masked: null, source: 'none' },
  model: { value: 'google/gemini-3.8-flash', source: 'env', envDefault: 'google/gemini-3.8-flash' },
  prompts: {
    dedup: { value: DEFAULT_DEDUP, isDefault: true, defaultValue: DEFAULT_DEDUP },
    translate: { value: 'Translate. JSON.', isDefault: true, defaultValue: 'Translate. JSON.' },
    tag: { value: 'Tag. JSON.', isDefault: true, defaultValue: 'Tag. JSON.' },
    analyze: { value: 'My custom analysis prompt. JSON.', isDefault: false, defaultValue: 'Default analysis. JSON.' },
    market: { value: 'Market brief. JSON.', isDefault: true, defaultValue: 'Market brief. JSON.' },
    chart: { value: 'Chart. JSON.', isDefault: true, defaultValue: 'Chart. JSON.' },
  },
  display: { showModel: true },
  learning: { tracking: true, feedback: true },
  chart: { enabled: false },
});

/** The model field is a searchable combobox: pick a listed model, or an unlisted id offered as a custom value. */
async function pickModel(user: UserEvent, trigger: HTMLElement, model: string) {
  await user.click(trigger);
  await user.type(await screen.findByPlaceholderText('ค้นหาโมเดล…'), model);
  const listed = screen.queryAllByRole('option').find((o) => o.textContent?.startsWith(model));
  await user.click(listed ?? (await screen.findByRole('option', { name: `ใช้ "${model}"` })));
}

const scheduler: SchedulerStatus = {
  enabled: true,
  cron: '*/30 * * * *',
  timezone: 'Asia/Bangkok',
  nextRunAt: '2026-10-01T05:30:00.000Z',
  running: false,
  autoTranslate: false,
  autoAnalyze: false,
};

describe('SettingsPage', () => {
  let update: MockInstance<typeof api.updateAiSettings>;
  let shell: ReturnType<typeof mockShellApi>;

  beforeEach(() => {
    shell = mockShellApi();
    vi.spyOn(api, 'getScheduler').mockResolvedValue(scheduler);
    vi.spyOn(api, 'getAiSettings').mockResolvedValue(baseSettings());
    vi.spyOn(api, 'listModels').mockResolvedValue([
      { id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash', contextLength: 1048576, promptPrice: 0.75, completionPrice: 3.75, supportsJson: true },
      { id: 'acme/no-json', name: 'Acme No JSON', contextLength: 8000, promptPrice: 1, completionPrice: 2, supportsJson: false },
    ]);
    vi.spyOn(api, 'promptExamples').mockResolvedValue({
      dedup: { sample: 'NEW article (source: Cointelegraph)\ntitle: SEC greenlights\n\nCANDIDATES:\n- id: 412', latest: null },
      translate: { sample: '{"items":[]}', latest: null },
      tag: { sample: '{"items":[]}', latest: null },
      market: { sample: '{"period":"last 24 hours","stories":[]}', latest: null },
      chart: { sample: 'COIN: BTC (spot, priced in USDT).', latest: null },
      analyze: {
        sample: '{"title":"Sample story","reports":[]}',
        latest: {
          usageId: 77,
          model: 'google/gemini-3.8-flash',
          createdAt: '2026-10-01T05:00:00.000Z',
          content: '{"title":"Real story","reports":[{"source":"CoinDesk"}]}',
        },
      },
    });
    update = vi.spyOn(api, 'updateAiSettings').mockImplementation(async (patch) => {
      const s = baseSettings();
      if (patch.apiKey) s.apiKey = { configured: true, masked: 'sk-or-v1-n…w123', source: 'settings' };
      if (patch.model) s.model = { ...s.model, value: patch.model, source: 'settings' };
      if (patch.showModel !== undefined) s.display = { showModel: patch.showModel };
      if (patch.learning) s.learning = { ...s.learning, ...patch.learning };
      if (patch.chart) s.chart = { enabled: patch.chart.enabled ?? false };
      if (patch.provider) s.provider = { ...s.provider, value: patch.provider, source: 'settings' };
      if (patch.anthropic?.apiKey) s.anthropic.apiKey = { configured: true, masked: 'sk-ant-api…k123', source: 'settings' };
      if (patch.anthropic?.model) s.anthropic.model = { ...s.anthropic.model, value: patch.anthropic.model, source: 'settings' };
      return { settings: s, warnings: [] };
    });
  });

  it('shows the masked key with its source, never the full key', async () => {
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'OpenRouter API key' });
    expect(within(card).getByText('sk-or-v1-f…af96')).toBeInTheDocument();
    expect(within(card).getByText('จาก .env')).toBeInTheDocument();
    expect(within(card).getAllByText('ยังไม่ตั้ง')).toHaveLength(1); // management key: badge only, not repeated
  });

  it('saves a new API key, clears the input and refreshes the header status', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'OpenRouter API key' });
    const healthCallsBefore = shell.health.mock.calls.length;

    const input = within(card).getByLabelText('API key ใหม่');
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, 'sk-or-v1-new-key-123');
    await user.click(within(card).getAllByRole('button', { name: 'บันทึก' })[0]);

    expect(update).toHaveBeenCalledWith({ apiKey: 'sk-or-v1-new-key-123' });
    expect(await within(card).findByText('sk-or-v1-n…w123')).toBeInTheDocument();
    expect(within(card).getByText('ตั้งในหน้านี้')).toBeInTheDocument();
    expect(input).toHaveValue('');
    await waitFor(() => expect(shell.health.mock.calls.length).toBeGreaterThan(healthCallsBefore));
  });

  it('tests a candidate key without saving it', async () => {
    const test = vi.spyOn(api, 'testAiConnection').mockResolvedValue({
      ok: true,
      key: { ok: true, label: 'sk-or-v1-abc', limitRemaining: 4.5 },
      model: { ok: true, id: 'google/gemini-3.8-flash', latencyMs: 812, cost: 0.00001 },
    });
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'OpenRouter API key' });

    await user.click(within(card).getByRole('button', { name: 'ทดสอบการเชื่อมต่อ' }));
    expect(test).toHaveBeenLastCalledWith({ provider: 'openrouter' });
    await user.type(within(card).getByLabelText('API key ใหม่'), 'sk-candidate');
    await user.click(within(card).getByRole('button', { name: 'ทดสอบ key นี้' }));
    expect(test).toHaveBeenLastCalledWith({ provider: 'openrouter', apiKey: 'sk-candidate' });

    expect(await within(card).findByText(/Key ใช้ได้ \(sk-or-v1-abc\) · เหลือวงเงิน \$4\.50/)).toBeInTheDocument();
    expect(within(card).getByText(/ตอบกลับใน 812 ms/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows test failures', async () => {
    vi.spyOn(api, 'testAiConnection').mockResolvedValue({
      ok: false,
      key: { ok: false, error: 'key: OpenRouter 401' },
      model: { ok: false, id: 'google/gemini-3.8-flash', error: 'OpenRouter 401: invalid key' },
    });
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'OpenRouter API key' });
    await userEvent.click(within(card).getByRole('button', { name: 'ทดสอบการเชื่อมต่อ' }));
    expect(await within(card).findByText(/Key ใช้ไม่ได้: key: OpenRouter 401/)).toBeInTheDocument();
    expect(within(card).getByText(/ใช้ไม่ได้: OpenRouter 401: invalid key/)).toBeInTheDocument();
  });

  it('picks a model, shows its price and JSON support, saves, and surfaces server warnings', async () => {
    update.mockResolvedValueOnce({
      settings: { ...baseSettings(), model: { value: 'acme/no-json', source: 'settings', envDefault: 'google/gemini-3.8-flash' } },
      warnings: [{ code: 'modelNoJson', model: 'acme/no-json' }],
    });
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'โมเดล' });

    expect(await within(card).findByText(/input \$0\.75 · output \$3\.75 ต่อ 1 ล้าน token/)).toBeInTheDocument();
    expect(within(card).getByText('รองรับ JSON mode')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'บันทึก' })).toBeDisabled();

    await pickModel(user, within(card).getByLabelText('Model ID'), 'acme/no-json');
    expect(within(card).getByText('ไม่รองรับ JSON mode')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));

    expect(update).toHaveBeenCalledWith({ model: 'acme/no-json' });
    expect(await screen.findByText('โมเดล "acme/no-json" ไม่ได้ระบุว่ารองรับ JSON mode — คำตอบอาจอ่านไม่ได้')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'กลับไปใช้ค่าจาก .env' })).toBeInTheDocument();
  });

  it('edits a system prompt per tab, saves it trimmed, and can discard edits', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'System prompt' });

    expect(within(card).getByRole('tab', { name: 'ตรวจข่าวซ้ำ' })).toHaveAttribute('aria-selected', 'true');
    const editor = within(card).getByRole('textbox', { name: 'ตรวจข่าวซ้ำ' });
    expect(editor).toHaveValue(DEFAULT_DEDUP);
    expect(within(card).getByText('ค่าเริ่มต้น')).toBeInTheDocument();

    await user.type(editor, ' Be strict.  ');
    await user.click(within(card).getByRole('button', { name: 'ยกเลิกการแก้ไข' }));
    expect(editor).toHaveValue(DEFAULT_DEDUP);

    await user.type(editor, ' Be strict.  ');
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));
    expect(update).toHaveBeenCalledWith({ prompts: { dedup: `${DEFAULT_DEDUP} Be strict.` } });
  });

  it('shows customised prompts, their default, and resets after confirmation', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'System prompt' });

    await user.click(within(card).getByRole('tab', { name: 'วิเคราะห์ข่าว' }));
    expect(within(card).getByRole('textbox', { name: 'วิเคราะห์ข่าว' })).toHaveValue('My custom analysis prompt. JSON.');
    expect(within(card).getByText('แก้ไขแล้ว')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'ดูค่าเริ่มต้น' }));
    expect(within(card).getByText('Default analysis. JSON.')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'คืนค่าเริ่มต้น' }));
    expect(update).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'คืนค่าเริ่มต้น' }));
    expect(update).toHaveBeenCalledWith({ prompts: { analyze: null } });
    await waitFor(() =>
      expect(within(card).getByRole('textbox', { name: 'วิเคราะห์ข่าว' })).toHaveValue('Default analysis. JSON.'),
    );
  });

  it('keeps unsaved prompt edits when another section is saved', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const prompts = await screen.findByRole('region', { name: 'System prompt' });
    await user.type(within(prompts).getByRole('textbox', { name: 'ตรวจข่าวซ้ำ' }), ' draft');

    const keys = screen.getByRole('region', { name: 'OpenRouter API key' });
    await user.type(within(keys).getByLabelText('API key ใหม่'), 'sk-x-123456');
    await user.click(within(keys).getAllByRole('button', { name: 'บันทึก' })[0]);
    await within(keys).findByText('บันทึกแล้ว');

    expect(within(prompts).getByRole('textbox', { name: 'ตรวจข่าวซ้ำ' })).toHaveValue(`${DEFAULT_DEDUP} draft`);
  });

  it('shows the user message sent with each prompt: latest real one, or a sample', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'System prompt' });

    // dedup: never logged yet → sample (plain text, shown as is)
    let example = await within(card).findByRole('region', { name: 'ข้อมูลที่ส่งไปพร้อม prompt นี้ (role: user)' });
    expect(within(example).getByRole('radio', { name: 'ล่าสุดจริง' })).toBeDisabled();
    expect(within(example).getByRole('radio', { name: 'ตัวอย่าง' })).toHaveAttribute('aria-checked', 'true');
    expect(within(example).getByText(/ยังไม่มีการเรียกงานนี้ใน log/)).toBeInTheDocument();
    expect(within(example).getByText(/^NEW article \(source: Cointelegraph\)/)).toBeInTheDocument();
    expect(within(example).queryByText(/ของจริงส่งเป็น JSON บรรทัดเดียว/)).not.toBeInTheDocument();

    // analyze: latest real call by default, pretty-printed JSON
    await user.click(within(card).getByRole('tab', { name: 'วิเคราะห์ข่าว' }));
    example = within(card).getByRole('region', { name: 'ข้อมูลที่ส่งไปพร้อม prompt นี้ (role: user)' });
    expect(within(example).getByRole('radio', { name: 'ล่าสุดจริง' })).toHaveAttribute('aria-checked', 'true');
    expect(within(example).getByText(/ส่งจริงเมื่อ .* · google\/gemini-3.8-flash/)).toBeInTheDocument();
    const pre = example.querySelector('pre')!;
    expect(pre.textContent).toBe(JSON.stringify({ title: 'Real story', reports: [{ source: 'CoinDesk' }] }, null, 2));
    expect(within(example).getByText(/ของจริงส่งเป็น JSON บรรทัดเดียว/)).toBeInTheDocument();

    await user.click(within(example).getByRole('radio', { name: 'ตัวอย่าง' }));
    expect(example.querySelector('pre')!.textContent).toContain('"Sample story"');
  });

  it('switches the AI provider in one click and warns when it has no key', async () => {
    update.mockImplementationOnce(async (patch) => ({
      settings: { ...baseSettings(), provider: { value: patch.provider!, source: 'settings', envDefault: 'openrouter' } },
      warnings: [{ code: 'providerNoKey', provider: 'anthropic' }],
    }));
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'ผู้ให้บริการ AI' });
    const openrouter = within(card).getByRole('radio', { name: 'OpenRouter' });
    const anthropic = within(card).getByRole('radio', { name: 'Anthropic' });
    expect(openrouter).toHaveAttribute('aria-checked', 'true');
    expect(within(openrouter).getByText('ใช้อยู่')).toBeInTheDocument();
    expect(within(openrouter).getByText('มี key แล้ว')).toBeInTheDocument();
    expect(within(anthropic).getByText('ยังไม่มี key')).toBeInTheDocument();
    expect(within(anthropic).getByText('claude-haiku-4-5')).toBeInTheDocument();
    const healthCallsBefore = shell.health.mock.calls.length;

    await user.click(anthropic);

    expect(update).toHaveBeenCalledWith({ provider: 'anthropic' });
    await waitFor(() => expect(within(card).getByRole('radio', { name: 'Anthropic' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText('ยังไม่มี API key ของ Anthropic — การเรียก AI จะล้มเหลวจนกว่าจะใส่ key')).toBeInTheDocument();
    await waitFor(() => expect(shell.health.mock.calls.length).toBeGreaterThan(healthCallsBefore));
    // the keys of the provider in use come first
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions.indexOf('Anthropic API key')).toBeLessThan(regions.indexOf('OpenRouter API key'));
  });

  it('saves and tests the Anthropic key separately from OpenRouter', async () => {
    const test = vi.spyOn(api, 'testAiConnection').mockResolvedValue({
      ok: true,
      provider: 'anthropic',
      key: { ok: true, label: null, limitRemaining: null },
      model: { ok: true, id: 'claude-haiku-4-5', latencyMs: 640, cost: 0.00002 },
    });
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'Anthropic API key' });
    const input = within(card).getByLabelText('API key ใหม่');
    expect(input).toHaveAttribute('placeholder', 'sk-ant-api03-…');

    await user.type(input, 'sk-ant-api03-candidate');
    await user.click(within(card).getByRole('button', { name: 'ทดสอบ key นี้' }));
    expect(test).toHaveBeenLastCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-api03-candidate' });
    expect(await within(card).findByText('Key ใช้ได้ (Anthropic ไม่มี API ให้ดูเครดิตคงเหลือ)')).toBeInTheDocument();

    await user.click(within(card).getAllByRole('button', { name: 'บันทึก' })[0]);
    expect(update).toHaveBeenCalledWith({ anthropic: { apiKey: 'sk-ant-api03-candidate' } });
    expect(await within(card).findByText('sk-ant-api…k123')).toBeInTheDocument();
  });

  it('edits each provider’s model from its own tab', async () => {
    const list = vi.mocked(api.listModels);
    list.mockImplementation(async (provider) =>
      provider === 'anthropic'
        ? [
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextLength: 200000, promptPrice: 1, completionPrice: 5, supportsJson: true },
            { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', contextLength: null, promptPrice: 2, completionPrice: 10, supportsJson: true },
          ]
        : [],
    );
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'โมเดล' });
    expect(within(card).getByRole('radio', { name: 'OpenRouter' })).toHaveAttribute('aria-checked', 'true');
    expect(list).toHaveBeenCalledWith('openrouter');

    await user.click(within(card).getByRole('radio', { name: 'Anthropic' }));
    expect(list).toHaveBeenLastCalledWith('anthropic');
    // the alias resolves to its dated release for price info
    expect(await within(card).findByText(/input \$1\.00 · output \$5\.00/)).toBeInTheDocument();
    expect(within(card).getByText('ตอบเป็น JSON ตาม prompt')).toBeInTheDocument();

    await pickModel(user, within(card).getByLabelText('Model ID'), 'claude-sonnet-5-5');
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));
    expect(update).toHaveBeenCalledWith({ anthropic: { model: 'claude-sonnet-5-5' } });
  });

  it('switches learning from outcomes off without touching the other switch', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'เรียนรู้จากผลจริง' });
    const feedback = within(card).getByRole('switch', { name: 'ใช้สถิติย้อนหลังช่วยวิเคราะห์' });
    expect(feedback).toHaveAttribute('aria-checked', 'true');
    expect(within(card).getByRole('link', { name: 'ดูความแม่นของ AI' })).toHaveAttribute('href', '/accuracy');

    await user.click(feedback);

    expect(update).toHaveBeenCalledWith({ learning: { feedback: false } });
    await waitFor(() => expect(within(card).getByRole('switch', { name: 'ใช้สถิติย้อนหลังช่วยวิเคราะห์' })).toHaveAttribute('aria-checked', 'false'));
    expect(within(card).getByRole('switch', { name: 'เก็บผลราคาหลังข่าว' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows save errors', async () => {
    update.mockRejectedValue(new ApiError(400, 'Validation failed', [{ path: 'model', message: 'Model id may only contain letters' }]));
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'โมเดล' });
    await pickModel(user, within(card).getByLabelText('Model ID'), 'bad id');
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Validation failed (model: Model id may only contain letters)');
  });

  it('shows the current fetch schedule', async () => {
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'ตั้งเวลาดึงข่าว' });
    expect(within(card).getByLabelText('Cron expression')).toHaveValue('*/30 * * * *');
    const presets = within(card).getByRole('radiogroup', { name: 'ความถี่' });
    expect(within(presets).getByRole('radio', { name: 'ทุก 30 นาที' })).toHaveAttribute('aria-checked', 'true');
    expect(within(card).getByText(/ปัจจุบัน: ทุก 30 นาที · รอบถัดไป/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'บันทึก' })).toBeDisabled(); // nothing changed yet
  });

  it('saves a fetch schedule preset and the enabled flag', async () => {
    const update = vi
      .spyOn(api, 'updateScheduler')
      .mockResolvedValue({ ...scheduler, cron: '0 */3 * * *', enabled: false, nextRunAt: null });
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'ตั้งเวลาดึงข่าว' });

    await user.click(within(card).getByRole('radio', { name: 'ทุก 3 ชั่วโมง' }));
    await user.click(within(card).getByRole('switch', { name: 'เปิดการดึงอัตโนมัติ' }));
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));

    expect(update).toHaveBeenCalledWith({ enabled: false, cron: '0 */3 * * *', autoTranslate: false, autoAnalyze: false });
    expect(await within(card).findByText('บันทึกการตั้งค่าการดึงข่าวแล้ว')).toBeInTheDocument();
    expect(within(card).getByText('ปัจจุบัน: ปิดการดึงอัตโนมัติ')).toBeInTheDocument();
  });

  it('turns on translating and analysing right after each fetch (both off by default)', async () => {
    const update = vi.spyOn(api, 'updateScheduler').mockResolvedValue({ ...scheduler, autoTranslate: true, autoAnalyze: true });
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'ตั้งเวลาดึงข่าว' });
    const after = within(card).getByRole('group', { name: 'หลังดึงข่าวเสร็จ' });
    const translate = within(after).getByRole('switch', { name: 'แปลทันที' });
    const analyse = within(after).getByRole('switch', { name: 'วิเคราะห์ทันที' });
    expect(translate).toHaveAttribute('aria-checked', 'false');
    expect(analyse).toHaveAttribute('aria-checked', 'false');

    await user.click(translate);
    await user.click(analyse);
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));

    expect(update).toHaveBeenCalledWith({ enabled: true, cron: '*/30 * * * *', autoTranslate: true, autoAnalyze: true });
    expect(await within(card).findByText('บันทึกการตั้งค่าการดึงข่าวแล้ว')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'บันทึก' })).toBeDisabled();
  });

  it('switches chart data for the AI on (off by default)', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'ข้อมูลกราฟ' });
    const toggle = within(card).getByRole('switch', { name: 'ส่งข้อมูลกราฟให้ AI' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(update).toHaveBeenCalledWith({ chart: { enabled: true } });
    await waitFor(() => expect(within(card).getByRole('switch', { name: 'ส่งข้อมูลกราฟให้ AI' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('shows validation errors for a bad cron', async () => {
    vi.spyOn(api, 'updateScheduler').mockRejectedValue(new ApiError(400, 'Invalid cron expression: "nope"'));
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'ตั้งเวลาดึงข่าว' });

    const input = within(card).getByLabelText('Cron expression');
    await user.clear(input);
    await user.type(input, 'nope');
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Invalid cron expression');
  });
});
