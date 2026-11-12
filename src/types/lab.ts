export type SceneId = 'forense' | 'spoof' | 'ddos' | 'presenter';
export type SimSpeed = 0.25 | 0.5 | 1 | 2;
export type ThemeMode = 'dark' | 'light';

export interface SimEvent {
  id: string;
  at: number; // Instante en el reloj virtual (segundos)
  label: string;
  narration: string; // Máximo estricto de 12 palabras (Principio 1)
  packetId?: string;
}

export type LayerType = 'Ethernet' | 'IPv4' | 'UDP' | 'NTP' | 'NTS' | 'Modo7';

export interface PacketFieldHighlight {
  id: string;
  layer: LayerType;
  name: string;
  value: string;
  description: string;
  offsetByte: number;
  lengthByte: number;
}

export interface PacketFrame {
  id: string;
  title: string;
  subtitle: string;
  totalBytes: number;
  hexBytes: string[]; // Array de strings hexadecimales ("00" a "ff")
  fields: PacketFieldHighlight[];
}

export interface PresenterSyncMessage {
  type?: 'presenter-sync';
  scene: SceneId;
  t: number;
  duration: number;
  playing: boolean;
  speed: SimSpeed;
  stepIndex: number;
  totalSteps: number;
  narration: string;
  activePreset: string;
}

export type PresenterCommandMessage =
  | { type: 'presenter-cmd'; action: 'navigate'; scene: SceneId }
  | { type: 'presenter-cmd'; action: 'togglePlay' }
  | { type: 'presenter-cmd'; action: 'nextStep' }
  | { type: 'presenter-cmd'; action: 'prevStep' }
  | { type: 'presenter-cmd'; action: 'reset' };


