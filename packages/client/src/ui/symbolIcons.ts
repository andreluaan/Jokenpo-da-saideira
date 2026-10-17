import type { Rps } from '@ppt/shared';

const INK = '#2b1d22';

/**
 * Ícones cartunescos dos símbolos (no lugar dos emojis de mão): uma pedra de verdade, uma folha de papel
 * e uma tesoura, com o mesmo contorno escuro dos personagens. Desenhados em SVG (viewBox 64×64).
 */
const PATHS: Record<Rps, string> = {
  rock: `
    <path d="M10 44 C8 34 14 24 24 21 C30 14 42 14 47 21 C56 23 59 33 55 42 C53 50 44 53 32 53 C20 53 12 51 10 44 Z" fill="#a39890"/>
    <path d="M11 44 C20 50 44 51 55 42 C53 50 44 53 32 53 C20 53 12 51 11 44 Z" fill="#7d726b"/>
    <ellipse cx="25" cy="29" rx="6.5" ry="3.6" transform="rotate(-22 25 29)" fill="#d6cdc5"/>
    <path d="M41 24 l-2 4 l3 3 l-2.5 4.5 l2 3" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 40 q4 2 8 1" fill="none" stroke="#5f554f" stroke-width="2" stroke-linecap="round"/>
    <path d="M10 44 C8 34 14 24 24 21 C30 14 42 14 47 21 C56 23 59 33 55 42 C53 50 44 53 32 53 C20 53 12 51 10 44 Z" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>`,
  paper: `
    <g transform="rotate(-8 32 32)">
      <path d="M16 8 H40 L50 18 V56 H16 Z" fill="#fff8ec" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
      <path d="M40 8 V18 H50 Z" fill="#e6d9c3" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M22 28 H44 M22 36 H44 M22 44 H37" stroke="#c2b39e" stroke-width="2.6" stroke-linecap="round"/>
    </g>`,
  scissors: `
    <path d="M24 41 L46 6 L50.5 9 L29.5 44 Z" fill="#e3e8ec" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M40 41 L18 6 L13.5 9 L34.5 44 Z" fill="#cfd7dd" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M44 11 L30 34" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
    <circle cx="19" cy="48" r="9" fill="#d8443c" stroke="${INK}" stroke-width="3.4"/>
    <circle cx="45" cy="48" r="9" fill="#d8443c" stroke="${INK}" stroke-width="3.4"/>
    <circle cx="19" cy="48" r="3.8" fill="#fff4e6" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="45" cy="48" r="3.8" fill="#fff4e6" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="32" cy="27" r="3.2" fill="${INK}"/>`,
};

/** Só o desenho (para pôr dentro de outro SVG, ex.: a barra do Jo-Ken-Pô). */
export function symbolPaths(s: Rps): string {
  return PATHS[s];
}

/** Ícone pronto para HTML. */
export function symbolSvg(s: Rps, cls = ''): string {
  return `<svg class="sym-ico ${cls}" viewBox="0 0 64 64" aria-hidden="true">${PATHS[s]}</svg>`;
}

/** Troca marcas `[rock]`, `[paper]`, `[scissors]` de um texto pelos ícones. */
export function withSymbolIcons(html: string): string {
  return html.replace(/\[(rock|paper|scissors)\]/g, (_, s: Rps) => symbolSvg(s));
}
