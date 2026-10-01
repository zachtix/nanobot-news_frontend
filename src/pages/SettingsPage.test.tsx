import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { AiSettings } from '../api/types';
import { mockShellApi, renderPage } from '../test/utils';
import { SettingsPage } from './SettingsPage';

const DEFAULT_DEDUP = 'You are a news de-duplication engine. Reply with JSON only.';

const baseSettings = (): AiSettings => ({
  apiKey: { configured: true, masked: 'sk-or-v1-f…af96', source: 'env' },
  managementKey: { configured: false, masked: null, source: 'none' },
  model: { value: 'google/gemini-3.8-flash', source: 'env', envDefault: 'google/gemini-3.8-flash' },
  prompts: {
    dedup: { value: DEFAULT_DEDUP, isDefault: true, defaultValue: DEFAULT_DEDUP },
    translate: { value: 'Translate. JSON.', isDefault: true, defaultValue: 'Translate. JSON.' },
    tag: { value: 'Tag. JSON.', isDefault: true, defaultValue: 'Tag. JSON.' },
    analyze: { value: 'My custom analysis prompt. JSON.', isDefault: false, defaultValue: 'Default analysis. JSON.' },
    market: { value: 'Market brief. JSON.', isDefault: true, defaultValue: 'Market brief. JSON.' },
  },
  display: { showModel: true },
});

/** The model field is a searchable combobox: pick a listed model, or an unlisted id offered as a custom value. */
async function pickModel(user: UserEvent, trigger: HTMLElement, model: string) {
  await user.click(trigger);
  await user.type(await screen.findByPlaceholderText('ค้นหาโมเดล…'), model);
  const listed = screen.queryAllByRole('option').find((o) => o.textContent?.startsWith(model));
  await user.click(listed ?? (await screen.findByRole('option', { name: `ใช้ "${model}"` })));
}

describe('SettingsPage', () => {
  let update: MockInstance<typeof api.updateAiSettings>;
  let shell: ReturnType<typeof mockShellApi>;

  beforeEach(() => {
    shell = mockShellApi();
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
    expect(test).toHaveBeenLastCalledWith({});
    await user.type(within(card).getByLabelText('API key ใหม่'), 'sk-candidate');
    await user.click(within(card).getByRole('button', { name: 'ทดสอบ key นี้' }));
    expect(test).toHaveBeenLastCalledWith({ apiKey: 'sk-candidate' });

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

  it('shows save errors', async () => {
    update.mockRejectedValue(new ApiError(400, 'Validation failed', [{ path: 'model', message: 'Model id may only contain letters' }]));
    const user = userEvent.setup();
    renderPage(<SettingsPage />, { path: '/settings' });
    const card = await screen.findByRole('region', { name: 'โมเดล' });
    await pickModel(user, within(card).getByLabelText('Model ID'), 'bad id');
    await user.click(within(card).getByRole('button', { name: 'บันทึก' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Validation failed (model: Model id may only contain letters)');
  });
});
