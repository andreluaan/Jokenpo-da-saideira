/**
 * Motor de som (Web Audio). Três "canais" com volume próprio — efeitos, ambiente e música (a música entra
 * na 2ª entrega, pela rádio do YouTube) — e um mudo geral. Volumes ficam salvos no navegador.
 * O navegador só deixa tocar som depois do primeiro clique/tecla: `unlock()` é chamado nesses eventos.
 */
export type Bus = 'sfx' | 'ambient' | 'music';

export interface SoundSettings {
  sfx: number;
  ambient: number;
  music: number;
  muted: boolean;
}

const KEY = 'ppt.sound';
const DEFAULTS: SoundSettings = { sfx: 0.8, ambient: 0.5, music: 0.6, muted: false };

function load(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return { ...DEFAULTS };
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private noiseBuf: AudioBuffer | null = null;
  settings: SoundSettings = load();
  private readonly listeners = new Set<() => void>();
  private readonly readyCbs: (() => void)[] = [];

  /** Cria/retoma o contexto (precisa de um gesto do usuário). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      // Limitador leve: vários sons juntos não estouram.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      for (const b of ['sfx', 'ambient', 'music'] as Bus[]) {
        this.buses[b] = this.ctx.createGain();
        this.buses[b].connect(this.master);
      }
      this.apply();
      this.readyCbs.splice(0).forEach((f) => f());
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Roda `f` assim que o som estiver liberado (na hora, se já estiver). */
  whenReady(f: () => void): void {
    if (this.ctx) f();
    else this.readyCbs.push(f);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  bus(b: Bus): GainNode {
    return this.buses[b];
  }

  set(patch: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* ignora */
    }
    this.apply();
    this.listeners.forEach((f) => f());
  }

  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Valor exato e na hora (setTargetAtTime só "se aproxima" do zero e deixava um fiozinho de som).
    const set = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      p.setValueAtTime(v, t);
    };
    set(this.master.gain, this.settings.muted ? 0 : 1);
    // Curva quadrada: a barrinha "anda" de forma mais natural para o ouvido.
    for (const b of ['sfx', 'ambient', 'music'] as Bus[]) set(this.buses[b].gain, this.settings[b] ** 2);
  }

  /** Canal em 0 ou mudo: nem cria o som. */
  silent(b: Bus): boolean {
    return this.settings.muted || this.settings[b] <= 0;
  }

  /** 2 s de ruído branco reaproveitado por todos os sons. */
  noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const ctx = this.ctx!;
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }
}

export const audio = new AudioEngine();

// Primeiro gesto do usuário libera o som.
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.unlock(), { capture: true });
