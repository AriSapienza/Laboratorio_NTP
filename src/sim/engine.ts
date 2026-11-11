import { SimEvent, SimSpeed } from '../types/lab';

export class Sim {
  public t = 0;
  public duration = 2.5;
  public speed: SimSpeed = 1;
  public playing = false;
  public reducedMotion = false;
  public events: SimEvent[] = [];

  private version = 0;
  private listeners = new Set<() => void>();
  private rafId: number | null = null;
  private lastRealTime: number | null = null;

  constructor(duration = 2.5, events: SimEvent[] = []) {
    this.duration = duration;
    this.events = [...events].sort((a, b) => a.at - b.at);
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): number => {
    return this.version;
  };

  private notify(): void {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  public setConfig(duration: number, events: SimEvent[]): void {
    this.pause();
    this.duration = duration;
    this.events = [...events].sort((a, b) => a.at - b.at);
    this.t = 0;
    this.notify();
  }

  public play(): void {
    if (this.playing) return;
    if (this.t >= this.duration) {
      this.t = 0;
    }
    if (this.reducedMotion) {
      this.nextStep();
      return;
    }
    this.playing = true;
    this.lastRealTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
    this.notify();
  }

  public pause(): void {
    this.playing = false;
    this.lastRealTime = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.notify();
  }

  public togglePlay(): void {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seek(targetT: number): void {
    this.t = Math.max(0, Math.min(this.duration, targetT));
    this.notify();
  }

  public setSpeed(speed: SimSpeed): void {
    this.speed = speed;
    this.notify();
  }

  public reset(): void {
    this.pause();
    this.t = 0;
    this.notify();
  }

  public nextStep(): void {
    this.pause();
    const nextEv = this.events.find((e) => e.at > this.t + 0.001);
    if (nextEv) {
      this.t = nextEv.at;
    } else {
      this.t = this.duration;
    }
    this.notify();
  }

  public prevStep(): void {
    this.pause();
    const prevEvents = this.events.filter((e) => e.at < this.t - 0.05);
    if (prevEvents.length > 0) {
      this.t = prevEvents[prevEvents.length - 1].at;
    } else {
      this.t = 0;
    }
    this.notify();
  }

  public seekToEvent(eventId: string): void {
    const target = this.events.find((e) => e.id === eventId);
    if (target) {
      this.pause();
      this.t = target.at;
      this.notify();
    }
  }

  public getCurrentEventIndex(): number {
    let idx = 0;
    for (let i = 0; i < this.events.length; i++) {
      if (this.t >= this.events[i].at - 0.001) {
        idx = i;
      }
    }
    return idx;
  }

  public getCurrentEvent(): SimEvent | null {
    if (this.events.length === 0) return null;
    return this.events[this.getCurrentEventIndex()];
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    if (this.lastRealTime !== null) {
      const dtSeconds = ((now - this.lastRealTime) / 1000) * this.speed;
      this.t = Math.min(this.duration, this.t + dtSeconds);
      if (this.t >= this.duration) {
        this.playing = false;
        this.lastRealTime = null;
        this.notify();
        return;
      }
    }
    this.lastRealTime = now;
    this.notify();
    this.rafId = requestAnimationFrame(this.tick);
  };
}

