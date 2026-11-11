import { PresenterCommandMessage, PresenterSyncMessage } from '../types/lab';

let channelInstance: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!channelInstance) {
      channelInstance = new BroadcastChannel('ntp-lab-channel');
    }
    return channelInstance;
  } catch {
    return null;
  }
}

export function broadcastPresenterState(msg: PresenterSyncMessage): void {
  try {
    const ch = getChannel();
    ch?.postMessage({ ...msg, type: 'presenter-sync' });
  } catch {
    // Silencioso si el navegador o file:// restringe BroadcastChannel
  }
}

export function sendPresenterCommand(cmd: PresenterCommandMessage): void {
  try {
    const ch = getChannel();
    ch?.postMessage(cmd);
  } catch {
    // Silencioso si el navegador o file:// restringe BroadcastChannel
  }
}

export function subscribePresenterCommands(
  onCommand: (cmd: PresenterCommandMessage) => void
): () => void {
  try {
    if (typeof BroadcastChannel === 'undefined') return () => {};
    const ch = new BroadcastChannel('ntp-lab-channel');
    ch.onmessage = (ev: MessageEvent<PresenterCommandMessage | PresenterSyncMessage>) => {
      if (ev.data && ev.data.type === 'presenter-cmd') {
        onCommand(ev.data);
      }
    };
    return () => {
      try {
        ch.close();
      } catch {}
    };
  } catch {
    return () => {};
  }
}


