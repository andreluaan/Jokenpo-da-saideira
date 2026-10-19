import { audio, type Bus } from '../audio/engine';

/**
 * Botão 🔊 no canto de cima à direita (menu e partida) com as barrinhas de volume e o mudo.
 * Tecla M muta/desmuta em qualquer tela. A barrinha de música entra junto com a rádio (2ª entrega).
 */
const SLIDERS: { bus: Bus; label: string }[] = [
  { bus: 'sfx', label: 'Efeitos' },
  { bus: 'ambient', label: 'Ambiente' },
];

export function mountSoundPanel(host: HTMLElement): void {
  const root = document.createElement('div');
  root.className = 'sound-ctl';
  root.innerHTML = `
    <button type="button" class="sound-btn" tabindex="-1" title="Som (M muta)" aria-label="Som" aria-expanded="false"></button>
    <div class="sound-pop hidden" role="dialog" aria-label="Volume">
      ${SLIDERS.map((s) => `<label class="sound-row"><span>${s.label}</span><input type="range" min="0" max="100" step="1" data-bus="${s.bus}" /><b></b></label>`).join('')}
      <button type="button" class="sound-mute" tabindex="-1"></button>
    </div>`;
  host.appendChild(root);
  const btn = root.querySelector<HTMLButtonElement>('.sound-btn')!;
  const pop = root.querySelector<HTMLDivElement>('.sound-pop')!;
  const mute = root.querySelector<HTMLButtonElement>('.sound-mute')!;
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[type=range]')];

  const render = () => {
    const st = audio.settings;
    const off = st.muted || SLIDERS.every((x) => st[x.bus] <= 0);
    btn.textContent = off ? '🔇' : '🔊';
    btn.classList.toggle('muted', off);
    mute.textContent = st.muted ? '🔊 Ligar o som (M)' : '🔇 Mudo (M)';
    for (const inp of inputs) {
      const v = Math.round(st[inp.dataset.bus as Bus] * 100);
      inp.value = String(v);
      inp.nextElementSibling!.textContent = `${v}`;
    }
  };
  const toggle = (open: boolean) => {
    pop.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  };

  // Não rouba o foco do jogo (teclas de movimento continuam indo para a partida).
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => toggle(pop.classList.contains('hidden')));
  mute.addEventListener('mousedown', (e) => e.preventDefault());
  mute.addEventListener('click', () => audio.set({ muted: !audio.settings.muted }));
  for (const inp of inputs) {
    inp.addEventListener('input', () => audio.set({ [inp.dataset.bus as Bus]: Number(inp.value) / 100, muted: false }));
    // Solta o foco ao terminar de arrastar, para as setas/WASD voltarem para o jogo.
    inp.addEventListener('change', () => inp.blur());
  }
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) toggle(false);
  });
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.code !== 'KeyM' || e.repeat || tag === 'INPUT' || tag === 'TEXTAREA') return;
    audio.set({ muted: !audio.settings.muted });
  });
  audio.onChange(render);
  render();
}
