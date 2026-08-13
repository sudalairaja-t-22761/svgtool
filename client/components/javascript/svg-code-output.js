(function () {
  const p = fetch('components/templates/svg-code-output.html?v=17').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgCodeOutput extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-code-output', SvgCodeOutput);
})();
