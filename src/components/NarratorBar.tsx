import React, { useEffect, useState } from 'react';
import { BookOpen, X, MessageSquareQuote } from 'lucide-react';
import { ThemeMode } from '../types/lab';

interface NarratorBarProps {
  sceneTitle: string;
  keyMessage: string;
  stepIndex: number;
  totalSteps: number;
  narration: string;
  detailTitle: string;
  detailContent: React.ReactNode;
  theme: ThemeMode;
}

export const NarratorBar: React.FC<NarratorBarProps> = ({
  sceneTitle,
  keyMessage,
  stepIndex,
  totalSteps,
  narration,
  detailTitle,
  detailContent,
  theme,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [drawerOpen]);

  return (
    <>
      <section
        className={`px-6 py-2.5 border-b flex items-center justify-between gap-4 ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}
      >
        {/* Indicador Paso X de Y + Narración en 1 línea (<= 12 palabras) */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`px-3 py-1 rounded-full border font-mono font-semibold text-sm shrink-0 tabular-nums ${
              isDark
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                : 'bg-sky-500/15 border-sky-600/50 text-sky-800'
            }`}
          >
            Paso {Math.min(stepIndex + 1, Math.max(1, totalSteps))} de {Math.max(1, totalSteps)}
          </span>
          <MessageSquareQuote className={`w-5 h-5 shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
          <p className="text-xl font-semibold tracking-tight truncate">{narration}</p>
        </div>

        {/* Mensaje Clave de la Escena y Botón "Ver detalle" */}
        <div className="flex items-center gap-3 shrink-0">
          <span className={`hidden xl:inline text-sm ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
            <strong>{sceneTitle}:</strong> {keyMessage}
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-2 transition-colors ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-sky-300 hover:bg-slate-700'
                : 'bg-white border-slate-300 text-sky-700 hover:bg-slate-50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Ver detalle</span>
          </button>
        </div>
      </section>

      {/* Cajón Lateral Colapsable "Ver detalle" (Cerrado por defecto, Principio 1) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl h-full p-6 overflow-y-auto shadow-2xl border-l flex flex-col justify-between ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-700/60">
                <div>
                  <span className={`text-sm font-mono uppercase font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                    Respaldo de la Monografía
                  </span>
                  <h2 className="text-2xl font-bold mt-0.5">{detailTitle}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className={`p-2 rounded-lg ${
                    isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                  }`}
                  aria-label="Cerrar panel de detalle"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-5 space-y-4 text-base leading-relaxed">{detailContent}</div>
            </div>

            <div className="pt-4 border-t border-slate-700/60 flex justify-end">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold text-sm"
              >
                Cerrar detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


