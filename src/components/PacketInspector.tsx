import React, { useEffect, useState } from 'react';
import { Layers, X, Binary } from 'lucide-react';
import { LayerType, PacketFrame, ThemeMode } from '../types/lab';

interface PacketInspectorProps {
  packet: PacketFrame | null;
  onClose: () => void;
  onSwitchPacket?: (packetId: string) => void;
  availablePackets?: { id: string; label: string }[];
  theme: ThemeMode;
}

const LAYER_COLORS_DARK: Record<LayerType, string> = {
  Ethernet: 'bg-purple-500/20 border-purple-500 text-purple-300',
  IPv4: 'bg-emerald-500/20 border-emerald-500 text-emerald-300',
  UDP: 'bg-amber-500/20 border-amber-500 text-amber-300',
  NTP: 'bg-sky-500/20 border-sky-500 text-sky-300',
  NTS: 'bg-rose-500/20 border-rose-500 text-rose-300',
  Modo7: 'bg-orange-500/20 border-orange-500 text-orange-300',
};

const LAYER_COLORS_LIGHT: Record<LayerType, string> = {
  Ethernet: 'bg-purple-500/15 border-purple-600 text-purple-900',
  IPv4: 'bg-emerald-500/15 border-emerald-600 text-emerald-900',
  UDP: 'bg-amber-500/15 border-amber-600 text-amber-900',
  NTP: 'bg-sky-500/15 border-sky-600 text-sky-900',
  NTS: 'bg-rose-500/15 border-rose-600 text-rose-900',
  Modo7: 'bg-orange-500/15 border-orange-600 text-orange-900',
};

function getDefaultFieldId(packet: PacketFrame | null): string {
  if (!packet) return '';
  return (
    packet.fields.find((f) => f.layer === 'NTS' || f.layer === 'Modo7' || f.layer === 'NTP')?.id ||
    packet.fields[0]?.id ||
    ''
  );
}

export const PacketInspector: React.FC<PacketInspectorProps> = ({
  packet,
  onClose,
  onSwitchPacket,
  availablePackets = [],
  theme,
}) => {
  const [selectedFieldId, setSelectedFieldId] = useState<string>(() => getDefaultFieldId(packet));

  useEffect(() => {
    if (packet) {
      setSelectedFieldId(getDefaultFieldId(packet));
    }
  }, [packet?.id]);

  useEffect(() => {
    if (!packet) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [packet, onClose]);

  if (!packet) return null;

  const activeField = packet.fields.find((f) => f.id === selectedFieldId) || packet.fields[0];
  const isDark = theme === 'dark';
  const layerColors = isDark ? LAYER_COLORS_DARK : LAYER_COLORS_LIGHT;

  const isByteHighlighted = (byteIndex: number): boolean => {
    if (!activeField) return false;
    return (
      byteIndex >= activeField.offsetByte &&
      byteIndex < activeField.offsetByte + activeField.lengthByte
    );
  };

  const handleByteClick = (byteIndex: number) => {
    const matching = packet.fields.find(
      (f) => byteIndex >= f.offsetByte && byteIndex < f.offsetByte + f.lengthByte
    );
    if (matching) {
      setSelectedFieldId(matching.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-5xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Cabecera del Inspector */}
        <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className={`w-6 h-6 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
            <div>
              <h2 className="text-xl font-bold">{packet.title}</h2>
              <p className="text-sm opacity-75 font-mono">{packet.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {availablePackets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSwitchPacket && onSwitchPacket(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-mono border transition-colors ${
                  packet.id === p.id
                    ? 'bg-sky-500 text-slate-950 font-bold border-sky-400'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg ml-2 ${
                isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
              }`}
              aria-label="Cerrar inspector de paquetes"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo dividido: Capas PDU (Izquierda) y Bytes en Hexadecimal (Derecha) */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
          {/* Lista de Campos por Capa */}
          <div className="lg:col-span-6 space-y-2">
            <h3 className="text-sm font-mono uppercase tracking-wider opacity-75 mb-2">
              Estructura de Capas (Clic para resaltar bytes)
            </h3>
            {packet.fields.map((field) => {
              const selected = field.id === activeField?.id;
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selected
                      ? `${layerColors[field.layer]} ring-2 ring-sky-400`
                      : isDark
                      ? 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800'
                      : 'bg-slate-100 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">{field.name}</span>
                    <span
                      className={`font-mono text-sm px-2 py-0.5 rounded ${
                        isDark ? 'bg-black/30 text-slate-200' : 'bg-slate-900/10 text-slate-900 font-semibold'
                      }`}
                    >
                      {field.layer} · Bytes {field.offsetByte}–{field.offsetByte + field.lengthByte - 1}
                    </span>
                  </div>
                  <div className="font-mono text-sm mt-1 font-semibold">{field.value}</div>
                  <p className="text-sm opacity-85 mt-1">{field.description}</p>
                </button>
              );
            })}
          </div>

          {/* Volcado Hexadecimal Interactivo */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-mono uppercase tracking-wider opacity-75 flex items-center gap-2">
                  <Binary className={`w-4 h-4 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                  <span>Volcado Hexadecimal ({packet.totalBytes} Bytes)</span>
                </h3>
                {activeField && (
                  <span className={`font-mono text-sm font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                    Offset 0x{activeField.offsetByte.toString(16).padStart(2, '0')} ({activeField.lengthByte} B)
                  </span>
                )}
              </div>

              <div
                className={`p-4 rounded-xl border font-mono text-base tabular-nums grid grid-cols-8 sm:grid-cols-16 gap-1.5 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 text-slate-100 border-slate-700'
                }`}
              >
                {packet.hexBytes.map((hex, idx) => {
                  const highlighted = isByteHighlighted(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleByteClick(idx)}
                      className={`py-1 rounded text-center transition-colors ${
                        highlighted
                          ? 'bg-sky-400 text-slate-950 font-bold shadow'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                      title={`Byte ${idx} (0x${idx.toString(16).padStart(2, '0')})`}
                    >
                      {hex.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeField && (
              <div
                className={`mt-4 p-4 rounded-xl border ${
                  isDark
                    ? 'border-sky-500/40 bg-sky-500/10 text-slate-100'
                    : 'border-sky-600/50 bg-sky-500/15 text-slate-900'
                }`}
              >
                <div className={`text-sm font-mono uppercase font-bold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                  Campo Seleccionado
                </div>
                <div className="text-lg font-bold mt-0.5">{activeField.name}</div>
                <div className="font-mono text-sm mt-1">{activeField.value}</div>
                <p className="text-sm mt-1 opacity-90">{activeField.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


