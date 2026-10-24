# Adds Hebrew fonts that are not on Fontsource to Pixel Studio's font library: the Culmus fonts
# (classic Israeli faces such as David, Frank Ruehl, Miriam, Keter and Stam), the Taamey fonts and
# a few more by Yoram Gnat from Culmus Fancy (with every cantillation mark, for Torah texts), and
# Ezra SIL (made for the Hebrew Bible).
#
#   python3 scripts/fonts/culmus.py      then   node scripts/fonts/fetch.mjs
#
# Downloads the Culmus release and two Debian packages below (each checked by its sha256), keeps
# only the Latin and Hebrew letters each font has, saves them as woff2 in public/fonts/<id>/ with
# the license and a font.json, which fetch.mjs reads for every list.json font marked
# "local": "culmus" and leaves in place.
# Needs Python 3 with fontTools and brotli (pip install fonttools brotli).
#
# Culmus and the Culmus Fancy fonts taken here are under the GNU GPL 2 with the font exception: a
# design that uses or embeds the fonts is not covered by the GPL. The files are not changed beyond
# keeping fewer letters, which the license allows. The other Culmus Fancy fonts (Anka, Gan, Ktav
# Yad and more) are under the plain GPL, without the exception, so they are left out.
# Fonts that lack the Yiddish double letters or the rafe get them made from their own letters.
# Ezra SIL is under the SIL Open Font License with "Ezra" as a reserved name: changing the font
# would mean renaming it, so its files are only turned into woff2, with every letter kept.

import hashlib
import io
import json
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

from yiddish import add_yiddish

VERSION = '0.140'
URL = f'https://downloads.sourceforge.net/project/culmus/culmus/{VERSION}/culmus-{VERSION}.tar.gz'
SHA256 = '6daed104481007752a76905000e71c0093c591c8ef3017d1b18222c277fc52e3'

# Debian packages: source -> (version, url, sha256).
PACKAGES = {
    'culmus-fancy': (
        '0.0.20240129.1',
        'https://deb.debian.org/debian/pool/main/c/culmus-fancy/fonts-culmus-fancy_0.0.20240129.1_all.deb',
        '40c983d0c96305ca65dc40a4e853307c949be98d893ef7b4ecbe7e612cac19ba',
    ),
    'ezra': (
        '2.51',
        'https://deb.debian.org/debian/pool/main/f/fonts-sil-ezra/fonts-sil-ezra_2.51-10_all.deb',
        '652399473ca5676376be98c3f280d4b69232353f16bb1c48575e40ccc103b89d',
    ),
}

GPL_EXCEPTION = '''This font is distributed under the terms of the GNU General Public License version 2, below.

As a special exception, if you create a document which uses this font, and embed this font or
unaltered portions of this font into the document, this font does not by itself cause the
resulting document to be covered by the GNU General Public License. This exception does not
however invalidate any other reasons why the document might be covered by the GNU General Public
License. If you modify this font, you may extend this exception to your version of the font, but
you are not obligated to do so. If you do not wish to do so, delete this exception statement from
your version.
'''

EZRA_COPYRIGHT = '''Copyright (c) 1997-2007, SIL International (http://www.sil.org/), with Reserved Font Names "SIL" and "Ezra".
Hebrew layout intelligence copyright (c) 2003 & 2007 Ralph Hancock and John Hudson, under the MIT/X11 License.
'''

# id -> (name, files) from the Culmus release. Each file is (file in the release, style).
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

# id -> (name, source, copyright, files) from the Debian packages.
EXTRA_FAMILIES = {
    'taamey-frank-clm': ('Taamey Frank CLM', 'culmus-fancy', 'Copyright (c) 2009-2010 by Yoram Gnat (yoram.gnat@gmail.com)', [('TaameyFrankCLM-Medium.ttf', 'normal'), ('TaameyFrankCLM-Bold.ttf', 'normal'), ('TaameyFrankCLM-MediumOblique.ttf', 'italic')]),
    'taamey-david-clm': ('Taamey David CLM', 'culmus-fancy', 'Copyright (c) 2009-2010 by Yoram Gnat (yoram.gnat@gmail.com)', [('TaameyDavidCLM-Medium.ttf', 'normal'), ('TaameyDavidCLM-Bold.ttf', 'normal'), ('TaameyDavidCLM-MediumOblique.ttf', 'italic')]),
    'taamey-ashkenaz': ('Taamey Ashkenaz', 'culmus-fancy', 'Copyright (c) 2009-2014 by Yoram Gnat (yoram.gnat@gmail.com)', [('TaameyAshkenaz-Medium.ttf', 'normal'), ('TaameyAshkenaz-Bold.ttf', 'normal'), ('TaameyAshkenaz-MediumOblique.ttf', 'italic')]),
    'keter-aram-tsova': ('Keter Aram Tsova', 'culmus-fancy', 'Copyright 2011-2012 by Yoram Gnat (yoram.gnat@gmail.com)', [('KeterAramTsova.ttf', 'normal')]),
    'makabi-yg': ('Makabi YG', 'culmus-fancy', 'Copyright 2009 by Yoram Gnat (yoram.gnat@gmail.com)', [('MakabiYG.ttf', 'normal')]),
    'shmulik-clm': ('Shmulik CLM', 'culmus-fancy', 'Copyright 2010 by Yoram Gnat (yoram.gnat@gmail.com). In memory of Shmuel Katz, whose hand-drawn letters inspired it.', [('ShmulikCLM.ttf', 'normal')]),
    'ezra-sil': ('Ezra SIL', 'ezra', EZRA_COPYRIGHT, [('SILEOT.ttf', 'normal')]),
    'ezra-sil-sr': ('Ezra SIL SR', 'ezra', EZRA_COPYRIGHT, [('SILEOTSR.ttf', 'normal')]),
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


def fetch(name, url, sha256):
    cache = Path(tempfile.gettempdir()) / name
    if not cache.exists() or hashlib.sha256(cache.read_bytes()).hexdigest() != sha256:
        print(f'Downloading {url}')
        with urllib.request.urlopen(url) as response:
            cache.write_bytes(response.read())
    data = cache.read_bytes()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise SystemExit(f'{name} does not match its sha256')
    return data


# The files of a Debian package (an ar archive holding data.tar.xz), by file name.
def deb_files(data):
    if not data.startswith(b'!<arch>\n'):
        raise SystemExit('not a Debian package')
    pos = 8
    while pos < len(data):
        header = data[pos:pos + 60]
        name = header[:16].decode().strip().rstrip('/')
        size = int(header[48:58].decode().strip())
        body = data[pos + 60:pos + 60 + size]
        pos += 60 + size + (size % 2)
        if name.startswith('data.tar'):
            archive = tarfile.open(fileobj=io.BytesIO(body))
            return {Path(m.name).name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
    raise SystemExit('Debian package without data')


def save_family(font_id, name, license_name, license_text, version, faces, files, keep_all=False):
    out = fonts_dir / font_id
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*.woff2'):
        old.unlink()
    (out / 'LICENSE').write_text(license_text, encoding='utf8')
    info = {'name': name, 'license': license_name, 'version': version, 'faces': []}
    for source, style in faces:
        font = TTFont(io.BytesIO(files[source]))
        weight = font['OS/2'].usWeightClass
        if keep_all:
            codepoints = list(font.getBestCmap())
        else:
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
            # The Yiddish double letters and rafe, when the font lacks them (see yiddish.py).
            codepoints += add_yiddish(font)
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


def main():
    files = download()
    gpl = files['GNU-GPL'].decode('utf8')
    license_text = files['LICENSE'].decode('utf8') + '\n\n' + gpl
    for font_id, (name, faces) in FAMILIES.items():
        save_family(font_id, name, 'GPL-2.0-with-font-exception', license_text, VERSION, faces, files)

    packages = {source: deb_files(fetch(url.rsplit('/', 1)[1], url, sha256)) for source, (_, url, sha256) in PACKAGES.items()}
    # Ezra's package leaves out the license text (Debian keeps one copy for every package), so it
    # is taken from another OFL font here, from the line where the license itself starts.
    ofl = (fonts_dir / 'alef' / 'LICENSE').read_text(encoding='utf8')
    ofl = ofl[ofl.index('This Font Software is licensed'):]
    for font_id, (name, source, copyright, faces) in EXTRA_FAMILIES.items():
        version = PACKAGES[source][0]
        if source == 'ezra':
            save_family(font_id, name, 'OFL-1.1', copyright + '\n' + ofl, version, faces, packages[source], keep_all=True)
        else:
            save_family(font_id, name, 'GPL-2.0-with-font-exception', copyright + '\n\n' + GPL_EXCEPTION + '\n\n' + gpl, version, faces, packages[source])


main()
