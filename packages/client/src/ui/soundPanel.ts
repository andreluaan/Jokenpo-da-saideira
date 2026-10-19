import { audio, type Bus } from '../audio/engine';
import { radio } from '../audio/radio';
import { escapeHtml } from './hud';

/**
 * Botão 🔊 no canto de cima à direita (menu e partida): barrinhas de volume (Música, Efeitos, Ambiente),
 * mudo e os controles da Rádio do Zé (ligar, próxima, escolher da lista, colar link). Tecla M muta.
 * Numa sala online só o dono troca a música; os outros podem só desligar para si.
 */
const SLIDERS: { bus: Bus; label: string }[] = [
  { bus: 'music', label: 'Música' },
  { bus: 'sfx', label: 'Efeitos' },
  { bus: 'ambient', label: 'Ambiente' },
];

export function mountSoundPanel(host: HTMLElement): void {
  const root = document.createElement('div');
  root.className = 'sound-ctl';
  root.innerHTML = `
    <button type="button" class="sound-btn" tabindex="-1" title="Som e rádio (M muta)" aria-label="Som" aria-expanded="false"></button>
    <div class="sound-pop hidden" role="dialog" aria-label="Volume e rádio">
      ${SLIDERS.map((s) => `<label class="sound-row"><span>${s.label}</span><input type="range" min="0" max="100" step="1" data-bus="${s.bus}" /><b></b></label>`).join('')}
      <button type="button" class="sound-mute" tabindex="-1"></button>
      <div class="radio-ctl">
        <div class="radio-head"><b>📻 Rádio do Zé</b>
          <button type="button" class="radio-on" tabindex="-1"></button>
          <button type="button" class="radio-next" tabindex="-1" title="Próxima música">⏭</button>
        </div>
        <select class="radio-list" tabindex="-1" aria-label="Escolher música"></select>
        <form class="radio-link"><input type="text" placeholder="Colar link do YouTube" aria-label="Link do YouTube" /><button type="submit" tabindex="-1">Tocar</button></form>
        <p class="radio-note"></p>
      </div>
    </div>`;
  host.appendChild(root);
  radio.mount(host);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const btn = $<HTMLButtonElement>('.sound-btn');
  const pop = $<HTMLDivElement>('.sound-pop');
  const mute = $<HTMLButtonElement>('.sound-mute');
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[type=range]')];
  const rOn = $<HTMLButtonElement>('.radio-on');
  const rNext = $<HTMLButtonElement>('.radio-next');
  const rList = $<HTMLSelectElement>('.radio-list');
  const rForm = $<HTMLFormElement>('.radio-link');
  const rInput = rForm.querySelector('input')!;
  const rNote = $<HTMLParagraphElement>('.radio-note');
  let listKey = '';

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
  const renderRadio = () => {
    const can = radio.canControl;
    rOn.textContent = radio.on ? 'Desligar' : 'Ligar';
    rOn.classList.toggle('on', radio.on);
    rNext.disabled = !can || !radio.on;
    rList.disabled = !can;
    rInput.disabled = !can;
    (rForm.querySelector('button') as HTMLButtonElement).disabled = !can;
    const key = radio.list.map((t) => t.id + t.title).join();
    if (key !== listKey) {
      listKey = key;
      rList.innerHTML = radio.list.map((t, i) => `<option value="${i}">${escapeHtml(t.title)}</option>`).join('');
    }
    if (radio.current) rList.value = String(radio.list.findIndex((t) => t.id === radio.current!.id));
    rNote.textContent =
      radio.status ||
      (radio.mode === 'guest' ? 'Quem escolhe a música é o dono da sala. Você pode desligar só para você.' : radio.mode === 'host' ? 'Você é o dono: a sala toda ouve o que você escolher.' : '');
  };

  const toggle = (open: boolean) => {
    pop.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  };

  // Não rouba o foco do jogo (teclas de movimento continuam indo para a partida).
  for (const b of [btn, mute, rOn, rNext]) b.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => toggle(pop.classList.contains('hidden')));
  mute.addEventListener('click', () => audio.set({ muted: !audio.settings.muted }));
  for (const inp of inputs) {
    inp.addEventListener('input', () => audio.set({ [inp.dataset.bus as Bus]: Number(inp.value) / 100, muted: false }));
    // Solta o foco ao terminar de arrastar, para as setas/WASD voltarem para o jogo.
    inp.addEventListener('change', () => inp.blur());
  }
  rOn.addEventListener('click', () => radio.setOn(!radio.on));
  rNext.addEventListener('click', () => radio.next());
  rList.addEventListener('change', () => {
    radio.pick(Number(rList.value));
    rList.blur();
  });
  rForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (radio.playLink(rInput.value)) {
      rInput.value = '';
      rInput.blur();
    } else rNote.textContent = 'Esse link não é de um vídeo do YouTube.';
  });
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) toggle(false);
  });
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.code !== 'KeyM' || e.repeat || tag === 'INPUT' || tag === 'TEXTAREA') return;
    audio.set({ muted: !audio.settings.muted });
  });
  audio.onChange(render);
  radio.onChange(renderRadio);
  render();
  renderRadio();
}
