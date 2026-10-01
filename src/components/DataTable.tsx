import {
  type Cell,
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  type Row,
  type RowData,
  useReactTable,
} from '@tanstack/react-table';
import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DEFAULT_PAGE_SIZE, Pagination, usePageSize } from '@/components/Pagination';
import { useI18n } from '@/i18n/I18nContext';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Right/center alignment (numbers are right-aligned). */
    align?: 'left' | 'right' | 'center';
    /** This column absorbs spare width when the table is narrower than its container. */
    grow?: boolean;
    /** Let cell content wrap instead of truncating with an ellipsis. */
    wrap?: boolean;
    /** Accessible name for the header when it has no visible text. */
    label?: string;
  }
}

const STORAGE_PREFIX = 'table-columns:';
const KEY_STEP = 16;

function loadSizing(id: string): ColumnSizingState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + id) ?? '{}') as ColumnSizingState;
  } catch {
    return {};
  }
}

interface DataTableProps<T> {
  /** Stable id: column widths are remembered per table in localStorage. */
  id: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  label: string;
  getRowId?: (row: T) => string;
  /** Rows currently expanded, and what to render under them (spans every column). */
  isExpanded?: (row: T) => boolean;
  renderExpanded?: (row: T) => ReactNode;
  rowClassName?: (row: Row<T>) => string | undefined;
  /**
   * Makes the whole row clickable (e.g. expand / collapse). Clicks on controls inside the row
   * (buttons, links, inputs) and text selections are left alone, so keep a real button in the
   * row for keyboard users. Return false from `canClickRow` for rows that have nothing to open.
   */
  onRowClick?: (row: T) => void;
  canClickRow?: (row: T) => boolean;
  /** Shown instead of the body when there are no rows. */
  empty?: ReactNode;
  className?: string;
  /**
   * Client-side paging with a "per page" selector (size remembered per table). For
   * server-paged lists leave this off and render <Pagination> next to the table instead.
   */
  paginate?: boolean | { defaultPageSize?: number };
}

/** A row click that belongs to something else: a control inside the row, or the end of a text selection. */
function isOwnAction(e: MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement;
  if (target.closest('a, button, input, select, textarea, label, [role="switch"], [role="checkbox"], [role="combobox"]')) return true;
  return Boolean(window.getSelection?.()?.toString());
}

/** Keep two horizontally scrolling elements in step (equality check stops the echo). */
function mirrorScroll(from: HTMLElement | null, to: HTMLElement | null) {
  if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
}

/**
 * flexRender mounts a cell function as a component, so a page that rebuilds its column
 * defs (useMemo deps change) remounts every cell and loses its state - e.g. an open
 * confirm dialog closes when a fetch finishes. Cell renderers here are plain functions
 * (no hooks), so call them directly and let React reconcile the returned elements.
 */
function renderCell<T>(cell: Cell<T, unknown>) {
  const def = cell.column.columnDef.cell;
  return typeof def === 'function' ? def(cell.getContext()) : flexRender(def, cell.getContext());
}

/**
 * Nanobot data table (shadcn table + TanStack):
 * - every column has a min width; the table never squeezes below the sum of them and
 *   scrolls horizontally instead;
 * - columns are resizable by dragging the header divider (or with ←/→ on it) but never
 *   below their min width; double-click resets that column;
 * - when the container is wider than the columns, the `grow` column takes the spare room.
 */
export function DataTable<T>({
  id,
  columns,
  data,
  label,
  getRowId,
  isExpanded,
  renderExpanded,
  rowClassName,
  onRowClick,
  canClickRow,
  empty,
  className,
  paginate,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const [sizing, setSizing] = useState<ColumnSizingState>(() => loadSizing(id));
  const [pageSize, setPageSize] = usePageSize(id, (typeof paginate === 'object' && paginate.defaultPageSize) || DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    defaultColumn: { minSize: 72, size: 140 },
    state: { columnSizing: sizing },
    onColumnSizingChange: setSizing,
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(sizing));
    } catch {
      // storage unavailable
    }
  }, [id, sizing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const leafColumns = table.getVisibleLeafColumns();
  const total = table.getTotalSize();
  const extra = Math.max(0, containerWidth - total);
  const growId = (leafColumns.find((c) => c.columnDef.meta?.grow) ?? leafColumns[leafColumns.length - 1])?.id;
  const widthOf = (colId: string, size: number) => size + (colId === growId ? extra : 0);

  const nudge = (colId: string, delta: number) => (e: KeyboardEvent) => {
    e.preventDefault();
    const col = table.getColumn(colId)!;
    const min = col.columnDef.minSize ?? 72;
    setSizing((s) => ({ ...s, [colId]: Math.max(min, col.getSize() + delta) }));
  };

  const align = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  const allRows = table.getRowModel().rows;
  // Clamp rather than reset: rows can disappear (a delete) while the user is on the last page.
  const pages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = paginate ? allRows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : allRows;

  const overflows = containerWidth > 0 && total > containerWidth + 1;

  const grid = (
    <div
      ref={containerRef}
      data-slot="data-table"
      onScroll={() => mirrorScroll(containerRef.current, barRef.current)}
      className={cn(
        'relative w-full overflow-x-auto rounded-lg border bg-card',
        // Still scrollable (trackpad / shift+wheel / touch); the visible bar is the sticky mirror below.
        overflows && 'rounded-b-none scrollbar-none [&::-webkit-scrollbar]:hidden',
      )}
    >
      <table
        aria-label={label}
        className={cn('caption-bottom text-sm', table.getState().columnSizingInfo.isResizingColumn && 'select-none')}
        style={{ width: total + extra, tableLayout: 'fixed' }}
      >
        <colgroup>
          {leafColumns.map((c) => (
            <col key={c.id} style={{ width: widthOf(c.id, c.getSize()) }} />
          ))}
        </colgroup>
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const resizing = header.column.getIsResizing();
                const title = typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : meta?.label ?? header.id;
                return (
                  <TableHead
                    key={header.id}
                    aria-label={meta?.label}
                    className={cn('relative h-10 px-3 text-xs font-semibold text-muted-foreground', align(meta?.align))}
                  >
                    <div className="truncate">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </div>
                    {header.column.getCanResize() && (
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t('table.resize', { column: title })}
                        aria-valuenow={Math.round(header.column.getSize())}
                        aria-valuemin={header.column.columnDef.minSize ?? 72}
                        tabIndex={0}
                        title={t('table.resizeHint')}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft') nudge(header.column.id, -KEY_STEP)(e);
                          else if (e.key === 'ArrowRight') nudge(header.column.id, KEY_STEP)(e);
                        }}
                        className="group/resize absolute top-0 right-0 z-10 flex h-full w-3 cursor-col-resize touch-none justify-center outline-none select-none"
                      >
                        <span
                          className={cn(
                            'h-full w-px bg-border transition-[width,background-color] group-hover/resize:w-0.5 group-hover/resize:bg-primary group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-ring',
                            resizing && 'w-0.5 bg-primary',
                          )}
                        />
                      </div>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 && empty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={leafColumns.length} className="h-20 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const open = isExpanded?.(row.original) ?? false;
              const clickable = Boolean(onRowClick) && (canClickRow?.(row.original) ?? true);
              return (
                <Fragment key={row.id}>
                  <TableRow
                    data-state={open ? 'selected' : undefined}
                    data-clickable={clickable || undefined}
                    className={cn(clickable && 'cursor-pointer', rowClassName?.(row))}
                    onClick={clickable ? (e) => !isOwnAction(e) && onRowClick!(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'px-3 py-2.5 align-middle',
                            align(meta?.align),
                            meta?.align === 'right' && 'tabular-nums',
                            meta?.wrap ? 'whitespace-normal break-words' : 'truncate',
                          )}
                        >
                          {renderCell(cell)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {open && renderExpanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={leafColumns.length} className="p-0 whitespace-normal">
                        {/* Pinned to the visible part of a wide table: as wide as the viewport, never scrolled sideways. */}
                        <div
                          data-slot="data-table-expanded"
                          className="sticky left-0 p-4"
                          style={{ width: containerWidth || undefined }}
                        >
                          {renderExpanded(row.original)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </table>
    </div>
  );

  // A wide table's own scrollbar sits under its last row (often off-screen). Instead, hide it and
  // show a mirror scrollbar that sticks to the bottom of the viewport while the table is visible.
  const scrollbar = overflows && (
    <div
      ref={barRef}
      data-slot="data-table-scrollbar"
      aria-hidden
      onScroll={() => mirrorScroll(barRef.current, containerRef.current)}
      className="sticky bottom-0 z-20 -mt-px overflow-x-auto overflow-y-hidden rounded-b-lg border-x border-b bg-card/95 backdrop-blur scrollbar-thin"
    >
      <div style={{ width: total + extra, height: 1 }} />
    </div>
  );

  if (!paginate) {
    return (
      <div className={className}>
        {grid}
        {scrollbar}
      </div>
    );
  }
  return (
    <div className={className}>
      {grid}
      {scrollbar}
      <Pagination
        page={currentPage}
        limit={pageSize}
        total={allRows.length}
        onChange={setPage}
        onLimitChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
