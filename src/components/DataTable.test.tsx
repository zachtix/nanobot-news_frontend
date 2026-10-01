import type { ColumnDef } from '@tanstack/react-table';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { chooseOption, renderWithI18n } from '../test/utils';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from './DataTable';
import { Button } from './ui/button';

type Coin = { symbol: string; name: string; price: number };
const coins: Coin[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 65000 },
  { symbol: 'ETH', name: 'Ethereum', price: 3200 },
];

// The setup's ResizeObserver stub reports a 1024px wide container.
const columns = (sizes: { name: number; price: number } = { name: 200, price: 120 }): ColumnDef<Coin, unknown>[] => [
  { id: 'symbol', header: 'Symbol', size: 100, minSize: 80, cell: ({ row }) => row.original.symbol },
  { id: 'name', header: 'Name', size: sizes.name, minSize: 150, meta: { grow: true }, cell: ({ row }) => row.original.name },
  { id: 'price', header: 'Price', size: sizes.price, minSize: 90, meta: { align: 'right' }, cell: ({ row }) => row.original.price },
];

const colWidths = () => [...document.querySelectorAll('col')].map((c) => parseFloat((c as HTMLElement).style.width));
const tableWidth = () => parseFloat(screen.getByRole('table', { name: 'Coins' }).style.width);
const handle = (column: string) => screen.getByRole('separator', { name: `ปรับความกว้างคอลัมน์ ${column}` });

describe('DataTable', () => {
  it('lets the grow column fill a wide container', () => {
    renderWithI18n(<DataTable id="t1" label="Coins" columns={columns()} data={coins} />);
    expect(tableWidth()).toBe(1024);
    expect(colWidths()).toEqual([100, 1024 - 100 - 120, 120]);
  });

  it('keeps every column at least its min width and scrolls sideways instead of squeezing', () => {
    renderWithI18n(<DataTable id="t2" label="Coins" columns={columns({ name: 900, price: 400 })} data={coins} />);
    expect(tableWidth()).toBe(1400); // wider than the 1024px container
    expect(screen.getByRole('table', { name: 'Coins' }).parentElement).toHaveClass('overflow-x-auto');
  });

  it('resizes with the keyboard but never below the min width, and remembers the widths', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithI18n(<DataTable id="t3" label="Coins" columns={columns()} data={coins} />);

    const price = handle('Price');
    expect(price).toHaveAttribute('aria-valuenow', '120');
    expect(price).toHaveAttribute('aria-valuemin', '90');
    price.focus();
    await user.keyboard('{ArrowRight}');
    expect(price).toHaveAttribute('aria-valuenow', '136');
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(price).toHaveAttribute('aria-valuenow', '90'); // clamped at minSize
    expect(JSON.parse(localStorage.getItem('table-columns:t3')!)).toEqual({ price: 90 });

    unmount();
    renderWithI18n(<DataTable id="t3" label="Coins" columns={columns()} data={coins} />);
    expect(handle('Price')).toHaveAttribute('aria-valuenow', '90');
  });

  it('resizes by dragging, clamps at the min width, and resets on double-click', () => {
    renderWithI18n(<DataTable id="t4" label="Coins" columns={columns()} data={coins} />);
    const symbol = handle('Symbol');

    fireEvent.mouseDown(symbol, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 160 });
    fireEvent.mouseUp(document, { clientX: 160 });
    expect(symbol).toHaveAttribute('aria-valuenow', '160');

    fireEvent.mouseDown(symbol, { clientX: 160 });
    fireEvent.mouseMove(document, { clientX: -400 });
    fireEvent.mouseUp(document, { clientX: -400 });
    expect(symbol).toHaveAttribute('aria-valuenow', '80');
    expect(colWidths()[0]).toBe(80);

    fireEvent.doubleClick(symbol);
    expect(symbol).toHaveAttribute('aria-valuenow', '100');
  });

  it('pages rows client-side with a remembered page size, staying in range when rows go away', async () => {
    const user = userEvent.setup();
    const many: Coin[] = Array.from({ length: 25 }, (_, i) => ({ symbol: `C${i + 1}`, name: `Coin ${i + 1}`, price: i }));
    const view = (data: Coin[]) => <DataTable id="t7" label="Coins" columns={columns()} data={data} getRowId={(c) => c.symbol} paginate />; // default 10 per page
    const { rerender, unmount } = renderWithI18n(view(many));

    const bodyRows = () => screen.getAllByRole('row').slice(1);
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('1–10 จาก 25')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'หน้าสุดท้าย' }));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText('C21')).toBeInTheDocument();

    // Rows removed while on page 3 → clamp to the new last page instead of showing nothing.
    rerender(view(many.slice(0, 15)));
    expect(screen.getByText('หน้า 2 / 2')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(5);

    await chooseOption(user, screen.getByRole('combobox', { name: 'ต่อหน้า' }), '20');
    expect(bodyRows()).toHaveLength(15);
    expect(screen.getByText('1–15 จาก 15')).toBeInTheDocument();
    expect(localStorage.getItem('page-size:t7')).toBe('20');

    unmount();
    renderWithI18n(view(many));
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(20);
  });

  it('hides the pager when everything fits on the smallest page', () => {
    renderWithI18n(<DataTable id="t8" label="Coins" columns={columns()} data={coins} paginate />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('gives a wide table a sticky scrollbar kept in sync with the table', () => {
    renderWithI18n(<DataTable id="t9" label="Coins" columns={columns({ name: 900, price: 400 })} data={coins} />);
    const grid = screen.getByRole('table', { name: 'Coins' }).parentElement!;
    const bar = document.querySelector<HTMLElement>('[data-slot="data-table-scrollbar"]')!;
    expect(bar).toHaveClass('sticky', 'bottom-0');
    expect(bar).toHaveAttribute('aria-hidden');
    expect((bar.firstChild as HTMLElement).style.width).toBe('1400px');
    expect(grid).toHaveClass('scrollbar-none'); // the table's own bar (under the last row) is hidden

    bar.scrollLeft = 200;
    fireEvent.scroll(bar);
    expect(grid.scrollLeft).toBe(200);
    grid.scrollLeft = 50;
    fireEvent.scroll(grid);
    expect(bar.scrollLeft).toBe(50);
  });

  it('adds no extra scrollbar when the table fits', () => {
    renderWithI18n(<DataTable id="t10" label="Coins" columns={columns()} data={coins} />);
    expect(document.querySelector('[data-slot="data-table-scrollbar"]')).toBeNull();
    expect(screen.getByRole('table', { name: 'Coins' }).parentElement).not.toHaveClass('scrollbar-none');
  });

  it('pins expanded content to the visible width of a wide table', () => {
    renderWithI18n(
      <DataTable
        id="t11"
        label="Coins"
        columns={columns({ name: 900, price: 400 })}
        data={coins}
        getRowId={(c) => c.symbol}
        isExpanded={(c) => c.symbol === 'BTC'}
        renderExpanded={() => <p>Prompt log</p>}
      />,
    );
    const pinned = screen.getByText('Prompt log').parentElement!;
    expect(pinned).toHaveAttribute('data-slot', 'data-table-expanded');
    expect(pinned).toHaveClass('sticky', 'left-0');
    expect(pinned.style.width).toBe('1024px'); // the container, not the 1400px table
  });

  it('makes the whole row clickable, except its own controls and rows that have nothing to open', async () => {
    const user = userEvent.setup();
    const clicked: string[] = [];
    const cols: ColumnDef<Coin, unknown>[] = [
      ...columns(),
      { id: 'act', header: 'Act', cell: ({ row }) => <Button onClick={() => clicked.push(`button:${row.original.symbol}`)}>Open {row.original.symbol}</Button> },
    ];
    renderWithI18n(
      <DataTable
        id="t12"
        label="Coins"
        columns={cols}
        data={coins}
        getRowId={(c) => c.symbol}
        onRowClick={(c) => clicked.push(`row:${c.symbol}`)}
        canClickRow={(c) => c.symbol !== 'ETH'}
      />,
    );

    const btcRow = screen.getByText('Bitcoin').closest('tr')!;
    expect(btcRow).toHaveClass('cursor-pointer');
    await user.click(screen.getByText('Bitcoin')); // any cell
    await user.click(screen.getByText('65000'));
    expect(clicked).toEqual(['row:BTC', 'row:BTC']);

    await user.click(screen.getByRole('button', { name: 'Open BTC' })); // the button handles itself, no double toggle
    expect(clicked).toEqual(['row:BTC', 'row:BTC', 'button:BTC']);

    const ethRow = screen.getByText('Ethereum').closest('tr')!;
    expect(ethRow).not.toHaveClass('cursor-pointer');
    await user.click(screen.getByText('Ethereum'));
    expect(clicked).toHaveLength(3);
  });

  it('expands a row across every column', () => {
    renderWithI18n(
      <DataTable
        id="t5"
        label="Coins"
        columns={columns()}
        data={coins}
        getRowId={(c) => c.symbol}
        isExpanded={(c) => c.symbol === 'ETH'}
        renderExpanded={(c) => <p>{c.name} details</p>}
      />,
    );
    const detail = screen.getByText('Ethereum details').closest('td')!;
    expect(detail).toHaveAttribute('colspan', '3');
  });

  it('keeps cell state (an open dialog) when the page rebuilds its columns', async () => {
    const user = userEvent.setup();
    let bump = () => {};
    function Page() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      const cols = useMemo<ColumnDef<Coin, unknown>[]>(
        () => [
          { id: 'symbol', header: `Symbol ${n}`, cell: ({ row }) => row.original.symbol },
          {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
              <ConfirmDialog
                trigger={<Button>Delete {row.original.symbol}</Button>}
                title={`Delete ${row.original.symbol}?`}
                confirmLabel="Delete"
                onConfirm={() => undefined}
              />
            ),
          },
        ],
        [n],
      );
      return <DataTable id="t6" label="Coins" columns={cols} data={coins} />;
    }
    renderWithI18n(<Page />);

    await user.click(screen.getByRole('button', { name: 'Delete BTC' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    act(() => bump());
    // The table sits behind the modal (aria-hidden) but has re-rendered with the new column defs.
    expect(screen.getByText('Symbol 1')).toBeInTheDocument();
    expect(within(screen.getByRole('alertdialog')).getByText('Delete BTC?')).toBeInTheDocument();
  });
});
