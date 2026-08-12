/**
 * SpriteForge - Clipboard Utilities
 * Copy to clipboard with fallback support.
 */
(function (SF, $) {
  'use strict';

  /**
   * Show a toast notification
   */
  SF.showToast = function (message) {
    var $toast = $('#toast');
    var $msg = $('#toastMsg');
    $msg.text(message || 'Copied to clipboard!');
    $toast.addClass('toast--visible');
    clearTimeout(SF._toastTimer);
    SF._toastTimer = setTimeout(function () {
      $toast.removeClass('toast--visible');
    }, 2500);
  };

  /**
   * Copy text to clipboard and show feedback on the button
   */
  SF.copyToClipboard = function (text, $btn) {
    var originalHtml = $btn.html();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        $btn.html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
        SF.showToast('Copied to clipboard!');
        setTimeout(function () { $btn.html(originalHtml); }, 2000);
      }).catch(function () {
        SF.fallbackCopy(text, $btn, originalHtml);
      });
    } else {
      SF.fallbackCopy(text, $btn, originalHtml);
    }
  };

  /**
   * Fallback copy using textarea
   */
  SF.fallbackCopy = function (text, $btn, originalHtml) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      $btn.html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
      SF.showToast('Copied to clipboard!');
    } catch (e) {
      $btn.html('Failed');
      SF.showToast('Copy failed!');
    }

    document.body.removeChild(textarea);
    setTimeout(function () { $btn.html(originalHtml); }, 2000);
  };

})(window.SpriteForge, jQuery);
