export function notify(type, message) {
  const layer = document.querySelector('#toast');
  if (!layer) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  layer.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}
