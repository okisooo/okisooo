const controls = document.querySelector('#controls');
const feedback = document.querySelector('#feedback');
let timer;
function params() {
  const values = Object.fromEntries(new FormData(controls));
  values.accent = values.accent.replace('#', '');
  values.v = '2';
  return new URLSearchParams(values);
}
function update() {
  const options = params();
  document.body.dataset.theme = options.get('theme');
  document.documentElement.style.setProperty('--accent', `#${options.get('accent')}`);
  for (const image of document.querySelectorAll('[data-card]')) {
    image.src = `/${image.dataset.card}.svg?${options}`;
    image.onerror = () => { feedback.textContent = 'one card could not load; try again in a moment'; };
  }
  document.querySelector('#download').href = `/readme.md?${options}`;
}
controls.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 250); });
controls.addEventListener('submit', event => event.preventDefault());
document.querySelector('#copy').addEventListener('click', async () => {
  try {
    const response = await fetch(`/readme.md?${params()}`);
    if (!response.ok) throw new Error('markdown unavailable');
    const markdown = await response.text();
    try { await navigator.clipboard.writeText(markdown); feedback.textContent = 'copied ♡ both light & dark versions are included'; }
    catch {
      document.querySelector('#markdown').value = markdown;
      document.querySelector('#markdown-dialog').showModal();
      document.querySelector('#markdown').select();
      feedback.textContent = 'your markdown is ready to copy';
    }
  } catch { feedback.textContent = 'could not prepare the markdown; try again in a moment'; }
});
update();
