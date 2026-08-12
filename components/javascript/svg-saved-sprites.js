/**
 * SpriteForge - Saved Sprites Web Component
 * Loads the saved sprites page template.
 */
(function () {
  'use strict';

  class SvgSavedSprites extends HTMLElement {
    connectedCallback() {
      fetch('components/templates/svg-saved-sprites.html')
        .then(function (r) { return r.text(); })
        .then(function (html) {
          this.innerHTML = html;
        }.bind(this));
    }
  }
  customElements.define('svg-saved-sprites', SvgSavedSprites);
})();
