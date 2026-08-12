"""
SpriteForge Dev Server
Serves static files + provides API endpoints to save/list/delete generated sprite folders.
"""

import http.server
import json
import os
import shutil
import re
import xml.etree.ElementTree as ET
import urllib.parse

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'saved-sprites')

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

SAFE_NAME = re.compile(r'^[a-zA-Z0-9_.\-]+$')


def _viewbox_size(view_box):
    try:
        parts = [float(p) for p in str(view_box).replace(',', ' ').split()]
        if len(parts) == 4:
            return parts[2], parts[3]
    except Exception:
        pass
    return 24, 24


def _is_background_rect(node, vb_w, vb_h):
    if node.tag.split('}')[-1].lower() != 'rect':
        return False

    def _num(v, default):
        try:
            return float(str(v).replace('px', '').strip())
        except Exception:
            return default

    x = _num(node.attrib.get('x', '0'), 0)
    y = _num(node.attrib.get('y', '0'), 0)
    w = _num(node.attrib.get('width', '0'), 0)
    h = _num(node.attrib.get('height', '0'), 0)
    fill = str(node.attrib.get('fill', '')).strip().lower()
    stroke = str(node.attrib.get('stroke', '')).strip().lower()

    white_fills = {'#fff', '#ffffff', 'white', 'rgb(255,255,255)', 'rgb(255, 255, 255)'}
    no_stroke = (stroke == '' or stroke == 'none')
    is_full_size = abs(x) < 0.01 and abs(y) < 0.01 and abs(w - vb_w) < 0.01 and abs(h - vb_h) < 0.01

    return is_full_size and fill in white_fills and no_stroke


def _prune_background_rects(node, vb_w, vb_h, in_defs=False):
    node_tag = node.tag.split('}')[-1].lower()
    next_in_defs = in_defs or node_tag in {'defs', 'clippath', 'mask', 'pattern'}

    for child in list(node):
        # Do not prune rects inside defs/clipPath/mask/pattern because they can
        # be structural references (e.g. clip rect), not visual backgrounds.
        if not next_in_defs and _is_background_rect(child, vb_w, vb_h):
            node.remove(child)
        else:
            _prune_background_rects(child, vb_w, vb_h, next_in_defs)


def _sanitize_preview_svg(svg_markup):
    try:
        root = ET.fromstring(svg_markup)
        vb = root.attrib.get('viewBox', '0 0 24 24')
        vb_w, vb_h = _viewbox_size(vb)

        _prune_background_rects(root, vb_w, vb_h)

        if not root.attrib.get('width'):
            root.attrib['width'] = str(vb_w)
        if not root.attrib.get('height'):
            root.attrib['height'] = str(vb_h)
        return ET.tostring(root, encoding='unicode')
    except Exception:
        return svg_markup


def _extract_preview_svg(svg_path):
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()

        root = ET.fromstring(content)
        tag = root.tag.split('}')[-1].lower()
        if tag != 'svg':
            return ''

        view_box = root.attrib.get('viewBox')
        if not view_box:
            width = root.attrib.get('width', '24')
            height = root.attrib.get('height', '24')
            view_box = f'0 0 {width} {height}'
        preview_width, preview_height = _viewbox_size(view_box)

        # If this is a sprite, prefer the first symbol and resolve its <use> target.
        first_symbol = None
        for child in root:
            child_tag = child.tag.split('}')[-1].lower()
            if child_tag == 'symbol':
                first_symbol = child
                break

        if first_symbol is not None:
            symbol_view_box = first_symbol.attrib.get('viewBox', view_box)
            symbol_width, symbol_height = _viewbox_size(symbol_view_box)
            defs_parts = []
            for child in root:
                child_tag = child.tag.split('}')[-1].lower()
                if child_tag == 'defs':
                    defs_parts.append(ET.tostring(child, encoding='unicode'))

            resolved_parts = []
            for node in list(first_symbol):
                node_tag = node.tag.split('}')[-1].lower()
                if node_tag == 'use':
                    href = node.attrib.get('href') or node.attrib.get('{http://www.w3.org/1999/xlink}href') or ''
                    if href.startswith('#'):
                        target_id = href[1:]
                        target = None
                        for candidate in root.iter():
                            if candidate.attrib.get('id') == target_id:
                                target = candidate
                                break
                        if target is not None:
                            resolved_parts.append(ET.tostring(target, encoding='unicode'))
                            continue
                resolved_parts.append(ET.tostring(node, encoding='unicode'))

            inner = ''.join(defs_parts + resolved_parts)
            preview = (
                f'<svg xmlns="http://www.w3.org/2000/svg" '
                f'viewBox="{symbol_view_box}" width="{symbol_width}" height="{symbol_height}">{inner}</svg>'
            )
            return _sanitize_preview_svg(preview)

        if not root.attrib.get('width'):
            root.attrib['width'] = str(preview_width)
        if not root.attrib.get('height'):
            root.attrib['height'] = str(preview_height)
        return _sanitize_preview_svg(ET.tostring(root, encoding='unicode'))
    except Exception:
        return ''


def _looks_like_sprite_svg(svg_path):
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()
        if '<symbol' in content.lower():
            return True

        root = ET.fromstring(content)
        for node in root.iter():
            if node.tag.split('}')[-1].lower() == 'symbol':
                return True
        return False
    except Exception:
        return False


class SpriteForgeHandler(http.server.SimpleHTTPRequestHandler):
    """Extends SimpleHTTPRequestHandler with JSON API endpoints."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _path_only(self):
        return urllib.parse.urlparse(self.path).path

    def do_POST(self):
        path = self._path_only()
        if path == '/api/save-folder':
            self._handle_save()
        else:
            self.send_error(404)

    def do_DELETE(self):
        path = self._path_only()
        if path.startswith('/api/delete-file/'):
            self._handle_delete_file()
        elif path.startswith('/api/delete-folder/'):
            self._handle_delete()
        else:
            self.send_error(404)

    def do_GET(self):
        path = self._path_only()
        if path == '/api/list-folders':
            self._handle_list()
        else:
            super().do_GET()

    # ---- API Handlers ----

    def _handle_save(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            self._json_response(400, {'error': 'Invalid JSON'})
            return

        folder_name = body.get('folderName', '').strip()
        svg_name = body.get('svgName', '').strip()
        css_name = body.get('cssName', '').strip()
        svg_content = body.get('svgContent', '')
        css_content = body.get('cssContent', '')

        if not folder_name or not SAFE_NAME.match(folder_name):
            self._json_response(400, {'error': 'Invalid folder name'})
            return
        if not svg_name or not SAFE_NAME.match(svg_name):
            self._json_response(400, {'error': 'Invalid SVG filename'})
            return
        if css_name and not SAFE_NAME.match(css_name):
            self._json_response(400, {'error': 'Invalid CSS filename'})
            return

        folder_path = os.path.join(OUTPUT_DIR, folder_name)
        os.makedirs(folder_path, exist_ok=True)

        files = []
        with open(os.path.join(folder_path, svg_name), 'w', encoding='utf-8') as f:
            f.write(svg_content)
        files.append(svg_name)

        if css_name:
            with open(os.path.join(folder_path, css_name), 'w', encoding='utf-8') as f:
                f.write(css_content)
            files.append(css_name)

        self._json_response(200, {
            'success': True,
            'folder': folder_name,
            'files': files
        })

    def _handle_list(self):
        folders = []
        if os.path.isdir(OUTPUT_DIR):
            for name in sorted(os.listdir(OUTPUT_DIR)):
                folder_path = os.path.join(OUTPUT_DIR, name)
                if os.path.isdir(folder_path):
                    files = sorted(os.listdir(folder_path))
                    file_details = []
                    preview_svg = ''
                    svg_count = 0
                    css_count = 0
                    for fname in files:
                        fpath = os.path.join(folder_path, fname)
                        if os.path.isfile(fpath):
                            if not preview_svg and fname.lower().endswith('.svg'):
                                preview_svg = _extract_preview_svg(fpath)
                            if fname.lower().endswith('.svg'):
                                svg_count += 1
                            elif fname.lower().endswith('.css') or fname.lower().endswith('.less'):
                                css_count += 1
                            file_details.append({
                                'name': fname,
                                'size': os.path.getsize(fpath)
                            })
                    has_only_svg_files = (len(file_details) > 0 and svg_count == len(file_details))
                    if css_count == 0 and has_only_svg_files:
                        first_svg_path = None
                        for detail in file_details:
                            name_lower = detail.get('name', '').lower()
                            if name_lower.endswith('.svg'):
                                first_svg_path = os.path.join(folder_path, detail['name'])
                                break
                        kind = 'sprite' if first_svg_path and _looks_like_sprite_svg(first_svg_path) else 'icon'
                    else:
                        kind = 'sprite'
                    folders.append({
                        'name': name,
                        'files': file_details,
                        'previewSvg': preview_svg,
                        'kind': kind
                    })
        self._json_response(200, {'folders': folders})

    def _handle_delete(self):
        path = self._path_only()
        folder_name = path.split('/api/delete-folder/', 1)[1]
        folder_name = urllib.parse.unquote(folder_name).strip()
        if not folder_name or not SAFE_NAME.match(folder_name):
            self._json_response(400, {'error': 'Invalid folder name'})
            return

        folder_path = os.path.join(OUTPUT_DIR, folder_name)
        # Prevent path traversal
        real_path = os.path.realpath(folder_path)
        real_output = os.path.realpath(OUTPUT_DIR)
        if not real_path.startswith(real_output + os.sep):
            self._json_response(400, {'error': 'Invalid folder name'})
            return

        if os.path.isdir(folder_path):
            shutil.rmtree(folder_path)
            self._json_response(200, {'success': True, 'deleted': folder_name})
        else:
            self._json_response(404, {'error': 'Folder not found'})

    def _handle_delete_file(self):
        path = self._path_only()
        remainder = path.split('/api/delete-file/', 1)[1]
        if '/' not in remainder:
            self._json_response(400, {'error': 'Invalid file path'})
            return

        folder_name, file_name = remainder.split('/', 1)
        folder_name = urllib.parse.unquote(folder_name).strip()
        file_name = urllib.parse.unquote(file_name).strip()

        if not folder_name or not SAFE_NAME.match(folder_name):
            self._json_response(400, {'error': 'Invalid folder name'})
            return
        if not file_name or not SAFE_NAME.match(file_name):
            self._json_response(400, {'error': 'Invalid file name'})
            return

        folder_path = os.path.join(OUTPUT_DIR, folder_name)
        file_path = os.path.join(folder_path, file_name)

        real_file = os.path.realpath(file_path)
        real_output = os.path.realpath(OUTPUT_DIR)
        if not real_file.startswith(real_output + os.sep):
            self._json_response(400, {'error': 'Invalid file path'})
            return

        if not os.path.isfile(file_path):
            self._json_response(404, {'error': 'File not found'})
            return

        os.remove(file_path)

        folder_deleted = False
        if os.path.isdir(folder_path):
            remaining = [n for n in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, n))]
            if not remaining:
                os.rmdir(folder_path)
                folder_deleted = True

        self._json_response(200, {
            'success': True,
            'deletedFile': file_name,
            'folder': folder_name,
            'folderDeleted': folder_deleted
        })

    def _json_response(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        """Quieter logging."""
        print(f"[SpriteForge] {args[0]}")


if __name__ == '__main__':
    with http.server.HTTPServer(('', PORT), SpriteForgeHandler) as httpd:
        print(f"SpriteForge server running at http://localhost:{PORT}")
        httpd.serve_forever()
