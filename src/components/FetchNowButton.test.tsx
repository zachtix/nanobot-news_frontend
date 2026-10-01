import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { idleStatus, makeRun, mockShellApi, renderPage } from '../test/utils';

describe('Fetch now (header button)', () => {
  it('starts a run, shows progress, then reports the result', async () => {
    const { fetchStatus } = mockShellApi();
    const running = makeRun({ id: 5, status: 'running', finishedAt: null });
    const finished = makeRun({ id: 5, created: 4, merged: 3, skipped: 2 });
    const runFetch = vi.spyOn(api, 'runFetch').mockResolvedValue(running);
    renderPage(<div>page</div>);

    const button = await screen.findByRole('button', { name: 'ดึงข่าวตอนนี้' });
    fetchStatus.mockResolvedValue({ running: true, run: running, lastRun: running });
    await userEvent.click(button);

    expect(runFetch).toHaveBeenCalledWith(undefined);
    expect(await screen.findByRole('button', { name: 'กำลังดึงข่าว…' })).toBeDisabled();

    fetchStatus.mockResolvedValue({ running: false, run: null, lastRun: finished });
    expect(await screen.findByText(/ดึงข่าวเสร็จ \(#5\): ข่าวใหม่ 4 · รวมกับข่าวเดิม 3 · ข้าม 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ดึงข่าวตอนนี้' })).toBeEnabled();
  });

  it('explains when a run is already in progress', async () => {
    mockShellApi(idleStatus);
    vi.spyOn(api, 'runFetch').mockRejectedValue(new ApiError(409, 'A fetch run is already in progress'));
    renderPage(<div>page</div>);

    await userEvent.click(await screen.findByRole('button', { name: 'ดึงข่าวตอนนี้' }));
    expect(await screen.findByText('มีการดึงข่าวกำลังทำงานอยู่ กรุณารอให้เสร็จก่อน')).toBeInTheDocument();
  });

  it('shows the AI model badge from /health', async () => {
    mockShellApi();
    renderPage(<div>page</div>);
    await waitFor(() => expect(screen.getByText('AI: google/gemini-3.8-flash')).toBeInTheDocument());
  });
});
