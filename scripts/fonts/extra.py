# Adds the remaining free Hebrew fonts that are neither on Fontsource nor in Culmus: the Open Siddur
# Project's collection of open-licensed Hebrew fonts (Romm Vilna, Pfennig, Nesher, the Dead Sea
# Scroll hands, Yoram Gnat's ancient scripts, Raphael Finkel's Yiddish faces and more), Mekorot
# (Rashi script), Libertinus Sans, FiraGO, GNU FreeFont, DejaVu Sans, Unifont and a Hebrew
# JetBrains Mono.
#
#   python3 scripts/fonts/extra.py      then   node scripts/fonts/fetch.mjs
#
# Files from GitHub are taken at a fixed commit; the other downloads are checked by their sha256.
# Each family is saved as woff2 in public/fonts/<id>/ with its license and a font.json, which
# fetch.mjs reads for every list.json font marked "local": "extra" and leaves in place.
# Needs Python 3 with fontTools, brotli and zstandard (pip install fonttools brotli zstandard).
#
# Licenses: only fonts that may be shared and used for anything, including selling the designs
# made with them: SIL Open Font License, GPL with the font exception, the Ubuntu Font Licence,
# the LaTeX Project Public License, CC BY-SA and the Bitstream Vera license (DejaVu).
# Fonts under the plain GPL (no font exception), with a no-commercial-use clause, or freeware
# that may not be shared are left out, and so are symbol and picture fonts.
# Fonts whose license reserves their name are kept whole (only turned into woff2, which is not a
# change to the font); the big GPL, Vera and Libertinus fonts keep only their Latin and Hebrew
# letters, which their licenses allow; those that lack the Yiddish double letters or the rafe get
# them made from their own letters (see yiddish.py).

import hashlib
import io
import json
import tarfile
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

from yiddish import add_yiddish

SIDDUR = ('aharonium/fonts', '2b5e366ffaa89d42159092fcccd6d027b50a9ef9')
MEKOROT = ('googlefonts/mekorot', '4e51edad1a265838154e2cae46c28c6a11145c95')
JB_HEBREW = ('arielagor/jetbrains-mono-hebrew', '7a4a86dfe205d94cb8787b0a8b1526ec637d18d3')

# name -> (url, sha256)
ARCHIVES = {
    'libertinus': ('https://github.com/alerque/libertinus/releases/download/v7.051/Libertinus-7.051.tar.zst', '250677c929d3775a30913643594379af264ac2ef2801035aa1dcbe30b9be23a6'),
    'dejavu': ('https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2', 'fa9ca4d13871dd122f61258a80d01751d603b4d3ee14095d65453b4e846e17d7'),
    'freefont': ('https://ftp.gnu.org/gnu/freefont/freefont-otf-20120503.tar.gz', '3a6c51868c71b006c33c4bcde63d90927e6fcca8f51c965b8ad62d021614a860'),
    'unifont': ('https://unifoundry.com/pub/unifont/unifont-16.0.04/font-builds/unifont-16.0.04.otf', '0e3981ab552231b5a2a870f2b61741903a4bf25c23ef5aeb05fdced1b3c7af4d'),
    'lppl': ('https://www.latex-project.org/lppl/lppl-1-3c.txt', None),
}

L = 'Fonts/Hebrew Letters only/'
V = 'Fonts/Hebrew Letters with Vowels (no cantillation)/'
C = 'Fonts/Hebrew Letters with Vowels and Cantillation/'
ANCIENT = L + 'Culmus Project (GPL and GPL+FE)/Yoram Gnat (GPL+FE)/Ancient-Semitic-Scripts-0.06-1/'
SCROLLS = L + 'Dead Sea Scrolls Project (University of Haifa)/Scripta Qumranica Electronica/'

GPL_EXCEPTION = '''This font is distributed under the terms of the GNU General Public License, below.

As a special exception, if you create a document which uses this font, and embed this font or
unaltered portions of this font into the document, this font does not by itself cause the
resulting document to be covered by the GNU General Public License. This exception does not
however invalidate any other reasons why the document might be covered by the GNU General Public
License. If you modify this font, you may extend this exception to your version of the font, but
you are not obligated to do so. If you do not wish to do so, delete this exception statement from
your version.
'''

FINKEL = '''Fonts by Raphael (Refoyl) Finkel. He allowed the Open Siddur Project to share them under the
license it thinks best, and it shares them under the GNU GPL with the font exception
(https://github.com/aharonium/fonts, LICENSES.txt).

'''

# Where a file comes from: ('siddur' | 'mekorot' | 'jb' , path in that repository) or
# (archive name, path inside it).
# id -> name, license, license text (list of sources joined, or a literal string), whole, faces.
# Each face: (source, style) or (source, style, weight) when the file's own weight is wrong.
def s(path):
    return ('siddur', path)


FAMILIES = {
    # Open Siddur collection, SIL Open Font License.
    'carmela': ('Carmela', 'OFL-1.1', [s(L + 'Nir Yenni (OFL)/Carmela/LICENSE.txt')], True,
                [(s(L + 'Nir Yenni (OFL)/Carmela/carmelaregular.ttf'), 'normal'), (s(L + 'Nir Yenni (OFL)/Carmela/carmelabold.ttf'), 'normal')]),
    'carmelit': ('Carmelit', 'OFL-1.1', [s(L + 'Amos Jerbi (OFL)/Carmelit/OFL_License_V1.1.txt')], True,
                 [(s(L + 'Amos Jerbi (OFL)/Carmelit/carmelitregular.ttf'), 'normal'), (s(L + 'Amos Jerbi (OFL)/Carmelit/carmelitbold.ttf'), 'normal')]),
    'noot': ('Noot', 'OFL-1.1', [s(L + 'Amos Jerbi (OFL)/Noot/OFL_License_V1.1.txt')], True,
             [(s(L + 'Amos Jerbi (OFL)/Noot/Noot.otf'), 'normal')]),
    'ptil-narrow': ('Ptil Narrow', 'OFL-1.1', [s(L + 'Amos Jerbi (OFL)/Ptil/OFL License.txt')], True,
                    [(s(L + 'Amos Jerbi (OFL)/Ptil/ptilnarrow-regular-webfont.ttf'), 'normal'), (s(L + 'Amos Jerbi (OFL)/Ptil/ptilnarrow-medium-webfont.ttf'), 'normal')]),
    'ptil-wide': ('Ptil Wide', 'OFL-1.1', [s(L + 'Amos Jerbi (OFL)/Ptil/OFL License.txt')], True,
                  [(s(L + 'Amos Jerbi (OFL)/Ptil/ptilwide-regular-webfont.ttf'), 'normal'), (s(L + 'Amos Jerbi (OFL)/Ptil/ptilwide-medium-webfont.ttf'), 'normal')]),
    'asakim': ('Asakim', 'OFL-1.1', [s(L + 'Printer Killer (OFL)/asakim/OFL.txt')], True,
               [(s(L + 'Printer Killer (OFL)/asakim/Asakim Bold.ttf'), 'normal')]),
    'yehoash-esther': ('Yehoash Esther', 'OFL-1.1', [s(L + 'Marnie Manning (OFL)/OFL.txt')], True,
                       [(s(L + 'Marnie Manning (OFL)/E_Yehoash_Esther.ttf'), 'normal')]),
    'felix007': ('Felix007', 'OFL-1.1', [s(L + 'Felix Wasserstein (OFL)/felix007/LICENSE.txt')], True,
                 [(s(L + 'Felix Wasserstein (OFL)/felix007/felix007-medium.ttf'), 'normal')]),
    'migdal-haemeq': ('Migdal Haemeq', 'OFL-1.1', [s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/migdal-haemeq (OFL)/OFL.txt')], True,
                      [(s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/migdal-haemeq (OFL)/MigdalFontwin.ttf'), 'normal')]),
    'miri': ('Miri', 'OFL-1.1', [s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/miri (OFL)/OFL.txt')], True,
             [(s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/miri (OFL)/Miriwin.ttf'), 'normal')]),
    'retro-perspective': ('Retro Perspective', 'OFL-1.1', [s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/retro-perspective (OFL)/OFL.txt')], True,
                          [(s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/retro-perspective (OFL)/RetPer.ttf'), 'normal')]),
    'stopmotion': ('Stopmotion', 'OFL-1.1', [s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/stop-motion (OFL)/OFL.txt')], True,
                   [(s(L + 'Elad Mordechai Mizrahi (GPL and OFL)/stop-motion (OFL)/Stopmotion.ttf'), 'normal')]),
    'romm-vilna': ('Romm Vilna', 'OFL-1.1', [s(L + 'Ilan Elovitz (OFL)/RommVilna/SIL Open Font License.txt')], True,
                   [(s(L + 'Ilan Elovitz (OFL)/RommVilna/RommVilna-Regular.ttf'), 'normal')]),
    'romm-vilna-heading': ('Romm Vilna Heading', 'OFL-1.1', [s(L + 'Ilan Elovitz (OFL)/RommVilna/SIL Open Font License.txt')], True,
                           [(s(L + 'Ilan Elovitz (OFL)/RommVilna/RommVilna-Heading.otf'), 'normal')]),
    'romm-vilna-title': ('Romm Vilna Title', 'OFL-1.1', [s(L + 'Ilan Elovitz (OFL)/RommVilna/SIL Open Font License.txt')], True,
                         [(s(L + 'Ilan Elovitz (OFL)/RommVilna/RommVilna-Title.otf'), 'normal')]),
    'nesher-gadol': ('Nesher Gadol', 'OFL-1.1', [s(L + 'Isaac Gantwerk Mayer (OFL)/Nesher Gadol/LICENSE_OFL.txt')], True,
                     [(s(L + 'Isaac Gantwerk Mayer (OFL)/Nesher Gadol/NesherGadol.ttf'), 'normal')]),
    'nesher-katon': ('Nesher Katon', 'OFL-1.1', [s(L + 'Isaac Gantwerk Mayer (OFL)/Nesher Katon/LICENSE_OFL.txt')], True,
                     [(s(L + 'Isaac Gantwerk Mayer (OFL)/Nesher Katon/NesherKaton.ttf'), 'normal')]),
    'pfennig': ('Pfennig', 'OFL-1.1', [s(L + 'Daniel Johnson (OFL)/pfennig/OFL.txt')], True,
                [(s(L + 'Daniel Johnson (OFL)/pfennig/Pfennig.ttf'), 'normal'), (s(L + 'Daniel Johnson (OFL)/pfennig/PfennigBold.ttf'), 'normal'),
                 (s(L + 'Daniel Johnson (OFL)/pfennig/PfennigItalic.ttf'), 'italic'), (s(L + 'Daniel Johnson (OFL)/pfennig/PfennigBoldItalic.ttf'), 'italic')]),
    'squarish-sans': ('Squarish Sans', 'OFL-1.1', [s(L + 'Christtrekker (OFL)/squarish sans/Squarish Sans CT Regular.ttf')], True,
                      [(s(L + 'Christtrekker (OFL)/squarish sans/Squarish Sans CT Regular.ttf'), 'normal')]),
    'dyslexia-hebrew': ('Dyslexia Hebrew', 'OFL-1.1', [s(V + 'Shoag, Jake (OFL)/OFL-license.txt')], True,
                        [(s(V + 'Shoag, Jake (OFL)/DyslexiaHebrew-Regular.otf'), 'normal')]),
    'scroll-4q416': ('Scroll 4Q416', 'OFL-1.1', [s(SCROLLS + 'Eshbal Ratson and Einat Tamir (SIL OFL)/LICENSE.txt')], True,
                     [(s(SCROLLS + 'Eshbal Ratson and Einat Tamir (SIL OFL)/4Q416jan.ttf'), 'normal')]),
    'scroll-4q417': ('Scroll 4Q417', 'OFL-1.1', [s(SCROLLS + 'Einat Tamir (SIL OFL)/LICENSE.txt')], True,
                     [(s(SCROLLS + 'Einat Tamir (SIL OFL)/4Q417kern.ttf'), 'normal')]),
    'scroll-4q418': ('Scroll 4Q418', 'OFL-1.1', [s(SCROLLS + 'Einat Tamir (SIL OFL)/LICENSE.txt')], True,
                     [(s(SCROLLS + 'Einat Tamir (SIL OFL)/4Q418kern.ttf'), 'normal')]),
    'scroll-4q503': ('Scroll 4Q503', 'OFL-1.1', [s(SCROLLS + 'Antony Perrot (SIL OFL)/LICENSE.txt')], True,
                     [(s(SCROLLS + 'Antony Perrot (SIL OFL)/4Q503.ttf'), 'normal')]),
    # Shuneet (formerly Mike Hebrew), Creative Commons Attribution-ShareAlike 3.0.
    'shuneet': ('Shuneet', 'CC-BY-SA-3.0', 'Copyright 2006 Michael Cunliffe Thompson. Formerly the font was named MikeHebrew.\nThis work is licensed under the Creative Commons Attribution-Share Alike 3.0 Unported License.\nTo view a copy of this license, visit http://creativecommons.org/licenses/by-sa/3.0/\n', True,
                [(s(V + f'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Designer Set/shuneet_{w}_v2.otf'), 'normal', weight)
                 for w, weight in [('thin', 100), ('light', 300), ('book', 400), ('medium', 500), ('demi', 600), ('bold', 700), ('heavy', 900)]]),
    'shuneet-classic': ('Shuneet Classic', 'CC-BY-SA-3.0', 'Copyright 2006 Michael Cunliffe Thompson. Formerly the font was named MikeHebrew.\nThis work is licensed under the Creative Commons Attribution-Share Alike 3.0 Unported License.\nTo view a copy of this license, visit http://creativecommons.org/licenses/by-sa/3.0/\n', True,
                        [(s(V + 'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Word Processor Set/shuneet_classic_v2.otf'), 'normal'), (s(V + 'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Word Processor Set/shuneet_classic_bold_v2.otf'), 'normal'),
                         (s(V + 'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Word Processor Set/shuneet_oblique_v2.otf'), 'italic'), (s(V + 'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Word Processor Set/shuneet_oblique_bold_v2.otf'), 'italic')]),
    'shuneet-square': ('Shuneet Square', 'CC-BY-SA-3.0', 'Copyright 2006 Michael Cunliffe Thompson. Formerly the font was named MikeHebrew.\nThis work is licensed under the Creative Commons Attribution-Share Alike 3.0 Unported License.\nTo view a copy of this license, visit http://creativecommons.org/licenses/by-sa/3.0/\n', True,
                       [(s(V + 'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Word Processor Set/shuneet_square_v2.otf'), 'normal'), (s(V + 'Cunliffe-Thomspon (OFL)/Shuneet v.2.1/Word Processor Set/shuneet_square_bold_v2.otf'), 'normal')]),
    # GPL with the font exception.
    'refoyl': ('Refoyl', 'GPL-2.0-with-font-exception', [FINKEL, GPL_EXCEPTION, s(ANCIENT + 'GNU-GPL.TXT')], True,
               [(s(L + 'Refoyl Finkl (GPL+FE)/refoyl/Refoyl.ttf'), 'normal')]),
    'mashkit': ('Mashkit', 'GPL-2.0-with-font-exception', [FINKEL, GPL_EXCEPTION, s(ANCIENT + 'GNU-GPL.TXT')], True,
                [(s(V + 'Refoyl Finkl (GPL+FE)/Mashkit/Mashkit.ttf'), 'normal')]),
    'le-patin-helvete': ('Le Patin Helvète', 'GPL-2.0-with-font-exception', [s(L + 'Ludivine Loiseau (GPL+FE)/OSP Le Patin Helvète/COPYING.txt'), '\n\n', s(L + 'Ludivine Loiseau (GPL+FE)/OSP Le Patin Helvète/GPL-2.txt')], False,
                         [(s(L + 'Ludivine Loiseau (GPL+FE)/OSP Le Patin Helvète/Le-patin-helvete.ttf'), 'normal'), (s(L + 'Ludivine Loiseau (GPL+FE)/OSP Le Patin Helvète/Le-patin-helvete-italic.ttf'), 'italic')]),
    # Yoram Gnat's ancient scripts (Proto-Canaanite is left out: its letters are little pictures,
    # one of them a person).
    **{
        font_id: (name, 'GPL-2.0-with-font-exception', [s(ANCIENT + 'LICENSE.TXT'), '\n\n', s(ANCIENT + 'GNU-GPL.TXT')], True,
                  [(s(ANCIENT + f'{folder}/{file}'), 'normal')])
        for font_id, name, folder, file in [
            ('paleo-hebrew-gezer', 'Paleo Hebrew Gezer', 'Hebrew Paleo Gezer', 'GEZER.TTF'),
            ('paleo-hebrew-lachish', 'Paleo Hebrew Lachish', 'Hebrew Paleo Lakhish', 'LACHISH.TTF'),
            ('paleo-hebrew-mesha', 'Paleo Hebrew Mesha', 'Hebrew Paleo Mesha', 'MESHA.TTF'),
            ('paleo-hebrew-qumran', 'Paleo Hebrew Qumran', 'Hebrew Paleo Qumran', 'QUMRAN.TTF'),
            ('paleo-hebrew-siloam', 'Paleo Hebrew Siloam', 'Hebrew Paleo Siloam', 'SILOAM.TTF'),
            ('square-hebrew-ben-kosba', 'Square Hebrew Ben Kosba', 'Hebrew Square Ben Kosba', 'BENKOSBA.TTF'),
            ('square-hebrew-bet-shearim', 'Square Hebrew Bet Shearim', 'Hebrew Square Bet Shearim', 'BETSHEAR.TTF'),
            ('square-hebrew-habakkuk', 'Square Hebrew Habakkuk', 'Hebrew Square Habakuk', 'HABAKKUK.TTF'),
            ('square-hebrew-isaiah', 'Square Hebrew Isaiah', 'Hebrew Square Isaiah', 'ISAIAH.TTF'),
            ('aramaic-bar-rakib', 'Aramaic Bar Rakib', 'Aramaic Early Bar-Raqib', 'BR_RKB.TTF'),
            ('aramaic-yeb', 'Aramaic Yeb', 'Aramaic Imperial Yeb', 'YEB.TTF'),
            ('aramaic-viibce', 'Aramaic VIIBCE', 'Aramaic VIIBCE', 'AVIIBCE.TTF'),
            ('phoenician-ahiram', 'Phoenician Ahiram', 'Phoenician Ahiram', 'AHIRAM.TTF'),
        ]
    },
    # Ubuntu Font Licence.
    'benor-rashi': ('BenOr Rashi', 'UFL-1.0', [s(V + 'David ben Or (UBL)/Ubuntu-Font-License.html')], True,
                    [(s(V + 'David ben Or (UBL)/BenOrRashiRegular.ttf'), 'normal')]),
    # LaTeX Project Public License.
    'cjhebrew': ('CJ Hebrew', 'LPPL-1.3c', ['The cjhebrew fonts by Christian Justen, from CTAN (https://ctan.org/pkg/cjhebrew), under the LaTeX Project Public License.\n\n', ('lppl', '')], True,
                 [(s(L + 'CTAN TeX Archive/cjhebrew (LPPL)/CJHebLtx.ttf'), 'normal')]),
    # Other projects.
    'mekorot': ('Mekorot', 'OFL-1.1', [('mekorot', 'OFL.txt')], False,
                [(('mekorot', 'fonts/ttf/Mekorot-Regular.ttf'), 'normal'), (('mekorot', 'fonts/ttf/Mekorot-Bold.ttf'), 'normal'), (('mekorot', 'fonts/ttf/Mekorot-Italic.ttf'), 'italic')]),
    'firago': ('FiraGO', 'OFL-1.1', [s(C + 'FiraGO (OFL)/FiraGO_OTF_1001/Roman/FiraGO-Regular.otf')], True,
               [(s(C + 'FiraGO (OFL)/FiraGO_OTF_1001/Roman/FiraGO-Regular.otf'), 'normal'), (s(C + 'FiraGO (OFL)/FiraGO_OTF_1001/Roman/FiraGO-Bold.otf'), 'normal'),
                (s(C + 'FiraGO (OFL)/FiraGO_OTF_1001/Italic/FiraGO-Italic.otf'), 'italic')]),
    'libertinus-sans': ('Libertinus Sans', 'OFL-1.1', [('libertinus', 'Libertinus-7.051/OFL.txt')], False,
                        [(('libertinus', 'Libertinus-7.051/static/TTF/LibertinusSans-Regular.ttf'), 'normal'), (('libertinus', 'Libertinus-7.051/static/TTF/LibertinusSans-Bold.ttf'), 'normal'),
                         (('libertinus', 'Libertinus-7.051/static/TTF/LibertinusSans-Italic.ttf'), 'italic')]),
    'libertinus-serif-display': ('Libertinus Serif Display', 'OFL-1.1', [('libertinus', 'Libertinus-7.051/OFL.txt')], False,
                                 [(('libertinus', 'Libertinus-7.051/static/TTF/LibertinusSerifDisplay-Regular.ttf'), 'normal')]),
    'jetbrains-mono-hebrew': ('JetBrains Mono Hebrew', 'OFL-1.1', [('jb', 'OFL.txt')], False,
                              [(('jb', 'build/JetBrainsMonoHebrewBridge-Regular.ttf'), 'normal'), (('jb', 'build/JetBrainsMonoHebrewBridge-Bold.ttf'), 'normal', 700),
                               (('jb', 'build/JetBrainsMonoHebrewBridge-Italic.ttf'), 'italic')]),
    'freesans': ('FreeSans', 'GPL-3.0-with-font-exception', [('freefont', 'freefont-20120503/README'), '\n\n', ('freefont', 'freefont-20120503/COPYING')], False,
                 [(('freefont', 'freefont-20120503/FreeSans.otf'), 'normal'), (('freefont', 'freefont-20120503/FreeSansBold.otf'), 'normal', 700), (('freefont', 'freefont-20120503/FreeSansOblique.otf'), 'italic')]),
    'freeserif': ('FreeSerif', 'GPL-3.0-with-font-exception', [('freefont', 'freefont-20120503/README'), '\n\n', ('freefont', 'freefont-20120503/COPYING')], False,
                  [(('freefont', 'freefont-20120503/FreeSerif.otf'), 'normal'), (('freefont', 'freefont-20120503/FreeSerifBold.otf'), 'normal'), (('freefont', 'freefont-20120503/FreeSerifItalic.otf'), 'italic')]),
    'freemono': ('FreeMono', 'GPL-3.0-with-font-exception', [('freefont', 'freefont-20120503/README'), '\n\n', ('freefont', 'freefont-20120503/COPYING')], False,
                 [(('freefont', 'freefont-20120503/FreeMono.otf'), 'normal'), (('freefont', 'freefont-20120503/FreeMonoBold.otf'), 'normal')]),
    'dejavu-sans': ('DejaVu Sans', 'Bitstream-Vera', [('dejavu', 'dejavu-fonts-ttf-2.37/LICENSE')], False,
                    [(('dejavu', 'dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf'), 'normal'), (('dejavu', 'dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf'), 'normal'),
                     (('dejavu', 'dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Oblique.ttf'), 'italic')]),
    'unifont': ('Unifont', 'GPL-2.0-with-font-exception', ['GNU Unifont by Roman Czyborra, Paul Hardy and others (https://unifoundry.com/unifont/). Dual-licensed under the GNU GPL version 2 or later with the font embedding exception, and the SIL Open Font License 1.1.\n\n', GPL_EXCEPTION, s(ANCIENT + 'GNU-GPL.TXT')], False,
                [(('unifont', ''), 'normal')]),
}

# The letters kept when a font is cut down (as in culmus.py): Latin, punctuation, ₪ and Hebrew.
KEEP = [
    (0x0000, 0x024F), (0x02BB, 0x02BC), (0x02C6, 0x02C6), (0x02DA, 0x02DC), (0x0300, 0x036F),
    (0x0590, 0x05FF), (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x20A0, 0x20C0), (0x2122, 0x2122),
    (0x2190, 0x2193), (0x2212, 0x2215), (0x25CC, 0x25CC), (0xFB1D, 0xFB4F), (0xFEFF, 0xFEFF),
    (0xFFFD, 0xFFFD),
]

# Monospaced fonts keep one width for every letter, so they get no double letters.
MONO = {'jetbrains-mono-hebrew', 'freemono', 'unifont'}

root = Path(__file__).resolve().parents[2]
fonts_dir = root / 'public' / 'fonts'
cache_dir = Path(tempfile.gettempdir()) / 'pixel-studio-extra-fonts'


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


def download(url, sha256=None):
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache = cache_dir / hashlib.sha256(url.encode()).hexdigest()
    if not cache.exists():
        print(f'Downloading {url}')
        with urllib.request.urlopen(url) as response:
            cache.write_bytes(response.read())
    data = cache.read_bytes()
    if sha256 and hashlib.sha256(data).hexdigest() != sha256:
        cache.unlink()
        raise SystemExit(f'{url} does not match its sha256')
    return data


archives = {}


def archive_files(name):
    if name not in archives:
        url, sha256 = ARCHIVES[name]
        data = download(url, sha256)
        if url.endswith('.tar.zst'):
            import zstandard
            reader = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data))
            tar = tarfile.open(fileobj=reader, mode='r|')
            archives[name] = {m.name: tar.extractfile(m).read() for m in tar if m.isfile()}
        elif '.tar' in url:
            tar = tarfile.open(fileobj=io.BytesIO(data))
            archives[name] = {m.name: tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}
        else:
            archives[name] = {'': data}
    return archives[name]


def read(source):
    where, path = source
    repos = {'siddur': SIDDUR, 'mekorot': MEKOROT, 'jb': JB_HEBREW}
    if where in repos:
        repo, commit = repos[where]
        return download(f'https://raw.githubusercontent.com/{repo}/{commit}/{urllib.parse.quote(path)}')
    return archive_files(where)[path]


def license_text(parts):
    if isinstance(parts, str):
        return parts
    out = []
    for part in parts:
        if isinstance(part, str):
            out.append(part)
            continue
        data = read(part)
        if part[1].endswith(('.otf', '.ttf')):
            # The license is only inside the font file itself.
            name = TTFont(io.BytesIO(data))['name']
            data = ((name.getDebugName(0) or '') + '\n\n' + (name.getDebugName(13) or '') + '\n').encode('utf8')
        elif part[1].endswith('.html'):
            import html
            import re
            text = re.sub(r'<(script|style).*?</\1>', '', data.decode('utf8', 'replace'), flags=re.S)
            text = html.unescape(re.sub(r'<[^>]+>', '', text))
            data = re.sub(r'\n\s*\n+', '\n\n', text).strip().encode('utf8') + b'\n'
        out.append(data.decode('utf8', 'replace'))
    return ''.join(out)


def save_family(font_id, name, license_name, license_parts, whole, faces):
    out = fonts_dir / font_id
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*.woff2'):
        old.unlink()
    (out / 'LICENSE').write_text(license_text(license_parts), encoding='utf8')
    info = {'name': name, 'license': license_name, 'version': '', 'faces': []}
    for source, style, *given in faces:
        font = TTFont(io.BytesIO(read(source)))
        weight = given[0] if given else font['OS/2'].usWeightClass
        codepoints = [cp for cp in font.getBestCmap() if whole or kept(cp)]
        if not whole:
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
            if font_id not in MONO:
                # The Yiddish double letters and rafe, when the font lacks them (see yiddish.py).
                codepoints += add_yiddish(font)
        file = f'{font_id}-{weight}-{style}.woff2'
        if any(face['file'] == file for face in info['faces']):
            raise SystemExit(f'{font_id}: two faces would both be {file}')
        font.flavor = 'woff2'
        font.save(out / file)
        info['faces'].append({'file': file, 'weight': str(weight), 'style': style, 'unicodeRange': unicode_range(codepoints)})
        print(f'{font_id}: {file} ({(out / file).stat().st_size // 1024} KB, {len(codepoints)} letters)')
    (out / 'font.json').write_text(json.dumps(info, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def main():
    for font_id, (name, license_name, license_parts, whole, faces) in FAMILIES.items():
        save_family(font_id, name, license_name, license_parts, whole, faces)


main()
