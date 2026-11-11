import React from 'react';
import { ListOrdered, SearchCode } from 'lucide-react';
import { SimEvent, ThemeMode } from '../types/lab';

interface EventListProps {
  events: SimEvent[];
  currentEventIndex: number;
  onSelectEvent: (eventId: string) => void;
  onInspectPacket?: (packetId: string) => void;
  theme: ThemeMode;
}

export const EventList: React.FC<EventListProps> = ({
  events,
  currentEventIndex,
  onSelectEvent,
  onInspectPacket,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col h-full min-h-0 ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold text-base">Eventos de Simulación (G4)</h3>
        </div>
        <span className="font-mono text-sm opacity-75">{events.length} hitos</span>
      </div>

      <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
        {events.map((ev, index) => {
          const isCurrent = index === currentEventIndex;
          return (
            <div
              key={ev.id}
              className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                isCurrent
                  ? isDark
                    ? 'bg-sky-500/15 border-sky-500 text-sky-300 shadow-sm'
                    : 'bg-sky-500/15 border-sky-600 text-sky-950 shadow-sm'
                  : isDark
                  ? 'bg-slate-800/50 border-slate-800 text-slate-300 hover:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectEvent(ev.id)}
                className="flex items-center gap-2.5 text-left flex-1 min-w-0"
              >
                <span
                  className={`px-2 py-0.5 rounded font-mono tabular-nums text-sm shrink-0 ${
                    isCurrent
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : isDark
                      ? 'bg-slate-700/50 text-slate-200'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {ev.at.toFixed(2)}s
                </span>
                <span className="text-sm font-medium truncate">{ev.label}</span>
              </button>

              {ev.packetId && onInspectPacket && (
                <button
                  type="button"
                  onClick={() => onInspectPacket(ev.packetId!)}
                  className={`px-2.5 py-1 rounded border text-sm font-mono flex items-center gap-1 shrink-0 ${
                    isDark
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                      : 'bg-amber-500/15 border-amber-600/50 text-amber-900 font-semibold hover:bg-amber-500/25'
                  }`}
                  title="Abrir Inspector Hexadecimal de Paquete (G5)"
                >
                  <SearchCode className="w-4 h-4" />
                  <span>PDU</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

