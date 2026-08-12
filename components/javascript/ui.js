/**
 * SpriteForge - UI Rendering
 * Icon list rendering, drag & drop, preview building.
 */
(function (SF, $) {
  'use strict';

  var state = SF.state;

  /**
   * Render the icon list with cards
   */
  SF.renderIconList = function () {
    var $list = $('#iconList');
    $list.empty();

    $('#iconCount').text(state.icons.length);

    if (state.icons.length === 0) {
      $list.html('<div class="empty-state">' +
        '<div class="empty-state-icon">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>' +
            '<rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' +
          '</svg>' +
        '</div>' +
        '<span>No icons added yet</span>' +
        '<span style="color:var(--text-tertiary)">Upload SVG files to get started</span>' +
      '</div>');
      return;
    }

    // Separate icons into new and existing
    var newIcons = [];
    var existingIcons = [];
    state.icons.forEach(function (icon, index) {
      var entry = { icon: icon, index: index };
      if (icon.isExisting) {
        existingIcons.push(entry);
      } else {
        newIcons.push(entry);
      }
    });

    var hasNew = newIcons.length > 0;
    var hasExisting = existingIcons.length > 0;
    var hasBoth = hasNew && hasExisting;

    function buildCard(icon, index) {
      var previewAttrs = SF.buildPreviewAttrs(icon);
      var previewDefs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
      var previewStyle = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';

      var previewSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
        '" width="40" height="40"' + previewAttrs + '>' + previewDefs + previewStyle + icon.svgContent + '</svg>';

      var badgeClass = icon.isExisting ? 'badge-existing' : 'badge-new';
      var badgeText = icon.isExisting ? 'EXISTING' : 'NEW';

      var useTagRaw = SF.buildUsageTag(icon);
      var useTag = SF.escapeAttr(useTagRaw);

      return '<div class="icon-card" data-index="' + index + '" draggable="true">' +
          '<div class="icon-card-drag" title="Drag to reorder">&#9776;</div>' +
          '<div class="icon-card-preview">' + previewSvg + '</div>' +
          '<div class="icon-card-info">' +
            '<input type="text" class="icon-name-input" value="' + SF.escapeAttr(icon.name) + '" data-index="' + index + '" spellcheck="false">' +
            '<div class="icon-meta">' +
              '<span class="icon-dims">' + SF.formatDim(icon.width) + ' &times; ' + SF.formatDim(icon.height) + 'px</span>' +
              '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
              '<div class="icon-ids">' +
                '<span class="icon-id-tag" title="G ID: ' + SF.escapeAttr(icon.gId) + '">g: ' + SF.escapeAttr(icon.gId) + '</span>' +
                '<span class="icon-id-tag" title="Symbol ID: ' + SF.escapeAttr(icon.symbolId) + '">sym: ' + SF.escapeAttr(icon.symbolId) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="icon-usage-tag">' +
              '<code>' + useTag + '</code>' +
              '<button class="icon-usage-copy" data-tag="' + SF.escapeAttr(useTagRaw) + '" title="Copy usage tag">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<button class="icon-card-delete" data-index="' + index + '" title="Remove icon">&times;</button>' +
        '</div>';
    }

    if (hasBoth) {
      // Two-column layout
      var html = '<div class="icon-list-columns">';

      html += '<div class="icon-list-column icon-list-column-new">' +
        '<div class="icon-column-header">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
          'New Icons <span class="icon-column-count">' + newIcons.length + '</span>' +
        '</div>' +
        '<div class="icon-column-list">';
      newIcons.forEach(function (entry) {
        html += buildCard(entry.icon, entry.index);
      });
      html += '</div></div>';

      html += '<div class="icon-list-column icon-list-column-existing">' +
        '<div class="icon-column-header">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
          'Existing Icons <span class="icon-column-count">' + existingIcons.length + '</span>' +
        '</div>' +
        '<div class="icon-column-list">';
      existingIcons.forEach(function (entry) {
        html += buildCard(entry.icon, entry.index);
      });
      html += '</div></div>';

      html += '</div>';
      $list.html(html);
    } else {
      // Single list (all new or all existing)
      var icons = hasNew ? newIcons : existingIcons;
      icons.forEach(function (entry) {
        $list.append(buildCard(entry.icon, entry.index));
      });
    }

    SF.setupDragAndDrop();
  };

  /**
   * Setup drag and drop for icon reordering
   */
  SF.setupDragAndDrop = function () {
    var $list = $('#iconList');

    $list.off('dragstart dragend dragover dragleave drop');

    $list.on('dragstart', '.icon-card', function (e) {
      SF.draggedIndex = parseInt($(this).attr('data-index'), 10);
      $(this).addClass('dragging');
      e.originalEvent.dataTransfer.effectAllowed = 'move';
      e.originalEvent.dataTransfer.setData('text/plain', String(SF.draggedIndex));
    });

    $list.on('dragend', '.icon-card', function () {
      $(this).removeClass('dragging');
      $('.icon-card').removeClass('drag-over');
      SF.draggedIndex = null;
    });

    $list.on('dragover', '.icon-card', function (e) {
      e.preventDefault();
      e.originalEvent.dataTransfer.dropEffect = 'move';
      $('.icon-card').removeClass('drag-over');
      $(this).addClass('drag-over');
    });

    $list.on('dragleave', '.icon-card', function () {
      $(this).removeClass('drag-over');
    });

    $list.on('drop', '.icon-card', function (e) {
      e.preventDefault();
      $(this).removeClass('drag-over');

      var dropIndex = parseInt($(this).attr('data-index'), 10);
      if (SF.draggedIndex === null || SF.draggedIndex === dropIndex) return;

      var moved = state.icons.splice(SF.draggedIndex, 1)[0];
      state.icons.splice(dropIndex, 0, moved);

      SF.draggedIndex = null;
      SF.renderIconList();
    });
  };

  /**
   * Update the naming preview in settings modal
   */
  SF.updateNamingPreview = function () {
    var prefix = $('#setPrefix').val() || '';
    var gSuffix = $('#setGSuffix').val() || '';
    var sSuffix = $('#setSSuffix').val() || '';

    $('#previewGId').text('iconName' + gSuffix);
    $('#previewSymId').text(prefix + 'iconname' + sSuffix);
  };

  /**
   * Update the tag format preview in settings modal
   */
  SF.updateTagPreview = function () {
    var tagName = $('#setTagName').val() || 'crmutil-icon';
    var nameAttr = $('#setNameAttr').val() || 'icon-name';
    var classAttr = $('#setClassAttr').val() || 'icon-class';
    var extraClass = $('#setExtraClass').val() || '';
    var prefix = $('#setPrefix').val() || '';
    var sSuffix = $('#setSSuffix').val() || '';
    var classValue = prefix + 'iconname' + sSuffix + (extraClass ? ' ' + extraClass : '');
    var preview = '&lt;' + SF.escapeAttr(tagName) +
      ' ' + SF.escapeAttr(nameAttr) + '="iconname"' +
      ' ' + SF.escapeAttr(classAttr) + '="' + SF.escapeAttr(classValue) + '"' +
      '&gt;&lt;/' + SF.escapeAttr(tagName) + '&gt;';
    $('#previewTag').html(preview);
  };

  /**
   * Build a visual preview of the sprite (showing icons with bounding boxes)
   * @param {{width: number, height: number}} dims
   * @returns {string} HTML string
   */
  SF.buildSpritePreview = function (dims) {
    var svgParts = [];
    svgParts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + dims.width + '" height="' + dims.height + '" viewBox="0 0 ' + dims.width + ' ' + dims.height + '">');  

    var previewDefs = '';
    var previewStyles = '';
    state.icons.forEach(function (icon) {
      if (icon.defsContent) previewDefs += icon.defsContent;
      if (icon.styleContent) previewStyles += icon.styleContent;
    });
    if (previewDefs) svgParts.push('<defs>' + previewDefs + '</defs>');
    if (previewStyles) svgParts.push('<style>' + previewStyles + '</style>');

    svgParts.push('<rect width="' + dims.width + '" height="' + dims.height + '" fill="white" stroke="#ddd" stroke-width="0.5"/>');

    state.icons.forEach(function (icon) {
      svgParts.push('<rect x="' + icon.spriteX + '" y="' + icon.spriteY + '" width="' + icon.width + '" height="' + icon.height + '" fill="none" stroke="#4A90D9" stroke-width="0.3" stroke-dasharray="1,1"/>');

      var tx = icon.spriteX - icon.originX;
      var ty = icon.spriteY - icon.originY;

      var gAttrs = '';
      if (!(Math.abs(tx) < 0.001 && Math.abs(ty) < 0.001)) {
        gAttrs += ' transform="translate(' + SF.formatDim(tx) + ',' + SF.formatDim(ty) + ')"';
      }
      gAttrs += SF.buildPreviewAttrs(icon);

      svgParts.push('<g' + gAttrs + '>' + icon.svgContent + '</g>');
      svgParts.push('<text x="' + (icon.spriteX + icon.width / 2) + '" y="' + (icon.spriteY + icon.height + 4) + '" text-anchor="middle" font-size="2.5" fill="#999">' + SF.escapeAttr(icon.name) + '</text>');
    });

    svgParts.push('</svg>');
    return svgParts.join('');
  };

})(window.SpriteForge, jQuery);
