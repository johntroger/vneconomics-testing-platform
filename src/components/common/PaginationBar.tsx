import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function paginateSlice<T>(
  items: T[],
  page: number,
  pageSize: number,
): { pageItems: T[]; safePage: number; totalPages: number } {
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  return {
    pageItems: items.slice(start, start + safeSize),
    safePage,
    totalPages,
  };
}

interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemLabel = 'mục',
}) => {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, safePage * pageSize);

  // Build smart compact page number sequence with ellipsis
  const getPageTokens = (): Array<number | 'dots-l' | 'dots-r'> => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const tokens: Array<number | 'dots-l' | 'dots-r'> = [1];
    if (safePage > 3) tokens.push('dots-l');
    const winStart = Math.max(2, safePage - 1);
    const winEnd = Math.min(totalPages - 1, safePage + 1);
    for (let p = winStart; p <= winEnd; p += 1) {
      tokens.push(p);
    }
    if (safePage < totalPages - 2) tokens.push('dots-r');
    tokens.push(totalPages);
    return tokens;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-slate-50/90 border border-slate-200 rounded-xl text-xs">
      <div className="flex flex-wrap items-center gap-2 text-ink-600">
        <span>
          Hiển thị{' '}
          <strong className="font-mono text-ink-900">
            {startIndex}–{endIndex}
          </strong>{' '}
          / <strong className="font-mono text-ink-900">{totalItems}</strong> {itemLabel}
        </span>
        {onPageSizeChange && pageSizeOptions.length > 0 && (
          <label className="inline-flex items-center gap-1 ml-1">
            <span className="text-[11px] text-ink-500">• Mỗi trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              aria-label="Số dòng mỗi trang"
              className="h-7 px-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-ink-800"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-ink-700 font-bold inline-flex items-center gap-0.5"
            aria-label="Trang trước"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Trước</span>
          </button>

          {getPageTokens().map((tok) =>
            typeof tok === 'number' ? (
              <button
                key={tok}
                type="button"
                onClick={() => onPageChange(tok)}
                className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[11px] font-mono font-bold border transition ${
                  tok === safePage
                    ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                    : 'bg-white text-ink-700 border-slate-200 hover:border-brand-300'
                }`}
              >
                {tok}
              </button>
            ) : (
              <span key={tok} className="px-1 text-ink-400 font-mono">
                ...
              </span>
            ),
          )}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-ink-700 font-bold inline-flex items-center gap-0.5"
            aria-label="Trang sau"
          >
            <span className="hidden sm:inline">Tiếp</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
