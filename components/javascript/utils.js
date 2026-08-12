/**
 * SpriteForge - Utility Functions
 * Common helpers used across the application.
 */
(function (SF) {
  'use strict';

  var state = SF.state;

  /**
   * Build preview attributes for an icon's SVG element.
   * Shared logic for all icon preview rendering across the app.
   * @param {Object} icon
   * @returns {string} HTML attribute string
   */
  SF.buildPreviewAttrs = function (icon) {
    var attrs = '';
    var contentHasStroke = /<[^>]+\bstroke\s*=/i.test(icon.svgContent);
    if (icon.colorMode === 'fill' && icon.rootFill) {
      attrs += ' fill="' + SF.escapeAttr(icon.rootFill) + '"';
    } else if (icon.colorMode === 'stroke') {
      attrs += ' fill="none"';
      if (contentHasStroke) {
        // Icon content manages its own strokes — don't add root stroke
      } else {
        // Bare shapes with no inline stroke (e.g. built-in library icons)
        attrs += ' stroke="' + SF.escapeAttr(icon.rootStroke || 'currentColor') + '"';
        attrs += ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
      }
    }
    return attrs;
  };

  // ── Inline SVG Color Replacement ─────────────────────────

  /**
   * Replace a specific color value for fill or stroke attributes.
   * Handles both attribute format (fill="color") and inline style format (fill:color).
   * @param {string} svgContent
   * @param {'fill'|'stroke'} type
   * @param {string} oldColor - exact color to match (case-insensitive)
   * @param {string} newColor - replacement
   * @returns {string}
   */
  // Tags whose fill/stroke should never be modified by color replacement
  var SKIP_COLOR_TAGS = /^(rect|svg|g|image|use|clippath|mask|pattern)$/i;

  /**
   * Extract all <path> elements from SVG content with their fill and stroke values.
   * Returns an array of { index, d (path data preview), fill, stroke }.
   */
  SF.extractPathsFromContent = function (svgContent) {
    var paths = [];
    var re = /<path\b([^>]*)>/gi;
    var m;
    var idx = 0;
    while ((m = re.exec(svgContent)) !== null) {
      var attrs = m[1];
      var fill = null;
      var stroke = null;
      var d = '';
      var fm = attrs.match(/\bfill\s*=\s*"([^"]*)"/i);
      if (fm) fill = fm[1];
      var sm = attrs.match(/\bstroke\s*=\s*"([^"]*)"/i);
      if (sm) stroke = sm[1];
      var dm = attrs.match(/\bd\s*=\s*"([^"]*)"/i);
      if (dm) d = dm[1];
      paths.push({ index: idx, d: d.substring(0, 40), fill: fill, stroke: stroke });
      idx++;
    }
    return paths;
  };

  /**
   * Apply a fill or stroke color to a specific <path> element by its index.
   */
  SF.applyPathColor = function (pathIndex, type, color) {
    var idx = state.doc.selectedIconIndex;
    if (idx === null || !state.icons[idx]) return;
    var icon = state.icons[idx];

    if (!icon.originalSvgContent) {
      icon.originalSvgContent = icon.svgContent;
    }

    var pathCount = 0;
    icon.svgContent = icon.svgContent.replace(/<path\b([^>]*)>/gi, function (fullTag, attrs) {
      if (pathCount++ !== pathIndex) return fullTag;
      var attrRe = new RegExp('(\\b' + type + '\\s*=\\s*")([^"]*)(")', 'i');
      if (attrRe.test(attrs)) {
        return '<path' + attrs.replace(attrRe, '$1' + color + '$3') + '>';
      } else {
        return '<path ' + type + '="' + color + '"' + attrs + '>';
      }
    });

    SF.updateSelectedIconPanel();
    SF.renderIconList();
    SF.renderHelpDoc();
  };

  /**
   * Inject a fill or stroke attribute into shape elements that don't already have it.
   * Used when paths inherited color from the root <svg> and have no inline attribute.
   */
  SF.injectAttrToShapes = function (svgContent, type, color) {
    if (!color) return svgContent;
    var re = new RegExp('(\\b' + type + '\\s*=\\s*")', 'i');
    return svgContent.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, function (fullTag, tagName, attrs) {
      if (SKIP_COLOR_TAGS.test(tagName)) return fullTag;
      // If element already has this attribute, skip (replaceInlineColor would have handled it)
      if (re.test(attrs)) return fullTag;
      return '<' + tagName + ' ' + type + '="' + color + '"' + attrs + '>';
    });
  };

  /**
   * Replace a specific color value for fill or stroke attributes.
   * Skips <rect>, <svg> and other non-shape tags.
   */
  SF.replaceInlineColor = function (svgContent, type, oldColor, newColor) {
    if (!oldColor || !newColor) return svgContent;
    var escapedOld = oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Process tag by tag to skip excluded elements
    return svgContent.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, function (fullTag, tagName, attrs) {
      if (SKIP_COLOR_TAGS.test(tagName)) return fullTag;
      // Attribute format: fill="oldColor"
      var reAttr = new RegExp('(\\b' + type + '\\s*=\\s*")' + escapedOld + '(")', 'gi');
      var newAttrs = attrs.replace(reAttr, '$1' + newColor + '$2');
      // Style format within style="...":  fill:oldColor
      var reStyle = new RegExp('(' + type + '\\s*:\\s*)' + escapedOld + '(?=[;"\'\\s]|$)', 'gi');
      newAttrs = newAttrs.replace(reStyle, '$1' + newColor);
      return '<' + tagName + newAttrs + '>';
    });
  };

  /**
   * Replace ALL fill or stroke color values (except 'none', 'inherit',
   * 'currentColor', and url(...) references) with a single new color.
   * Skips <rect>, <svg> and other non-shape tags.
   */
  SF.replaceAllInlineColors = function (svgContent, type, newColor) {
    if (!newColor) return svgContent;
    return svgContent.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, function (fullTag, tagName, attrs) {
      if (SKIP_COLOR_TAGS.test(tagName)) return fullTag;
      // Attribute format: fill="<color>"
      var reAttr = new RegExp('(\\b' + type + '\\s*=\\s*")([^"]+)(")', 'gi');
      var newAttrs = attrs.replace(reAttr, function (m, pre, val, post) {
        var lv = val.trim().toLowerCase();
        if (lv === 'inherit' || lv === 'currentcolor' || lv.indexOf('url(') === 0) return m;
        return pre + newColor + post;
      });
      // Style format: fill:<color>
      var reStyle = new RegExp('(' + type + '\\s*:\\s*)([^;"]+)', 'gi');
      newAttrs = newAttrs.replace(reStyle, function (m, pre, val) {
        var lv = val.trim().toLowerCase();
        if (lv === 'inherit' || lv === 'currentcolor' || lv.indexOf('url(') === 0) return m;
        return pre + newColor;
      });
      return '<' + tagName + newAttrs + '>';
    });
  };

  /**
   * Rebuild an icon's svgContent from its originalSvgContent,
   * replacing only the specific original color values with the new ones.
   */
  SF.rebuildIconColors = function (icon) {
    if (!icon.originalSvgContent) return;

    var content = icon.originalSvgContent;

    // If original root color was set (from root <svg>), do targeted replacement
    // If original root color was detected from inline content, replace ALL inline colors
    if (icon.rootFill && icon.rootFill !== icon.originalRootFill) {
      if (icon.originalRootFill) {
        // Targeted: only replace the specific original color
        var updated = SF.replaceInlineColor(content, 'fill', icon.originalRootFill, icon.rootFill);
        if (updated === content) {
          // Paths inherited from root SVG — inject fill into shape elements
          content = SF.injectAttrToShapes(content, 'fill', icon.rootFill);
        } else {
          content = updated;
        }
      } else {
        // No original root fill — colors are inline. Replace all fill values.
        content = SF.replaceAllInlineColors(content, 'fill', icon.rootFill);
        content = SF.injectAttrToShapes(content, 'fill', icon.rootFill);
      }
    }
    if (icon.rootStroke && icon.rootStroke !== icon.originalRootStroke) {
      if (icon.originalRootStroke) {
        var updated = SF.replaceInlineColor(content, 'stroke', icon.originalRootStroke, icon.rootStroke);
        if (updated === content) {
          content = SF.injectAttrToShapes(content, 'stroke', icon.rootStroke);
        } else {
          content = updated;
        }
      } else {
        content = SF.replaceAllInlineColors(content, 'stroke', icon.rootStroke);
        content = SF.injectAttrToShapes(content, 'stroke', icon.rootStroke);
      }
    }

    icon.svgContent = content;
  };

  // ── Selected Icon Color Editing Helpers ─────────────────

  /**
   * Apply a fill or stroke color to the currently selected icon.
   * Modifies both root attributes and inline path colors.
   * @param {'fill'|'stroke'} type
   * @param {string} color - hex color
   */
  SF.applySelectedIconColor = function (type, color) {
    var idx = state.doc.selectedIconIndex;
    if (idx === null || !state.icons[idx]) return;
    var icon = state.icons[idx];

    // Snapshot original content on first edit
    if (!icon.originalSvgContent) {
      icon.originalSvgContent = icon.svgContent;
    }

    if (type === 'fill') {
      icon.rootFill = color;
      if (icon.colorMode === 'none') icon.colorMode = 'fill';
    } else {
      icon.rootStroke = color;
      if (icon.colorMode === 'none') icon.colorMode = 'stroke';
    }

    SF.rebuildIconColors(icon);
    SF.updateSelectedIconPanel();
    SF.renderIconList();
    SF.renderHelpDoc();
  };

  /**
   * Extract all unique fill or stroke color values from SVG content.
   * Skips <rect>, <svg> and other non-shape tags.
   * Returns array of color strings (deduplicated).
   */
  SF.extractColors = function (svgContent, type) {
    if (!svgContent) return [];
    var seen = {};
    var results = [];
    // Walk each opening tag, skip excluded elements
    var tagRe = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
    var tm;
    while ((tm = tagRe.exec(svgContent)) !== null) {
      var tagName = tm[1];
      var attrs = tm[2];
      if (SKIP_COLOR_TAGS.test(tagName)) continue;
      // Check attribute format
      var reAttr = new RegExp('\\b' + type + '\\s*=\\s*"([^"]+)"', 'gi');
      var am;
      while ((am = reAttr.exec(attrs)) !== null) {
        var val = am[1].trim();
        var lv = val.toLowerCase();
        if (lv !== 'none' && lv !== 'inherit' && lv !== 'currentcolor' && lv.indexOf('url(') !== 0 && !seen[lv]) {
          seen[lv] = true;
          results.push(val);
        }
      }
      // Check style format
      var reStyle = new RegExp(type + '\\s*:\\s*([^;"]+)', 'gi');
      var sm;
      while ((sm = reStyle.exec(attrs)) !== null) {
        var sval = sm[1].trim();
        var slv = sval.toLowerCase();
        if (slv !== 'none' && slv !== 'inherit' && slv !== 'currentcolor' && slv.indexOf('url(') !== 0 && !seen[slv]) {
          seen[slv] = true;
          results.push(sval);
        }
      }
    }
    return results;
  };

  /**
   * Update the selected-icon panel in the right sidebar with current icon data.
   */
  SF.updateSelectedIconPanel = function () {
    var idx = state.doc.selectedIconIndex;
    var $info = $('#docSelectedInfo');
    var $controls = $('#docSelectedControls');

    if (idx === null || !state.icons[idx]) {
      $info.html(
        '<div class="doc-selected-empty">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '<span>Click an icon in the grid to select it</span>' +
        '</div>'
      );
      $controls.addClass('hidden');
      return;
    }

    var icon = state.icons[idx];

    // Build preview - apply both fill and stroke when available
    var previewAttrs = '';
    if (icon.colorMode === 'stroke' && !icon.rootFill) {
      previewAttrs += ' fill="none"';
    }
    var defs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
    var style = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
      icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
      '" width="48" height="48"' + previewAttrs + '>' + defs + style + icon.svgContent + '</svg>';

    $info.empty();
    $('#docSelectedPreview').html(svg);
    $('#docSelectedName').text(icon.name);

    // Set fill color picker — use rootFill if set, otherwise detect from content
    var fillVal = icon.rootFill || (SF.extractColors(icon.svgContent, 'fill')[0]) || '#000000';
    $('#docIconFill').val(fillVal);
    $('#docIconFillHex').val(fillVal);

    // Set stroke color picker
    var strokeVal = icon.rootStroke || (SF.extractColors(icon.svgContent, 'stroke')[0]) || '#000000';
    $('#docIconStroke').val(strokeVal);
    $('#docIconStrokeHex').val(strokeVal);

    $controls.removeClass('hidden');

    // Build path list
    var paths = SF.extractPathsFromContent(icon.svgContent);
    var $pathList = $('#docPathList');
    if (paths.length > 0) {
      var html = '<div class="doc-control-label" style="margin-bottom:4px">Individual Paths (' + paths.length + ')</div>';
      paths.forEach(function (p, i) {
        var pathFill = p.fill || '';
        var pathStroke = p.stroke || '';
        var pathD = p.d || '(no d)';
        // Mini preview SVG of just this path
        var miniContent = icon.svgContent;
        html += '<div class="doc-path-item" data-path-index="' + i + '">' +
          '<div class="doc-path-header">' +
            '<span class="doc-path-label">Path ' + (i + 1) + '</span>' +
          '</div>' +
          '<div class="doc-path-colors">' +
            '<div class="doc-path-color-group">' +
              '<span class="doc-path-color-label">Fill</span>' +
              '<input type="color" class="doc-path-color-input doc-path-fill" value="' + SF.escapeAttr(pathFill && pathFill !== 'none' ? pathFill : '#000000') + '" data-path-index="' + i + '" data-color-type="fill">' +
              '<input type="text" class="doc-path-color-hex doc-path-fill-hex" value="' + SF.escapeAttr(pathFill || 'none') + '" data-path-index="' + i + '" data-color-type="fill" maxlength="7">' +
            '</div>' +
            '<div class="doc-path-color-group">' +
              '<span class="doc-path-color-label">Stroke</span>' +
              '<input type="color" class="doc-path-color-input doc-path-stroke" value="' + SF.escapeAttr(pathStroke && pathStroke !== 'none' ? pathStroke : '#000000') + '" data-path-index="' + i + '" data-color-type="stroke">' +
              '<input type="text" class="doc-path-color-hex doc-path-stroke-hex" value="' + SF.escapeAttr(pathStroke || 'none') + '" data-path-index="' + i + '" data-color-type="stroke" maxlength="7">' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      $pathList.html(html).removeClass('hidden');
    } else {
      $pathList.empty().addClass('hidden');
    }
  };

  /** Generate a unique ID for icons */
  SF.generateId = function () {
    return 'icon_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  };

  /** Clean a filename into a valid icon base name */
  SF.cleanFileName = function (name) {
    return name
      .replace(/\.svg$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
  };

  /** Generate the <g> element ID from base name */
  SF.makeGId = function (name) {
    return name + state.settings.gSuffix;
  };

  /** Generate the <symbol> / CSS class ID from base name */
  SF.makeSymbolId = function (name) {
    return state.settings.prefix + name + state.settings.symbolSuffix;
  };

  /** Escape HTML for safe insertion */
  SF.escapeAttr = function (str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  /** Format dimension numbers - integers stay clean, others get 2 decimal places */
  SF.formatDim = function (n) {
    if (Number.isInteger(n)) return n;
    var rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? rounded : rounded;
  };

  /**
   * Detect whether an SVG icon uses fill-based or stroke-based coloring.
   * Returns 'fill', 'stroke', or 'none' (no root color attributes).
   */
  SF.detectColorMode = function (svgEl, innerContent, rootFill, rootStroke) {
    var isFillNone = rootFill && rootFill.toLowerCase() === 'none';

    // If root explicitly sets fill="none", it's stroke-based
    if (isFillNone) {
      return 'stroke';
    }
    // If root has stroke but no fill (or fill is unset), check content
    if (rootStroke && !rootFill) {
      return 'stroke';
    }
    // If root has fill and no stroke, it's fill-based
    if (rootFill && !rootStroke) {
      return 'fill';
    }
    // If both are set, prefer the dominant one based on content analysis
    if (rootFill && rootStroke) {
      return 'fill';
    }
    // Neither set on root - check content for clues (skip rect/svg tags)
    var strippedContent = innerContent.replace(/<(rect|svg)\b[^>]*>/gi, '');
    var contentHasStroke = /stroke\s*[=:]/i.test(strippedContent);
    var contentHasFillNone = /fill\s*=\s*["']none["']/i.test(strippedContent);
    var contentHasFill = /fill\s*=\s*["'](?!none["'])[^"']+["']/i.test(strippedContent);
    if (contentHasFillNone && contentHasStroke) {
      return 'stroke';
    }
    if (contentHasStroke && !contentHasFill) {
      return 'stroke';
    }
    if (contentHasFill) {
      return 'fill';
    }
    return 'none';
  };

  /**
   * Build a product-specific usage tag for an icon.
   * @param {Object} icon - The icon object
   * @returns {string} The usage tag string
   */
  SF.buildUsageTag = function (icon) {
    var tc = state.tagConfig;
    var classValue = icon.symbolId + (tc.extraClass ? ' ' + tc.extraClass : '');
    return '<' + tc.tagName +
      ' ' + tc.nameAttr + '="' + icon.name + '"' +
      ' ' + tc.classAttr + '="' + classValue + '"' +
      '></' + tc.tagName + '>';
  };

  /**
   * For stroke-based icons, push fill="none" into child elements
   * that don't already declare their own fill attribute.
   * This avoids putting fill="none" on the parent <g> which would
   * override fills on all children — some paths may need a real fill.
   */
  SF.pushFillNoneToChildren = function (content) {
    // Match opening tags of visual SVG elements
    var visualTags = 'path|circle|ellipse|rect|line|polyline|polygon|text|use';
    var regex = new RegExp('(<(?:' + visualTags + ')\\b)([^>]*?)(\\/?>)', 'gi');

    return content.replace(regex, function (match, openTag, attrs, close) {
      // If the element already has a fill attribute, leave it alone
      if (/\bfill\s*=/i.test(attrs)) {
        return match;
      }
      // Otherwise inject fill="none"
      return openTag + ' fill="none"' + attrs + close;
    });
  };

  /** Remove redundant xmlns attributes and empty <g> tags from serialized SVG inner content */
  SF.cleanSvgContent = function (html) {
    var cleaned = html
      .replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')
      .replace(/ xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/g, '');

    // Remove empty <g> tags (with optional whitespace inside), repeatedly to handle nested empties
    var prev;
    do {
      prev = cleaned;
      cleaned = cleaned.replace(/<g[^>]*>\s*<\/g>/g, '');
    } while (cleaned !== prev);

    return cleaned;
  };

  // ── Icon Usage Tracking ─────────────────────────────────

  var USAGE_KEY = 'spriteforge_icon_usage';

  /** Get the usage map { iconName: count } from localStorage */
  SF.getIconUsage = function () {
    try {
      return JSON.parse(localStorage.getItem(USAGE_KEY)) || {};
    } catch (e) { return {}; }
  };

  /** Record usage for a list of icon names */
  SF.recordIconUsage = function (names) {
    var usage = SF.getIconUsage();
    names.forEach(function (name) {
      usage[name] = (usage[name] || 0) + 1;
    });
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch (e) {}
  };

  /** Get top N most used icons as [{name, count}] */
  SF.getTopUsedIcons = function (n) {
    var usage = SF.getIconUsage();
    return Object.keys(usage)
      .map(function (name) { return { name: name, count: usage[name] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, n || 10);
  };

  /** Clear all usage data */
  SF.clearIconUsage = function () {
    try { localStorage.removeItem(USAGE_KEY); } catch (e) {}
  };

  /** Render the most-used icons table on the dedicated page */
  SF.renderMostUsedIcons = function () {
    var $table = $('#mostUsedTable');
    if (!$table.length) return;
    var all = SF.getTopUsedIcons(50);
    $('#mostUsedTotal').text(all.length);
    if (all.length === 0) {
      $table.html('<div class="most-used-empty">No usage data yet. Generate a sprite to start tracking icons.</div>');
      return;
    }
    var maxCount = all[0].count;
    var html = '';
    all.forEach(function (item, i) {
      var pct = Math.round((item.count / maxCount) * 100);
      html += '<div class="most-used-row">' +
        '<span class="most-used-row-rank' + (i < 3 ? ' top-3' : '') + '">' + (i + 1) + '</span>' +
        '<span class="most-used-row-name" title="' + SF.escapeAttr(item.name) + '">' + SF.escapeAttr(item.name) + '</span>' +
        '<div class="most-used-row-bar-wrap"><div class="most-used-row-bar" style="width:' + pct + '%"></div></div>' +
        '<span class="most-used-row-count">' + item.count + '</span>' +
      '</div>';
    });
    $table.html(html);
  };

  // ── SVGO helpers ─────────────────────────────────────────

  /** Format bytes into human-readable string */
  SF.formatBytes = function (bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  };

  /** Toggle SVGO pass list visibility based on master toggle */
  SF.updateSvgoUI = function () {
    var enabled = $('#svgoEnabled').is(':checked');
    if (enabled) {
      $('#svgoPassList, #svgoPrecisionRow').removeClass('hidden');
    } else {
      $('#svgoPassList, #svgoPrecisionRow').addClass('hidden');
    }
  };

  // ── Duplicate Icon Detection (at generate time) ──────────

  /**
   * Find groups of icons that share the same name.
   * @returns {Object} map of name → array of icon indices, only groups with 2+
   */
  SF.findDuplicateGroups = function () {
    var groups = {};
    state.icons.forEach(function (icon, idx) {
      if (!groups[icon.name]) groups[icon.name] = [];
      groups[icon.name].push(idx);
    });
    var result = {};
    Object.keys(groups).forEach(function (name) {
      if (groups[name].length > 1) result[name] = groups[name];
    });
    return result;
  };

  // ── Visual Similarity Detection ──────────────────────────

  var FINGER_SIZE = 32; // render each icon on a 32×32 canvas

  /**
   * Render an icon to an offscreen canvas and return its pixel data.
   * Returns a Promise that resolves with { idx, data: Uint8ClampedArray }.
   */
  function renderIconFingerprint(icon, idx) {
    return new Promise(function (resolve) {
      var svgAttrs = '';
      if (icon.colorMode === 'fill' && icon.rootFill) {
        svgAttrs += ' fill="' + SF.escapeAttr(icon.rootFill) + '"';
      } else if (icon.colorMode === 'stroke' && icon.rootStroke) {
        svgAttrs += ' fill="none" stroke="' + SF.escapeAttr(icon.rootStroke) + '"';
      }
      var defs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
      var style = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';

      var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
        '" width="' + FINGER_SIZE + '" height="' + FINGER_SIZE + '"' +
        svgAttrs + '>' + defs + style + icon.svgContent + '</svg>';

      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = FINGER_SIZE;
        canvas.height = FINGER_SIZE;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, FINGER_SIZE, FINGER_SIZE);
        var pixels = ctx.getImageData(0, 0, FINGER_SIZE, FINGER_SIZE).data;
        URL.revokeObjectURL(url);
        resolve({ idx: idx, data: pixels });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve({ idx: idx, data: null });
      };
      img.src = url;
    });
  }

  /**
   * Compare two pixel arrays using normalised mean-absolute-error.
   * Returns a similarity score 0..1 (1 = identical).
   */
  function compareFingerprints(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    var totalDiff = 0;
    var len = a.length;
    for (var i = 0; i < len; i += 4) {
      // Compare alpha-weighted grayscale to be color-mode-neutral
      var aA = a[i + 3] / 255;
      var bA = b[i + 3] / 255;
      var aG = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) * aA;
      var bG = (b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114) * bA;
      totalDiff += Math.abs(aG - bG);
    }
    var pixelCount = len / 4;
    var meanDiff = totalDiff / pixelCount / 255;
    return 1 - meanDiff;
  }

  /**
   * Find visually similar icon groups.
   * @param {number} threshold - similarity threshold (0..1), default 0.92
   * @returns {Promise<Object>} map of groupKey → array of icon indices
   */
  SF.findVisualDuplicates = function (threshold) {
    threshold = threshold || 0.92;
    var icons = state.icons;
    if (icons.length < 2) return Promise.resolve({});

    var promises = icons.map(function (icon, idx) {
      return renderIconFingerprint(icon, idx);
    });

    return Promise.all(promises).then(function (fingerprints) {
      // Union-Find to group similar icons
      var parent = [];
      for (var i = 0; i < fingerprints.length; i++) parent[i] = i;
      function find(x) {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      }
      function union(a, b) { parent[find(a)] = find(b); }

      for (var a = 0; a < fingerprints.length; a++) {
        if (!fingerprints[a].data) continue;
        for (var b = a + 1; b < fingerprints.length; b++) {
          if (!fingerprints[b].data) continue;
          // Skip if already in same group
          if (find(a) === find(b)) continue;
          var sim = compareFingerprints(fingerprints[a].data, fingerprints[b].data);
          if (sim >= threshold) {
            union(a, b);
          }
        }
      }

      // Collect groups
      var groups = {};
      for (var k = 0; k < fingerprints.length; k++) {
        var root = find(k);
        if (!groups[root]) groups[root] = [];
        groups[root].push(k);
      }

      // Only keep groups with 2+ members
      var result = {};
      Object.keys(groups).forEach(function (root) {
        if (groups[root].length > 1) {
          // Skip if ALL icons in this group share the same name
          // (those are already caught by name-based detection)
          var names = {};
          groups[root].forEach(function (idx) { names[icons[idx].name] = true; });
          if (Object.keys(names).length > 1) {
            // Use a descriptive key showing the icon names
            var label = groups[root].map(function (idx) { return icons[idx].name; })
              .filter(function (n, i, arr) { return arr.indexOf(n) === i; })
              .join(', ');
            result[label] = groups[root];
          }
        }
      });

      return result;
    });
  };

  /**
   * Find all duplicates: both by name and by visual similarity.
   * @returns {Promise<Object>} combined dupGroups map
   */
  SF.findAllDuplicates = function () {
    var nameGroups = SF.findDuplicateGroups();

    return SF.findVisualDuplicates().then(function (visualGroups) {
      // Merge visual groups, skipping index sets already fully covered by name groups
      var nameIndices = {};
      Object.keys(nameGroups).forEach(function (name) {
        nameGroups[name].forEach(function (idx) {
          if (!nameIndices[idx]) nameIndices[idx] = [];
          nameIndices[idx].push(name);
        });
      });

      Object.keys(visualGroups).forEach(function (label) {
        var indices = visualGroups[label];
        // Check if this exact set is already covered by a single name group
        var alreadyCovered = false;
        Object.keys(nameGroups).forEach(function (name) {
          var ng = nameGroups[name];
          if (ng.length === indices.length && indices.every(function (idx) { return ng.indexOf(idx) !== -1; })) {
            alreadyCovered = true;
          }
        });
        if (!alreadyCovered) {
          nameGroups['\x00visual\x00' + label] = indices;
        }
      });

      return nameGroups;
    });
  };

  /**
   * Show the duplicate resolution modal with icon groups, previews and checkboxes.
   * @param {Object} dupGroups - name → [indices]
   * @param {function} onResult - called with 'keepall' | 'selected'
   */
  SF.showDuplicateModal = function (dupGroups, onResult) {
    var $modal = $('#duplicateModal');
    var $groups = $('#dupGroups');

    var html = '';
    var names = Object.keys(dupGroups);
    names.forEach(function (name) {
      var indices = dupGroups[name];
      var isVisual = name.indexOf('\x00visual\x00') === 0;
      var groupTypeClass = isVisual ? 'dup-group-visual' : 'dup-group-name';
      var groupLabel = isVisual
        ? '<span class="dup-type-badge dup-type-visual">Visually Similar</span>'
        : '<span class="dup-type-badge dup-type-name">Same Name</span>';

      // For visual groups, show a short summary instead of all names
      var displayName;
      if (isVisual) {
        var uniqueNames = [];
        indices.forEach(function (idx) {
          var n = state.icons[idx].name;
          if (uniqueNames.indexOf(n) === -1) uniqueNames.push(n);
        });
        displayName = uniqueNames.length <= 3
          ? uniqueNames.join(', ')
          : uniqueNames.slice(0, 3).join(', ') + ' +' + (uniqueNames.length - 3) + ' more';
      } else {
        displayName = name;
      }

      html += '<div class="dup-group ' + groupTypeClass + '">';
      html += '<div class="dup-group-header">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          (isVisual
            ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
            : '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>') +
        '</svg>' +
        '<span class="dup-header-name">' + SF.escapeAttr(displayName) + '</span>' +
        ' <span class="dup-count">(' + indices.length + ' icons)</span>' +
        groupLabel +
      '</div>';

      html += '<div class="dup-group-items">';
      indices.forEach(function (idx) {
        var icon = state.icons[idx];

        // Build inline SVG preview
        var previewAttrs = SF.buildPreviewAttrs(icon);
        var defs = icon.defsContent ? '<defs>' + icon.defsContent + '</defs>' : '';
        var style = icon.styleContent ? '<style>' + icon.styleContent + '</style>' : '';
        var preview = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
          icon.originX + ' ' + icon.originY + ' ' + icon.width + ' ' + icon.height +
          '"' + previewAttrs + '>' + defs + style + icon.svgContent + '</svg>';

        var badgeClass = icon.isExisting ? 'badge-existing' : 'badge-new';
        var badgeText = icon.isExisting ? 'EXISTING' : 'NEW';

        html += '<label class="dup-group-item" data-dup-idx="' + idx + '">' +
          '<input type="checkbox" class="dup-check" data-dup-idx="' + idx + '" checked>' +
          '<div class="dup-icon-preview">' + preview + '</div>' +
          '<div class="dup-icon-info">' +
            '<div class="dup-icon-name">' + SF.escapeAttr(icon.name) + '</div>' +
            '<div class="dup-icon-meta">' + SF.formatDim(icon.width) + ' &times; ' + SF.formatDim(icon.height) + 'px</div>' +
          '</div>' +
          '<span class="dup-icon-badge ' + badgeClass + '">' + badgeText + '</span>' +
        '</label>';
      });
      html += '</div></div>';
    });

    $groups.html(html);
    $modal.data('onResult', onResult);
    $modal.data('dupGroups', dupGroups);
    $modal.removeClass('hidden');
  };

  /**
   * Get the list of icon indices that the user UN-checked in the duplicate modal.
   * @returns {number[]} indices to remove
   */
  SF.getDupUncheckedIndices = function () {
    var unchecked = [];
    $('#dupGroups .dup-check').each(function () {
      if (!$(this).is(':checked')) {
        unchecked.push(parseInt($(this).attr('data-dup-idx'), 10));
      }
    });
    return unchecked;
  };

})(window.SpriteForge);
