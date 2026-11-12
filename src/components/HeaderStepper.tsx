import React from 'react';
import {
  FileSearch,
  ShieldAlert,
  Activity,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  MonitorPlay,
} from 'lucide-react';
import { SceneId, ThemeMode } from '../types/lab';

interface HeaderStepperProps {
  activeScene: SceneId;
  onSelectScene: (scene: SceneId) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  presentationMode: boolean;
  onTogglePresentation: () => void;
  onOpenPresenterWindow: () => void;
}

const STEPS: { id: SceneId; keyNum: string; label: string; timeHint: string; icon: React.ReactNode }[] = [
  { id: 'forense', keyNum: '1', label: 'Peritaje Forense', timeHint: '0:00–3:30', icon: <FileSearch className="w-4 h-4" /> },
  { id: 'spoof', keyNum: '2', label: 'Spoofing y NTS', timeHint: '3:30–7:00', icon: <ShieldAlert className="w-4 h-4" /> },
  { id: 'ddos', keyNum: '3', label: 'Amplificación DDoS', timeHint: '7:00–10:00', icon: <Activity className="w-4 h-4" /> },
];

export const HeaderStepper: React.FC<HeaderStepperProps> = ({
  activeScene,
  onSelectScene,
  theme,
  onToggleTheme,
  presentationMode,
  onTogglePresentation,
  onOpenPresenterWindow,
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      className={`h-14 px-4 border-b flex items-center justify-between select-none transition-colors ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
      }`}
    >
      {/* Identidad del Laboratorio */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onSelectScene('forense')}
          className="flex items-center gap-2 font-bold text-lg tracking-tight hover:text-sky-500 transition-colors"
        >
          <span
            className={`px-2 py-0.5 rounded font-mono text-sm border ${
              isDark
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'bg-sky-500/15 text-sky-800 border-sky-600/50'
            }`}
          >
            UDP:123
          </span>
          <span>Laboratorio Integral NTP</span>
        </button>
      </div>

      {/* Stepper de Navegación por Escenas (Requisito G2) */}
      <nav className="flex items-center gap-1.5" aria-label="Escenas de la demostración">
        {STEPS.map((step) => {
          const active = activeScene === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectScene(step.id)}
              className={`px-3 py-1.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
                active
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-md'
                  : isDark
                  ? 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-sm ${
                  active ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-500/20'
                }`}
              >
                {step.keyNum}
              </span>
              {step.icon}
              <span>{step.label}</span>
              {!presentationMode && (
                <span className={`font-mono text-sm ${active ? 'text-slate-900' : 'opacity-60'}`}>
                  ({step.timeHint})
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Controles Globales: Presentador, Tema y Modo Exposición */}
      <div className="flex items-center gap-2">
        {!presentationMode && (
          <button
            type="button"
            onClick={onOpenPresenterWindow}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-1.5 transition-colors ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
            }`}
          >
            <MonitorPlay className="w-4 h-4 text-emerald-400" />
            <span>Guion (G14)</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className={`p-2 rounded-lg border transition-colors ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
          }`}
          aria-label="Cambiar tema claro u oscuro"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onTogglePresentation}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border flex items-center gap-1.5 transition-colors ${
            presentationMode
              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
              : isDark
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
          }`}
        >
          {presentationMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span>{presentationMode ? 'Salir Exposición (F)' : 'Exposición (F)'}</span>
        </button>
      </div>
    </header>
  );
};

