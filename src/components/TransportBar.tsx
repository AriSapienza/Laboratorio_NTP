import React from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { SimSpeed, ThemeMode } from '../types/lab';

export interface PresetOption {
  id: string;
  label: string;
}

interface TransportBarProps {
  t: number;
  duration: number;
  playing: boolean;
  speed: SimSpeed;
  onTogglePlay: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onReset: () => void;
  onSeek: (newT: number) => void;
  onChangeSpeed: (speed: SimSpeed) => void;
  presets: PresetOption[];
  activePreset: string;
  onSelectPreset: (presetId: string) => void;
  theme: ThemeMode;
}

const SPEEDS: SimSpeed[] = [0.25, 0.5, 1, 2];

export const TransportBar: React.FC<TransportBarProps> = ({
  t,
  duration,
  playing,
  speed,
  onTogglePlay,
  onPrevStep,
  onNextStep,
  onReset,
  onSeek,
  onChangeSpeed,
  presets,
  activePreset,
  onSelectPreset,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <footer
      className={`h-16 px-6 border-t flex items-center justify-between gap-6 select-none ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
      }`}
    >
      {/* Controles de Reproducción y Paso a Paso */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onTogglePlay}
          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-md transition-transform active:scale-95"
        >
          {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{playing ? 'Pausa' : 'Reproducir'}</span>
        </button>

        <button
          type="button"
          onClick={onPrevStep}
          className={`p-2 rounded-lg border text-sm font-medium transition-colors ${
            isDark
              ? 'bg-slate-800 border-slate-700 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-300 hover:bg-slate-200'
          }`}
          title="Paso anterior (Flecha Izquierda)"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onNextStep}
          className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors ${
            isDark
              ? 'bg-slate-800 border-slate-700 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-300 hover:bg-slate-200'
          }`}
          title="Siguiente paso (Flecha Derecha)"
        >
          <span>Paso</span>
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onReset}
          className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors ${
            isDark
              ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-rose-300'
              : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-rose-700'
          }`}
          title="Reiniciar escena (Tecla R)"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reiniciar (R)</span>
        </button>
      </div>

      {/* Línea de Tiempo Arrastrable acoplada a sim.t */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <span className="font-mono tabular-nums text-sm font-semibold w-20 text-right">
          t = {t.toFixed(2)}s
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={t}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full accent-sky-500 h-2 rounded-lg cursor-pointer"
          aria-label="Línea de tiempo virtual"
        />
        <span className="font-mono tabular-nums text-sm opacity-70 w-14">
          {duration.toFixed(1)}s
        </span>
      </div>

      {/* Selector de Velocidad (0.25x a 2x) */}
      <div className="flex items-center gap-1 shrink-0">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChangeSpeed(s)}
            className={`px-2.5 py-1 rounded-md font-mono text-sm transition-colors ${
              speed === s
                ? 'bg-sky-500/20 border border-sky-500 text-sky-400 font-bold'
                : isDark
                ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Presets Ensayados de la Escena (Requisito G8) */}
      {presets.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0 border-l pl-4 border-slate-700/50">
          <span className="text-sm font-medium opacity-75 mr-1">Presets:</span>
          {presets.map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}
    </footer>
  );
};

