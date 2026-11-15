import React, { useState } from 'react';
import { Calculator, Delete, NotebookPen, X } from 'lucide-react';
import { evaluateFormula } from '../../utils/dynamicQuestionEngine';

interface ExamCalculatorSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEYS = [
  ['(', ')', 'C', 'DEL'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '^', '+'],
];

export const ExamCalculatorSheet: React.FC<ExamCalculatorSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const [tab, setTab] = useState<'CALC' | 'SCRATCH'>('CALC');
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string>('0');
  const [scratch, setScratch] = useState('');

  if (!isOpen) return null;

  const handlePress = (key: string) => {
    if (key === 'C') {
      setExpr('');
      setResult('0');
      return;
    }
    if (key === 'DEL') {
      setExpr((prev) => prev.slice(0, -1));
      return;
    }
    setExpr((prev) => prev + key);
  };

  const handleEquals = () => {
    if (!expr.trim()) return;
    const val = evaluateFormula(expr, {});
    setResult(String(val));
  };

  return (
    <div className="fixed inset-x-0 bottom-16 sm:bottom-20 z-[70] flex justify-center px-2 sm:px-4 pointer-events-none safe-bottom">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-3.5 sm:p-4 max-h-[72dvh] overflow-y-auto pointer-events-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl min-w-0">
            <button
              type="button"
              onClick={() => setTab('CALC')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                tab === 'CALC' ? 'bg-white text-brand-600 shadow-sm' : 'text-ink-600'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 shrink-0" />
              Máy tính Kinh tế
            </button>
            <button
              type="button"
              onClick={() => setTab('SCRATCH')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                tab === 'SCRATCH' ? 'bg-white text-brand-600 shadow-sm' : 'text-ink-600'
              }`}
            >
              <NotebookPen className="w-3.5 h-3.5 shrink-0" />
              Bảng nháp
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng công cụ"
            className="p-1.5 rounded-lg text-ink-500 hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {tab === 'CALC' ? (
          <div>
            <div className="bg-ink-900 text-white rounded-xl p-3 mb-3 text-right font-mono">
              <div className="text-xs text-slate-400 min-h-[16px] break-all">
                {expr || '0'}
              </div>
              <div className="text-2xl font-bold tracking-tight mt-0.5">{result}</div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {KEYS.flat().map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePress(key)}
                  className={`h-11 rounded-xl font-mono text-sm font-semibold transition active:scale-95 flex items-center justify-center ${
                    ['/', '*', '-', '+', '^'].includes(key)
                      ? 'bg-brand-50 text-brand-700 border border-brand-200'
                      : key === 'C' || key === 'DEL'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-slate-100 text-ink-900 hover:bg-slate-200'
                  }`}
                >
                  {key === 'DEL' ? <Delete className="w-4 h-4" /> : key}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handlePress('sqrt(')}
                className="col-span-2 h-11 rounded-xl bg-slate-100 text-ink-800 font-mono text-xs font-semibold hover:bg-slate-200"
              >
                sqrt(...)
              </button>
              <button
                type="button"
                onClick={handleEquals}
                className="col-span-2 h-11 rounded-xl bg-brand-600 text-white font-mono text-base font-bold hover:bg-brand-700"
              >
                = Tính
              </button>
            </div>
          </div>
        ) : (
          <div>
            <textarea
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              rows={6}
              placeholder="Ghi nháp công thức trung gian (ví dụ: P* = (120 - 10)/5 = 22)..."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm font-mono text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-ink-500 mt-1.5">
              Ghi chú nháp chỉ lưu cục bộ trong phiên thi này, không thoát màn hình khi tính toán.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
