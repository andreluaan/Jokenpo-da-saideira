import { isYoutubeId, type RadioState } from '@ppt/shared';
import { audio } from './engine';

/**
 * Rádio do Zé: músicas do YouTube tocando num player pequeno ("TV do Zé") no canto da tela.
 * Regras do YouTube: o player fica **visível** (mín. 200×200 px, nada por cima) — por isso a TV aparece enquanto toca.
 * O som do YouTube não passa pelo Web Audio: a barrinha "Música" só ajusta o volume do player.
 * - Sozinho (treino/menu): toca a lista em sequência; pula vídeo bloqueado.
 * - Numa sala: o **dono** escolhe e o servidor repassa; os outros seguem a mesma música no mesmo ponto.
 */

export interface Track {
  id: string;
  title: string;
}

/** Lista do usuário (out/2026). Para trocar um vídeo, mude o id aqui. */
export const ZE_LIST: Track[] = [
  { id: '8Xe8gApDRgU', title: 'Reginaldo Rossi – Garçom' },
  { id: '5JNa47qtJmM', title: 'Alcione – Meu Ébano' },
  { id: 'DwsKhZLj01M', title: 'Alcione – Não Deixe o Samba Morrer' },
  { id: 'Db3Zzd5D-E8', title: 'Raça Negra – Cheia de Manias' },
  { id: 'mZK0m7jMlZA', title: 'Raça Negra – É Tarde Demais' },
  { id: '9PKohZuXlR8', title: 'Raça Negra – Cigana' },
  { id: 'nL_QNpNOssI', title: 'Zé Ramalho – Chão de Giz' },
  { id: 'SBEyjXJlv-8', title: 'Zé Ramalho – Avôhai' },
  { id: '7EjIdjKNRls', title: 'Chitãozinho & Xororó e Zé Ramalho – Sinônimos' },
  { id: 'ePjtnSPFWK8', title: 'Chitãozinho & Xororó – Evidências' },
  { id: 'glMgzRh5U9A', title: 'Joaquim e Manuel – Boate Azul' },
  { id: 'mCkDoG7BHTA', title: 'João Mineiro & Marciano – Ainda Ontem Chorei de Saudade' },
  { id: '7VMC2RzbAJ0', title: 'Trio Parada Dura – Telefone Mudo' },
  { id: 'VD5RrI3w9Ws', title: 'Leandro & Leonardo – Pense em Mim' },
  { id: 'BnwdBf4gapY', title: 'Alcione – Meu Vício é Você' },
  { id: 'j9UbE1slI-Q', title: 'Caetano Veloso – Sozinho' },
  { id: 'BkzOFrpCo5E', title: 'Raquel dos Teclados – Agora Estou Sofrendo' },
  { id: 'l4bX1NPZeB0', title: 'Eduardinho dos Teclados – Não Sirvo' },
];

/** Tira o id de um link do YouTube (watch?v=, youtu.be/, shorts/, embed/) ou aceita o id puro. */
export function parseYoutube(raw: string): string | null {
  const s = raw.trim();
  if (isYoutubeId(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    if (!/(^|\.)(youtu\.be|youtube\.com|youtube-nocookie\.com)$/.test(u.hostname)) return null;
    const v = u.searchParams.get('v');
    if (v && isYoutubeId(v)) return v;
    const m = u.pathname.match(/\/(?:shorts\/|embed\/|live\/)?([\w-]{11})(?:$|\/)/);
    if (m) return m[1];
  } catch {
    /* não é link */
  }
  return null;
}

// ---------------------------------------------------------------- API do YouTube (tipos mínimos)
interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getVideoData(): { title?: string; video_id?: string };
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}
const ENDED = 0;
const PLAYING = 1;

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (!apiPromise) {
    apiPromise = new Promise((ok, fail) => {
      if (window.YT?.Player) return ok();
      window.onYouTubeIframeAPIReady = () => ok();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => fail(new Error('YouTube indisponível'));
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

const ON_KEY = 'ppt.radio.on';
type Mode = 'solo' | 'host' | 'guest';

class Radio {
  /** Rádio ligada (para este jogador). Fica salvo no navegador. */
  on = readOn();
  mode: Mode = 'solo';
  index = 0;
  current: Track | null = null;
  /** Erro para mostrar no painel (sem internet, YouTube bloqueado…). */
  status = '';
  private queue: Track[] = [...ZE_LIST];
  private player: YTPlayer | null = null;
  private creating: Promise<YTPlayer | null> | null = null;
  private tv: HTMLDivElement | null = null;
  private send: ((r: { id: string; title: string; pos: number } | null) => void) | null = null;
  private room: RadioState | null = null;
  /** Diferença relógio do servidor − relógio local (ms). */
  private offset = 0;
  private readonly listeners = new Set<() => void>();

  /** Monta a TV do Zé (escondida até tocar) e começa a lista depois do primeiro clique. */
  mount(host: HTMLElement): void {
    this.tv = document.createElement('div');
    this.tv.className = 'radio-tv hidden';
    this.tv.innerHTML = `<div class="radio-tv-head">📻 Rádio do Zé</div><div class="radio-tv-screen"><div></div></div><div class="radio-tv-title"></div>`;
    host.appendChild(this.tv);
    audio.onChange(() => this.applyVolume());
    audio.whenReady(() => {
      if (this.on && this.mode !== 'guest') this.playIndex(Math.floor(Math.random() * this.queue.length));
    });
  }

  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  get canControl(): boolean {
    return this.mode !== 'guest';
  }

  get list(): readonly Track[] {
    return this.queue;
  }

  /** Liga/desliga para mim. O dono, ao desligar, desliga para a sala toda. */
  setOn(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(ON_KEY, on ? '1' : '0');
    } catch {
      /* ignora */
    }
    if (!on) {
      this.player?.stopVideo();
      if (this.mode === 'host') this.send?.(null);
      this.current = null;
    } else if (this.mode === 'guest') this.follow();
    else this.playIndex(this.index);
    this.render();
  }

  next(): void {
    if (!this.canControl) return;
    this.playIndex(this.index + 1);
  }

  pick(i: number): void {
    if (!this.canControl) return;
    this.on = true;
    this.playIndex(i);
  }

  /** Toca um link colado: entra na lista logo depois da atual. Devolve false se o link não for do YouTube. */
  playLink(raw: string): boolean {
    const id = parseYoutube(raw);
    if (!id || !this.canControl) return false;
    const i = this.queue.findIndex((t) => t.id === id);
    if (i >= 0) this.pick(i);
    else {
      this.queue.splice(this.index + 1, 0, { id, title: 'Link colado' });
      this.pick(this.index + 1);
    }
    return true;
  }

  /**
   * Chamado a cada atualização da sala (ou null ao sair). `send` manda a escolha do dono ao servidor.
   */
  setRoom(state: { hostId: string; radio: RadioState | null; serverTime: number } | null, myId: string | null, send: Radio['send']): void {
    const prev = this.mode;
    if (!state) {
      this.mode = 'solo';
      this.room = null;
      this.send = null;
      this.render();
      return;
    }
    this.offset = state.serverTime - Date.now();
    this.room = state.radio;
    this.send = send;
    this.mode = state.hostId === myId ? 'host' : 'guest';
    if (this.mode === 'host') {
      // Virou dono (criou a sala ou o antigo saiu): a sala passa a ouvir o que já toca aqui.
      if (prev !== 'host' && this.on && this.current) this.broadcast();
      else if (prev !== 'host' && this.on && !this.current) this.playIndex(this.index);
    } else this.follow();
    this.render();
  }

  // ------------------------------------------------------------------ por dentro

  private emit(): void {
    this.listeners.forEach((f) => f());
  }

  private render(): void {
    if (this.tv) {
      this.tv.classList.toggle('hidden', !this.on || !this.current);
      (this.tv.querySelector('.radio-tv-title') as HTMLElement).textContent = this.current?.title ?? '';
    }
    this.emit();
  }

  /** Convidado: segue a música do dono no ponto certo. */
  private follow(): void {
    if (this.mode !== 'guest') return;
    const r = this.room;
    if (!this.on || !r) {
      this.player?.stopVideo();
      this.current = null;
      this.render();
      return;
    }
    const same = this.current?.id === r.id;
    this.current = { id: r.id, title: r.title || this.queue.find((t) => t.id === r.id)?.title || 'Rádio do Zé' };
    // Só depois do primeiro clique (o navegador bloqueia som antes disso).
    audio.whenReady(() =>
      void this.ensurePlayer().then((p) => {
        if (!p || this.mode !== 'guest' || this.room?.id !== r.id) return;
        if (!same || p.getPlayerState() === ENDED) p.loadVideoById({ videoId: r.id, startSeconds: this.roomPos() });
        else this.resync();
        this.applyVolume();
      }),
    );
    this.render();
  }

  private playIndex(i: number): void {
    if (!this.queue.length) return;
    this.index = ((i % this.queue.length) + this.queue.length) % this.queue.length;
    this.current = this.queue[this.index];
    this.on = true;
    const id = this.current.id;
    audio.whenReady(() =>
      void this.ensurePlayer().then((p) => {
        if (!p || this.current?.id !== id) return;
        p.loadVideoById({ videoId: id });
        this.applyVolume();
      }),
    );
    this.render();
  }

  /** Segundo em que a música do dono está agora. */
  private roomPos(): number {
    return this.room ? Math.max(0, (Date.now() + this.offset - this.room.startedAt) / 1000) : 0;
  }

  /** Convidado: se ficou mais de 1,5 s fora do ponto do dono (vídeo carregando), pula para o ponto certo. */
  private resync(): void {
    const p = this.player;
    if (this.mode !== 'guest' || !p || !this.room) return;
    const pos = this.roomPos();
    if (Math.abs(p.getCurrentTime() - pos) > 1.5) p.seekTo(pos, true);
  }

  /** Dono: avisa a sala do que está tocando e em que segundo. */
  private broadcast(): void {
    if (this.mode !== 'host' || !this.current) return;
    const pos = this.player ? this.player.getCurrentTime() : 0;
    this.send?.({ id: this.current.id, title: this.current.title, pos });
  }

  private ensurePlayer(): Promise<YTPlayer | null> {
    if (this.player) return Promise.resolve(this.player);
    if (!this.creating) {
      this.creating = loadApi()
        .then(
          () =>
            new Promise<YTPlayer>((ok) => {
              const slot = this.tv!.querySelector('.radio-tv-screen > div') as HTMLElement;
              const p = new window.YT!.Player(slot, {
                width: 200,
                height: 200,
                playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
                events: {
                  onReady: () => {
                    this.player = p;
                    ok(p);
                  },
                  onStateChange: (e: { data: number }) => this.onState(e.data),
                  // 101/150 = dono do vídeo não deixa tocar fora do YouTube; 100 = removido → pula.
                  onError: () => {
                    this.status = 'Um vídeo não pôde tocar aqui — pulei para a próxima.';
                    if (this.canControl) this.playIndex(this.index + 1);
                    this.emit();
                  },
                },
              });
            }),
        )
        .catch(() => {
          this.status = 'Não consegui abrir o YouTube (sem internet ou bloqueado).';
          this.creating = null;
          this.emit();
          return null;
        });
    }
    return this.creating;
  }

  private onState(s: number): void {
    if (s === PLAYING) {
      this.status = '';
      const data = this.player?.getVideoData() ?? {};
      // O que manda é o vídeo que está tocando de fato (evita painel dizendo uma música e a TV tocando outra).
      if (data.video_id && this.current?.id !== data.video_id) {
        const i = this.queue.findIndex((t) => t.id === data.video_id);
        if (i >= 0) this.index = i;
        this.current = i >= 0 ? this.queue[i] : { id: data.video_id, title: data.title || 'Rádio do Zé' };
      }
      if (this.current && this.current.title === 'Link colado' && data.title) this.current.title = data.title;
      this.broadcast();
      this.resync();
      this.render();
    } else if (s === ENDED && this.canControl) this.playIndex(this.index + 1);
  }

  private applyVolume(): void {
    const p = this.player;
    if (!p) return;
    const st = audio.settings;
    if (st.muted || st.music <= 0) p.mute();
    else {
      p.unMute();
      p.setVolume(Math.round(st.music ** 2 * 100));
    }
  }
}

function readOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) !== '0';
  } catch {
    return true;
  }
}

export const radio = new Radio();
