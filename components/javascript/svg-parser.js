/**
 * SpriteForge - SVG Parsing
 * Functions for parsing SVG files, existing sprites, and CSS files.
 */
(function (SF) {
  'use strict';

  var state = SF.state;

  /**
   * Parse a single SVG file into an icon object
   * @param {string} content - SVG file content
   * @param {string} fileName - Original filename
   * @returns {Object|null} Icon object or null if invalid
   */
  SF.parseSVGFile = function (content, fileName) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(content, 'image/svg+xml');

    var parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('SVG parse error for', fileName, parseError.textContent);
      return null;
    }

    var svgEl = doc.querySelector('svg');
    if (!svgEl) return null;

    // Extract viewBox or fall back to width/height (round to integers)
    var vx = 0, vy = 0, vw = 24, vh = 24;
    var viewBox = svgEl.getAttribute('viewBox');

    if (viewBox) {
      var parts = viewBox.trim().split(/[\s,]+/).map(Number);
      vx = isNaN(parts[0]) ? 0 : Math.round(parts[0]);
      vy = isNaN(parts[1]) ? 0 : Math.round(parts[1]);
      vw = isNaN(parts[2]) ? 24 : Math.ceil(parts[2]);
      vh = isNaN(parts[3]) ? 24 : Math.ceil(parts[3]);
    } else {
      var w = svgEl.getAttribute('width');
      var h = svgEl.getAttribute('height');
      if (w) vw = Math.ceil(parseFloat(w)) || 24;
      if (h) vh = Math.ceil(parseFloat(h)) || 24;
    }

    // Extract inner visual content, defs, styles, and root fill/stroke
    var serializer = new XMLSerializer();
    var innerContent = '';
    var defsContent = '';
    var styleContent = '';
    var skipTags = new Set(['title', 'desc', 'metadata']);

    for (var ci = 0; ci < svgEl.childNodes.length; ci++) {
      var child = svgEl.childNodes[ci];
      if (child.nodeType === Node.ELEMENT_NODE) {
        var tagLower = child.tagName.toLowerCase();
        if (skipTags.has(tagLower)) continue;
        if (tagLower === 'defs') {
          for (var d = 0; d < child.childNodes.length; d++) {
            var dc = child.childNodes[d];
            if (dc.nodeType === Node.ELEMENT_NODE) {
              defsContent += serializer.serializeToString(dc);
            }
          }
          continue;
        }
        if (tagLower === 'style') {
          styleContent += child.textContent || '';
          continue;
        }
        innerContent += serializer.serializeToString(child);
      } else if (child.nodeType === Node.TEXT_NODE) {
        if (!child.textContent.trim()) continue;
        innerContent += child.textContent;
      }
    }

    innerContent = SF.cleanSvgContent(innerContent);
    defsContent = SF.cleanSvgContent(defsContent);

    if (!innerContent.trim()) {
      console.warn('No visual content found in', fileName);
      return null;
    }

    // Detect the icon's coloring mode from root <svg> attributes
    var rootFill = svgEl.getAttribute('fill');
    var rootStroke = svgEl.getAttribute('stroke');
    var rootStyle = svgEl.getAttribute('style') || '';

    if (!rootFill) {
      var fillMatch = rootStyle.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/);
      if (fillMatch) rootFill = fillMatch[1].trim();
    }
    if (!rootStroke) {
      var strokeMatch = rootStyle.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/);
      if (strokeMatch) rootStroke = strokeMatch[1].trim();
    }

    var colorMode = SF.detectColorMode(svgEl, innerContent, rootFill, rootStroke);

    // For stroke-mode icons whose root has fill="none", push fill="none"
    // down into child elements that don't already declare their own fill.
    if (colorMode === 'stroke' && rootFill && rootFill.toLowerCase() === 'none') {
      innerContent = SF.pushFillNoneToChildren(innerContent);
    }

    var baseName = SF.cleanFileName(fileName);

    // rootFill/rootStroke only come from the root <svg> element.
    // Inline colors on child paths are handled by replaceAllInlineColors.
    var finalFill = rootFill || null;
    var finalStroke = rootStroke || null;
    // For fill="none" on root (stroke icons), don't store it as a fill color
    if (finalFill && finalFill.toLowerCase() === 'none') finalFill = null;

    return {
      id: SF.generateId(),
      name: baseName,
      gId: SF.makeGId(baseName),
      defsContent: defsContent,
      styleContent: styleContent,
      colorMode: colorMode,
      rootFill: finalFill,
      rootStroke: finalStroke,
      originalRootFill: finalFill,
      originalRootStroke: finalStroke,
      originalColorMode: colorMode,
      symbolId: SF.makeSymbolId(baseName),
      svgContent: innerContent,
      originX: vx,
      originY: vy,
      width: vw,
      height: vh,
      isExisting: false,
      isNewlyParsed: true
    };
  };

  /**
   * Parse an existing SVG sprite file and extract all icons
   * @param {string} content - SVG sprite file content
   * @returns {Array} Array of icon objects
   */
  SF.parseExistingSprite = function (content) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(content, 'image/svg+xml');
    var svgEl = doc.querySelector('svg');

    if (!svgEl) return [];

    // Capture the original sprite dimensions to preserve them when adding new icons
    var spriteWidth = parseFloat(svgEl.getAttribute('width')) || 0;
    var spriteHeight = parseFloat(svgEl.getAttribute('height')) || 0;
    var svgViewBox = svgEl.getAttribute('viewBox');
    if (svgViewBox) {
      var svgVbParts = svgViewBox.trim().split(/[\s,]+/).map(Number);
      if (!spriteWidth) spriteWidth = svgVbParts[2] || 0;
      if (!spriteHeight) spriteHeight = svgVbParts[3] || 0;
    }
    state.originalSpriteWidth = spriteWidth;
    state.originalSpriteHeight = spriteHeight;

    var icons = [];
    var symbols = svgEl.querySelectorAll('symbol');
    var serializer = new XMLSerializer();

    // Capture sprite-level defs and style content
    var spriteDefs = '';
    var spriteStyles = '';
    var defsEls = svgEl.querySelectorAll(':scope > defs');
    defsEls.forEach(function (defsEl) {
      for (var d = 0; d < defsEl.childNodes.length; d++) {
        var dc = defsEl.childNodes[d];
        if (dc.nodeType === Node.ELEMENT_NODE) {
          spriteDefs += SF.cleanSvgContent(serializer.serializeToString(dc));
        }
      }
    });
    var styleEls = svgEl.querySelectorAll(':scope > style');
    styleEls.forEach(function (styleEl) {
      spriteStyles += (styleEl.textContent || '');
    });

    var spriteRootFill = svgEl.getAttribute('fill');
    var spriteRootStroke = svgEl.getAttribute('stroke');

    var spriteDefsAssigned = false;
    var spriteStylesAssigned = false;

    var skipTags = new Set(['title', 'desc', 'metadata']);

    symbols.forEach(function (symbol) {
      var symbolId = symbol.getAttribute('id');
      var viewBox = symbol.getAttribute('viewBox');
      if (!viewBox || !symbolId) return;

      var gTx = 0, gTy = 0;
      var gFill = spriteRootFill;
      var gStroke = spriteRootStroke;
      var innerContent = '';
      var gId = '';

      // --- Format A: SpriteForge format (<symbol> → <use href="#gId"> → <g>) ---
      var useEl = symbol.querySelector('use');
      var href = useEl
        ? (useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '')
        : '';

      if (href) {
        gId = href.replace('#', '');
        var gEl = null;
        try {
          gEl = doc.getElementById(gId);
        } catch (e) {
          try {
            gEl = svgEl.querySelector('[id="' + gId.replace(/"/g, '\\"') + '"]');
          } catch (e2) { /* skip */ }
        }

        if (gEl) {
          var gTransform = gEl.getAttribute('transform') || '';
          var translateMatch = gTransform.match(/translate\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)/);
          if (translateMatch) {
            gTx = parseFloat(translateMatch[1]) || 0;
            gTy = parseFloat(translateMatch[2]) || 0;
          }
          gFill = gEl.getAttribute('fill') || spriteRootFill;
          gStroke = gEl.getAttribute('stroke') || spriteRootStroke;

          for (var ci = 0; ci < gEl.childNodes.length; ci++) {
            var child = gEl.childNodes[ci];
            if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
            if (child.nodeType === Node.COMMENT_NODE) continue;
            innerContent += serializer.serializeToString(child);
          }
        }
      }

      // --- Format B: Standard format (<symbol> contains SVG content directly) ---
      if (!innerContent.trim()) {
        gId = SF.makeGId(symbolId);
        for (var si = 0; si < symbol.childNodes.length; si++) {
          var sChild = symbol.childNodes[si];
          if (sChild.nodeType === Node.TEXT_NODE && !sChild.textContent.trim()) continue;
          if (sChild.nodeType === Node.COMMENT_NODE) continue;
          if (sChild.nodeType === Node.ELEMENT_NODE) {
            var tagLower = sChild.tagName.toLowerCase();
            if (tagLower === 'use') continue; // skip dead use refs
            if (skipTags.has(tagLower)) continue;
            if (tagLower === 'defs') {
              for (var d = 0; d < sChild.childNodes.length; d++) {
                var dc = sChild.childNodes[d];
                if (dc.nodeType === Node.ELEMENT_NODE) {
                  spriteDefs += SF.cleanSvgContent(serializer.serializeToString(dc));
                }
              }
              continue;
            }
            innerContent += serializer.serializeToString(sChild);
          }
        }
        gFill = symbol.getAttribute('fill') || spriteRootFill;
        gStroke = symbol.getAttribute('stroke') || spriteRootStroke;
      }

      innerContent = SF.cleanSvgContent(innerContent);
      if (!innerContent.trim()) return;

      var colorMode = SF.detectColorMode(
        symbol, innerContent, gFill, gStroke
      );

      // For stroke-mode icons, push fill="none" into children that lack it
      if (colorMode === 'stroke' && gFill && gFill.toLowerCase() === 'none') {
        innerContent = SF.pushFillNoneToChildren(innerContent);
      }

      var vbParts = viewBox.trim().split(/[\s,]+/).map(Number);
      var vx = isNaN(vbParts[0]) ? 0 : Math.round(vbParts[0]);
      var vy = isNaN(vbParts[1]) ? 0 : Math.round(vbParts[1]);
      var vw = isNaN(vbParts[2]) ? 24 : Math.ceil(vbParts[2]);
      var vh = isNaN(vbParts[3]) ? 24 : Math.ceil(vbParts[3]);

      var iconOriginX = Math.round(vx - gTx);
      var iconOriginY = Math.round(vy - gTy);

      var name = symbolId;
      var prefix = state.settings.prefix;
      var suffix = state.settings.symbolSuffix;

      if (name.indexOf(prefix) === 0) {
        name = name.substring(prefix.length);
      }
      if (name.length > suffix.length && name.substring(name.length - suffix.length) === suffix) {
        name = name.substring(0, name.length - suffix.length);
      }

      var eFill = (gFill && gFill.toLowerCase() !== 'none') ? gFill : null;
      var eStroke = gStroke || null;

      icons.push({
        id: SF.generateId(),
        name: name,
        gId: gId,
        symbolId: symbolId,
        svgContent: innerContent,
        defsContent: !spriteDefsAssigned ? spriteDefs : '',
        styleContent: !spriteStylesAssigned ? spriteStyles : '',
        colorMode: colorMode,
        rootFill: eFill,
        rootStroke: eStroke,
        originalRootFill: eFill,
        originalRootStroke: eStroke,
        originalColorMode: colorMode,
        originX: iconOriginX,
        originY: iconOriginY,
        originalSpriteX: vx,
        originalSpriteY: vy,
        width: vw,
        height: vh,
        isExisting: true,
        isNewlyParsed: false
      });
      spriteDefsAssigned = true;
      spriteStylesAssigned = true;
    });

    // --- Format C: <g>-based sprite (no <symbol> elements) ---
    // Common in designer exports: top-level <g> groups with id and transform
    if (icons.length === 0) {
      var gEls = svgEl.querySelectorAll(':scope > g[id]');
      gEls.forEach(function (gEl) {
        var gId = gEl.getAttribute('id');
        if (!gId) return;

        var gTransform = gEl.getAttribute('transform') || '';
        var gTx = 0, gTy = 0;
        var translateMatch = gTransform.match(/translate\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)/);
        if (translateMatch) {
          gTx = parseFloat(translateMatch[1]) || 0;
          gTy = parseFloat(translateMatch[2]) || 0;
        }

        var innerContent = '';
        for (var ci = 0; ci < gEl.childNodes.length; ci++) {
          var child = gEl.childNodes[ci];
          if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
          if (child.nodeType === Node.COMMENT_NODE) continue;
          if (child.nodeType === Node.ELEMENT_NODE) {
            if (skipTags.has(child.tagName.toLowerCase())) continue;
          }
          innerContent += serializer.serializeToString(child);
        }
        innerContent = SF.cleanSvgContent(innerContent);
        if (!innerContent.trim()) return;

        // Determine icon bounds from the group's bounding box or fallback
        var bbox = null;
        try { bbox = gEl.getBBox(); } catch (e) { /* JSDOM / static parse */ }

        var vw = 24, vh = 24;
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          vw = Math.ceil(bbox.width);
          vh = Math.ceil(bbox.height);
        }

        var gFill = gEl.getAttribute('fill') || spriteRootFill;
        var gStroke = gEl.getAttribute('stroke') || spriteRootStroke;
        var colorMode = SF.detectColorMode(gEl, innerContent, gFill, gStroke);

        if (colorMode === 'stroke' && gFill && gFill.toLowerCase() === 'none') {
          innerContent = SF.pushFillNoneToChildren(innerContent);
        }

        var name = gId;
        var prefix = state.settings.prefix;
        var suffix = state.settings.symbolSuffix;
        if (name.indexOf(prefix) === 0) name = name.substring(prefix.length);
        if (name.length > suffix.length && name.substring(name.length - suffix.length) === suffix) {
          name = name.substring(0, name.length - suffix.length);
        }

        var cFill = (gFill && gFill.toLowerCase() !== 'none') ? gFill : null;
        var cStroke = gStroke || null;

        icons.push({
          id: SF.generateId(),
          name: name,
          gId: gId,
          symbolId: SF.makeSymbolId(name),
          svgContent: innerContent,
          defsContent: !spriteDefsAssigned ? spriteDefs : '',
          styleContent: !spriteStylesAssigned ? spriteStyles : '',
          colorMode: colorMode,
          rootFill: cFill,
          rootStroke: cStroke,
          originalRootFill: cFill,
          originalRootStroke: cStroke,
          originalColorMode: colorMode,
          originX: 0,
          originY: 0,
          originalSpriteX: Math.round(gTx),
          originalSpriteY: Math.round(gTy),
          width: vw,
          height: vh,
          isExisting: true,
          isNewlyParsed: false
        });
        spriteDefsAssigned = true;
        spriteStylesAssigned = true;
      });
    }

    return icons;
  };

  /**
   * Parse an existing CSS file to extract icon dimensions
   * @param {string} content - CSS file content
   * @returns {Object} Map of className -> {width, height}
   */
  SF.parseExistingCSS = function (content) {
    var dims = {};
    var regex = /\.([^\s{]+)\s*\{([^}]*)\}/g;
    var match;

    while ((match = regex.exec(content)) !== null) {
      var className = match[1];
      var body = match[2];

      var widthMatch = body.match(/width:\s*([\d.]+)px/);
      var heightMatch = body.match(/height:\s*([\d.]+)px/);

      if (widthMatch || heightMatch) {
        dims[className] = {
          width: widthMatch ? parseFloat(widthMatch[1]) : null,
          height: heightMatch ? parseFloat(heightMatch[1]) : null
        };
      }
    }

    return dims;
  };

})(window.SpriteForge);
