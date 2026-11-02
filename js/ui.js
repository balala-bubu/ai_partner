// 圖示（線條風格，currentColor）與原創小角色「豆豆」
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICON = {
  sun: svg('<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  tray: svg('<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>'),
  check: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="m8 12.5 3 3 5-6"/>'),
  book: svg('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9 8h6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="3.2"'),
  tick: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="3.4"'),
  user: svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>', 'style="width:20px;height:20px;flex:none;opacity:.6"'),
};

// 豆豆：圓滾滾的小豆子。mood: happy / sleep / worry
export function mascot(mood = 'happy', bob = false) {
  const eyes = {
    happy: '<g class="blink"><ellipse cx="38" cy="43" rx="3.6" ry="4.6" fill="var(--ink)"/><ellipse cx="58" cy="43" rx="3.6" ry="4.6" fill="var(--ink)"/></g>',
    sleep: '<path d="M33 44q5 4 10 0M53 44q5 4 10 0" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>',
    worry: '<g class="blink"><ellipse cx="38" cy="44" rx="3.4" ry="4.2" fill="var(--ink)"/><ellipse cx="58" cy="44" rx="3.4" ry="4.2" fill="var(--ink)"/></g><path d="M32 35l9 3M64 35l-9 3" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round"/>',
  }[mood];
  const mouth = {
    happy: '<path d="M43 53q5 5 10 0" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>',
    sleep: '<ellipse cx="48" cy="55" rx="3" ry="2.4" fill="var(--ink)"/><text x="68" y="26" font-size="13" font-weight="900" fill="var(--primary)" font-family="Nunito">z</text><text x="76" y="16" font-size="10" font-weight="900" fill="var(--primary)" font-family="Nunito">z</text>',
    worry: '<path d="M43 56q5 -4 10 0" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>',
  }[mood];
  return `<svg class="mascot ${bob ? 'bob' : ''}" viewBox="0 0 96 96" aria-hidden="true">
    <ellipse cx="48" cy="86" rx="24" ry="4" fill="var(--line)"/>
    <path d="M48 12c19 0 30 15 30 34 0 21-13 34-30 34S18 67 18 46c0-19 11-34 30-34z" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="3"/>
    <path d="M47 12c-1-5 2-8 7-9-1 4-3 7-7 9z" fill="var(--idea)"/>
    <ellipse cx="31" cy="53" rx="5" ry="3" fill="var(--life)" opacity=".45"/>
    <ellipse cx="65" cy="53" rx="5" ry="3" fill="var(--life)" opacity=".45"/>
    ${eyes}${mouth}
  </svg>`;
}
