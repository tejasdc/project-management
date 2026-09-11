const items = [...document.querySelectorAll('[data-item]')];
const sources = [...document.querySelectorAll('[data-source]')];
const note = document.querySelector('.note');
const status = document.querySelector('#selection-status');
const colors = {
  task: ['var(--task)', 'color-mix(in srgb, var(--task) 13%, transparent)'],
  decision: ['var(--decision)', 'color-mix(in srgb, var(--decision) 13%, transparent)'],
  insight: ['var(--insight)', 'color-mix(in srgb, var(--insight) 13%, transparent)'],
};

for (const item of items) {
  item.addEventListener('click', () => {
    const type = item.dataset.item;
    for (const candidate of items) candidate.setAttribute('aria-pressed', String(candidate === item));
    for (const source of sources) source.classList.toggle('selected', source.dataset.source === type);
    note.style.setProperty('--selected', colors[type][0]);
    note.style.setProperty('--mark', colors[type][1]);
    const source = sources.find(candidate => candidate.dataset.source === type);
    status.textContent = `${item.querySelector('.type').textContent} source: ${source.textContent}`;
  });
}
