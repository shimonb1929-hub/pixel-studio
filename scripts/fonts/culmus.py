# Adds the Culmus Hebrew fonts (classic Israeli faces such as David, Frank Ruehl, Miriam, Keter and
# Stam) to Pixel Studio's font library. They are not on Fontsource, so this makes their files here.
#
#   python3 scripts/fonts/culmus.py      then   node scripts/fonts/fetch.mjs
#
# Downloads the Culmus release below (checked by its sha256), keeps only the Latin and Hebrew
# letters each font has, saves them as woff2 in public/fonts/<id>/ with the license and a font.json,
# which fetch.mjs reads for every list.json font marked "local": "culmus" and leaves in place.
# Needs Python 3 with fontTools and brotli (pip install fonttools brotli).
#
# Culmus is under the GNU GPL 2 with the font exception: a design that uses or embeds the fonts is
# not covered by the GPL. The files are not changed beyond keeping fewer letters, which the
# license allows.

import hashlib
import io
import json
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = '0.140'
URL = f'https://downloads.sourceforge.net/project/culmus/culmus/{VERSION}/culmus-{VERSION}.tar.gz'
SHA256 = '6daed104481007752a76905000e71c0093c591c8ef3017d1b18222c277fc52e3'

# id -> (name, files). Each file is (file in the release, style).
FAMILIES = {
    'aharoni-clm': ('Aharoni CLM', [('AharoniCLM-Book.otf', 'normal'), ('AharoniCLM-Bold.otf', 'normal'), ('AharoniCLM-BookOblique.otf', 'italic')]),
    'david-clm': ('David CLM', [('DavidCLM-Medium.otf', 'normal'), ('DavidCLM-Bold.otf', 'normal'), ('DavidCLM-MediumItalic.otf', 'italic')]),
    'drugulin-clm': ('Drugulin CLM', [('DrugulinCLM-Bold.otf', 'normal')]),
    'ellinia-clm': ('Ellinia CLM', [('ElliniaCLM-Light.otf', 'normal'), ('ElliniaCLM-Bold.otf', 'normal'), ('ElliniaCLM-LightItalic.otf', 'italic')]),
    'frank-ruehl-clm': ('Frank Ruehl CLM', [('FrankRuehlCLM-Medium.otf', 'normal'), ('FrankRuehlCLM-Bold.otf', 'normal'), ('FrankRuehlCLM-MediumOblique.otf', 'italic')]),
    'hadasim-clm': ('Hadasim CLM', [('HadasimCLM-Regular.otf', 'normal'), ('HadasimCLM-Bold.otf', 'normal'), ('HadasimCLM-RegularOblique.otf', 'italic')]),
    'keter-yg': ('Keter YG', [('KeterYG-Medium.ttf', 'normal'), ('KeterYG-Bold.ttf', 'normal'), ('KeterYG-MediumOblique.ttf', 'italic')]),
    'miriam-clm': ('Miriam CLM', [('MiriamCLM-Book.otf', 'normal'), ('MiriamCLM-Bold.otf', 'normal')]),
    'miriam-mono-clm': ('Miriam Mono CLM', [('MiriamMonoCLM-Book.ttf', 'normal'), ('MiriamMonoCLM-Bold.ttf', 'normal'), ('MiriamMonoCLM-BookOblique.ttf', 'italic')]),
    'nachlieli-clm': ('Nachlieli CLM', [('NachlieliCLM-Light.otf', 'normal'), ('NachlieliCLM-Bold.otf', 'normal'), ('NachlieliCLM-LightOblique.otf', 'italic')]),
    'shofar': ('Shofar', [('ShofarRegular.ttf', 'normal'), ('ShofarDemi-Bold.ttf', 'normal'), ('ShofarRegularOblique.ttf', 'italic')]),
    'simple-clm': ('Simple CLM', [('SimpleCLM-Medium.ttf', 'normal'), ('SimpleCLM-Bold.ttf', 'normal'), ('SimpleCLM-MediumOblique.ttf', 'italic')]),
    'stam-ashkenaz-clm': ('Stam Ashkenaz CLM', [('StamAshkenazCLM.ttf', 'normal')]),
    'stam-sefarad-clm': ('Stam Sefarad CLM', [('StamSefaradCLM.ttf', 'normal')]),
    'yehuda-clm': ('Yehuda CLM', [('YehudaCLM-Light.otf', 'normal'), ('YehudaCLM-Bold.otf', 'normal')]),
}

# The letters kept: Latin (as Fontsource's latin and latin-ext), punctuation, ₪, and all of Hebrew.
KEEP = [
    (0x0000, 0x024F), (0x02BB, 0x02BC), (0x02C6, 0x02C6), (0x02DA, 0x02DC), (0x0300, 0x036F),
    (0x0590, 0x05FF), (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x20A0, 0x20C0), (0x2122, 0x2122),
    (0x2190, 0x2193), (0x2212, 0x2215), (0x25CC, 0x25CC), (0xFB1D, 0xFB4F), (0xFEFF, 0xFEFF),
    (0xFFFD, 0xFFFD),
]

root = Path(__file__).resolve().parents[2]
fonts_dir = root / 'public' / 'fonts'


def kept(codepoint):
    return any(low <= codepoint <= high for low, high in KEEP)


def unicode_range(codepoints):
    parts = []
    run = []
    for cp in sorted(codepoints):
        if run and cp == run[-1] + 1:
            run.append(cp)
            continue
        if run:
            parts.append(run)
        run = [cp]
    if run:
        parts.append(run)
    return ','.join(f'U+{r[0]:04X}' if len(r) == 1 else f'U+{r[0]:04X}-{r[-1]:04X}' for r in parts)


def download():
    cache = Path(tempfile.gettempdir()) / f'culmus-{VERSION}.tar.gz'
    if not cache.exists() or hashlib.sha256(cache.read_bytes()).hexdigest() != SHA256:
        print(f'Downloading {URL}')
        with urllib.request.urlopen(URL) as response:
            cache.write_bytes(response.read())
    data = cache.read_bytes()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise SystemExit(f'culmus-{VERSION}.tar.gz does not match its sha256')
    archive = tarfile.open(fileobj=io.BytesIO(data))
    return {Path(m.name).name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}


def main():
    files = download()
    license_text = files['LICENSE'].decode('utf8') + '\n\n' + files['GNU-GPL'].decode('utf8')
    for font_id, (name, faces) in FAMILIES.items():
        out = fonts_dir / font_id
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob('*.woff2'):
            old.unlink()
        (out / 'LICENSE').write_text(license_text, encoding='utf8')
        info = {'name': name, 'license': 'GPL-2.0-with-font-exception', 'version': VERSION, 'faces': []}
        for source, style in faces:
            font = TTFont(io.BytesIO(files[source]))
            weight = font['OS/2'].usWeightClass
            codepoints = [cp for cp in font.getBestCmap() if kept(cp)]
            options = subset.Options()
            options.flavor = 'woff2'
            options.layout_features = ['*']
            options.name_IDs = ['*']
            options.name_languages = ['*']
            options.notdef_outline = True
            options.glyph_names = False
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=codepoints)
            subsetter.subset(font)
            file = f'{font_id}-{weight}-{style}.woff2'
            font.flavor = 'woff2'
            font.save(out / file)
            info['faces'].append({
                'file': file,
                'weight': str(weight),
                'style': style,
                'unicodeRange': unicode_range(codepoints),
            })
            print(f'{font_id}: {file} ({(out / file).stat().st_size // 1024} KB, {len(codepoints)} letters)')
        (out / 'font.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf8')


main()
