/**
 * SpriteForge - Help Documentation
 * Page switching, help doc rendering, and HTML export.
 */
(function (SF, $) {
  'use strict';

  var state = SF.state;

  /**
   * Switch between generator and help doc pages
   */
  SF.switchPage = function (page) {
    state.page = page;
    // Hide floating pages on every navigation
    $('#webfontPage').addClass('hidden');
    $('#webfontBtn').removeClass('active');
    $('#savedWebfontsPage').addClass('hidden');
    $('#savedWebfontsBtn').removeClass('active');

    if (page === 'helpdoc') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').removeClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('#helpDocBtn').addClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('Customise Icons');
      $('#pageBreadcrumb').text('Customise Icons');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.configureRightPanelForHelpDoc === 'function') {
        SF.configureRightPanelForHelpDoc();
      } else {
        $('#docRightPanel').removeClass('hidden');
        $('.main').addClass('has-right-panel');
      }
      SF.renderHelpDoc();
    } else if (page === 'iconlibrary') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').removeClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').addClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('Library');
      $('#pageBreadcrumb').text('Library');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.hideDocRightPanel === 'function') {
        SF.hideDocRightPanel();
      } else {
        $('#docRightPanel').addClass('hidden');
        $('.main').removeClass('has-right-panel');
      }
      SF.loadLibraryFolders();
    } else if (page === 'mostused') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').removeClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').addClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('Most Used Icons');
      $('#pageBreadcrumb').text('Analytics');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.hideDocRightPanel === 'function') {
        SF.hideDocRightPanel();
      } else {
        $('#docRightPanel').addClass('hidden');
        $('.main').removeClass('has-right-panel');
      }
      SF.renderMostUsedIcons();
    } else if (page === 'requesticon') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').removeClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').addClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('Request Icon');
      $('#pageBreadcrumb').text('Analytics');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.hideDocRightPanel === 'function') {
        SF.hideDocRightPanel();
      } else {
        $('#docRightPanel').addClass('hidden');
        $('.main').removeClass('has-right-panel');
      }
    } else if (page === 'savedsprites') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').removeClass('hidden');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').addClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('Saved Sprites');
      $('#pageBreadcrumb').text('Output');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.hideDocRightPanel === 'function') {
        SF.hideDocRightPanel();
      } else {
        $('#docRightPanel').addClass('hidden');
        $('.main').removeClass('has-right-panel');
      }
      SF.loadSavedFolders();
    } else if (page === 'webfont') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('#webfontPage').removeClass('hidden');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('#webfontBtn').addClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('SVG to WebFont');
      $('#pageBreadcrumb').text('Export');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.hideDocRightPanel === 'function') {
        SF.hideDocRightPanel();
      } else {
        $('#docRightPanel').addClass('hidden');
        $('.main').removeClass('has-right-panel');
      }
    } else if (page === 'savedwebfonts') {
      $('.content').first().addClass('hidden');
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('#savedWebfontsPage').removeClass('hidden');
      $('#savedWebfontsBtn').addClass('active');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('.sidebar-link[data-mode]').removeClass('active');
      $('#pageTitle').text('Saved WebFonts');
      $('#pageBreadcrumb').text('Output');
      $('#generateBtn').addClass('hidden');
      if (typeof SF.hideDocRightPanel === 'function') {
        SF.hideDocRightPanel();
      } else {
        $('#docRightPanel').addClass('hidden');
        $('.main').removeClass('has-right-panel');
      }
      if (typeof SF.loadSavedWebFonts === 'function') SF.loadSavedWebFonts();
    } else {
      $('#helpDocPage').addClass('hidden');
      $('#iconLibraryPage').addClass('hidden');
      $('#mostUsedPage').addClass('hidden');
      $('#requestIconPage').addClass('hidden');
      $('#savedSpritesPage').addClass('hidden');
      $('.content').first().removeClass('hidden');
      $('#helpDocBtn').removeClass('active');
      $('#iconLibraryBtn').removeClass('active');
      $('#mostUsedBtn').removeClass('active');
      $('#requestIconNavBtn').removeClass('active');
      $('#savedSpritesBtn').removeClass('active');
      $('#generateBtn').removeClass('hidden');
      if (typeof SF.configureRightPanelForGenerator === 'function') {
        SF.configureRightPanelForGenerator();
      } else {
        $('#docRightPanel').removeClass('hidden');
        $('.main').addClass('has-right-panel');
      }
      if (state.mode === 'existing') {
        $('.sidebar-link[data-mode="existing"]').addClass('active');
        $('#pageTitle').text('Update Existing Sprite');
        $('#pageBreadcrumb').text('Update Sprite');
      } else {
        $('.sidebar-link[data-mode="new"]').addClass('active');
        $('#pageTitle').text('Create Sprite');
        $('#pageBreadcrumb').text('Create Sprite');
      }
    }
    $('#sidebar').removeClass('open');
  };

  /**
   * Render the help doc icon grid
   */
  SF.renderHelpDoc = function () {
    var $grid = $('#docGrid');
    $grid.empty();

    var icons = state.icons;
    var search = state.doc.search;
    if (search) {
      icons = icons.filter(function (icon) {
        return icon.name.toLowerCase().indexOf(search) !== -1 ||
               icon.symbolId.toLowerCase().indexOf(search) !== -1;
      });
    }

    $('#docIconCount').text(icons.length);

    if (icons.length === 0) {
      $grid.html(
        '<div class="doc-empty">' +
          '<div class="empty-state-icon">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"  stroke-width="2">' +
              '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
              '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
            '</svg>' +
          '</div>' +
          '<span>' + (search ? 'No icons match your search' : 'No icons generated yet') + '</span>' +
          '<span style="color:var(--text-tertiary)">' + (search ? 'Try a different search term' : 'Generate a sprite first, then view docs') + '</span>' +
        '</div>'
      );
      return;
    }

    var size = state.doc.scale;
    var bgStyle = '';
    if (state.doc.bg === 'transparent') {
      bgStyle = 'background:repeating-conic-gradient(var(--bg-hover) 0% 25%,var(--bg-panel) 0% 50%) 50%/12px 12px';
    } else {
      bgStyle = 'background:' + state.doc.bg;
    }

    icons.forEach(function (icon, filteredIdx) {
      // Find the real index in state.icons for selection
      var realIdx = state.icons.indexOf(icon);
      var colorMode = state.doc.colorMode;
      var singleColor = state.doc.singleColor;
      var multiFill = state.doc.multiFill;
      var multiStroke = state.doc.multiStroke;

      var previewAttrs = '';
      var previewContent = icon.svgContent;
      if (state.doc.colorScope === 'all' && colorMode === 'single') {
        if (icon.colorMode === 'stroke') {
          previewAttrs += ' fill="none"';
          previewContent = SF.replaceAllInlineColors(previewContent, 'stroke', singleColor);
          previewContent = SF.injectAttrToShapes(previewContent, 'stroke', singleColor);
        } else {
          previewContent = SF.replaceAllInlineColors(previewContent, 'fill', singleColor);
          previewContent = SF.injectAttrToShapes(previewContent, 'fill', singleColor);
        }
      } else if (state.doc.colorScope === 'all' && colorMode === 'multi') {
        previewContent = SF.replaceAllInlineColors(previewContent, 'fill', multiFill);
        previewContent = SF.injectAttrToShapes(previewContent, 'fill', multiFill);
        previewContent = SF.replaceAllInlineColors(previewContent, 'stroke', multiStroke);
        previewContent = SF.injectAttrToShapes(previewContent, 'stroke', multiStroke);
      } else {
        previewAttrs = SF.buildPreviewAttrs(icon);
      }

      var previewDefs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
      var previewStyle = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';

      var previewSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
        '" width="' + size + '" height="' + size + '"' + previewAttrs + '>' +
        previewDefs + previewStyle + previewContent + '</svg>';

      var useTag = SF.buildUsageTag(icon);
      var useTagEsc = SF.escapeAttr(useTag);

      var cssClass = icon.symbolId;
      var isSelected = (state.doc.colorScope === 'selected' && state.doc.selectedIconIndex === realIdx);

      var card =
        '<div class="doc-card' + (isSelected ? ' doc-card-selected' : '') + '" data-doc-index="' + realIdx + '">' +
          '<div class="doc-card-preview" style="' + bgStyle + ';width:' + (size + 24) + 'px;height:' + (size + 24) + 'px">' +
            previewSvg +
          '</div>' +
          '<div class="doc-card-body">' +
            '<div class="doc-card-name">' + SF.escapeAttr(icon.name) + '</div>' +
            '<div class="doc-card-dims">' + SF.formatDim(icon.width) + ' &times; ' + SF.formatDim(icon.height) + '</div>' +
            '<div class="doc-card-tag">' +
              '<code>' + useTagEsc + '</code>' +
              '<button class="doc-card-copy" data-tag="' + SF.escapeAttr(useTag) + '" title="Copy tag">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none"  stroke-width="2"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="doc-card-class">.' + SF.escapeAttr(cssClass) + '</div>' +
          '</div>' +
        '</div>';

      $grid.append(card);
    });

    // Refresh selected-icon panel if in selected scope
    if (state.doc.colorScope === 'selected') {
      SF.updateSelectedIconPanel();
    }
  };

  /**
   * Generate a standalone HTML file for icon documentation
   */
  SF.generateHelpDocHTML = function () {
    var lines = [];
    lines.push('<!DOCTYPE html>');
    lines.push('<html lang="en">');
    lines.push('<head>');
    lines.push('<meta charset="UTF-8">');
    lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    lines.push('<title>Icon Reference — SpriteForge</title>');
    lines.push('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">');
    lines.push('<style>');
    lines.push('*{box-sizing:border-box;margin:0;padding:0}');
    lines.push('body{font-family:Inter,-apple-system,sans-serif;background:#f5f7fa;color:#1a1d21;padding:32px}');
    lines.push('h1{font-size:24px;font-weight:700;margin-bottom:8px}');
    lines.push('.subtitle{color:#5f6368;font-size:14px;margin-bottom:32px}');
    lines.push('.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}');
    lines.push('.card{background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;transition:box-shadow .15s}');
    lines.push('.card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1)}');
    lines.push('.card-preview{display:flex;align-items:center;justify-content:center;padding:24px;background:repeating-conic-gradient(#f5f5f5 0% 25%,#fff 0% 50%) 50%/12px 12px;border-bottom:1px solid #e0e0e0;min-height:96px}');
    lines.push('.card-body{padding:12px 14px}');
    lines.push('.card-name{font-size:13px;font-weight:600;margin-bottom:2px}');
    lines.push('.card-dims{font-size:11px;color:#9aa0a6;margin-bottom:6px}');
    lines.push('.card-tag{background:#f5f7fa;border:1px solid #e0e0e0;border-radius:4px;padding:6px 8px;font-size:11px;font-family:monospace;word-break:break-all;color:#333;margin-bottom:4px}');
    lines.push('.card-class{font-size:11px;font-family:monospace;color:#1B73E8}');
    lines.push('</style>');
    lines.push('</head>');
    lines.push('<body>');
    lines.push('<h1>Icon Reference</h1>');
    lines.push('<p class="subtitle">Generated by SpriteForge &middot; ' + state.icons.length + ' icons</p>');
    lines.push('<div class="grid">');

    state.icons.forEach(function (icon) {
      var previewAttrs = SF.buildPreviewAttrs(icon);
      var previewDefs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
      var previewStyle = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';
      var previewSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
        '" width="48" height="48"' + previewAttrs + '>' + previewDefs + previewStyle + icon.svgContent + '</svg>';

      var useTag = SF.buildUsageTag(icon);

      lines.push('<div class="card">');
      lines.push('<div class="card-preview">' + previewSvg + '</div>');
      lines.push('<div class="card-body">');
      lines.push('<div class="card-name">' + SF.escapeAttr(icon.name) + '</div>');
      lines.push('<div class="card-dims">' + SF.formatDim(icon.width) + ' &times; ' + SF.formatDim(icon.height) + '</div>');
      lines.push('<div class="card-tag">' + SF.escapeAttr(useTag) + '</div>');
      lines.push('<div class="card-class">.' + SF.escapeAttr(icon.symbolId) + '</div>');
      lines.push('</div></div>');
    });

    lines.push('</div>');
    lines.push('</body></html>');
    return lines.join('\n');
  };

})(window.SpriteForge, jQuery);
