# Makes Hebrew fonts ready for Yiddish by adding, from the font's own letters, what Yiddish needs
# and the font lacks:
# - the double letters װ ױ ײ (U+05F0-05F2), built from the font's own vav and yod, with the points
#   placed under and over them the way the font places them under its single letters (so ײַ works);
# - the rafe (U+05BF), the small line over פֿ and בֿ, made from the font's own patah and placed over
#   the middle of each letter.
#
#   python3 scripts/fonts/yiddish.py public/fonts/<id>/<file>.woff2 ...
#
# culmus.py and extra.py call add_yiddish() before saving their fonts; fetch.mjs runs this on the
# Fontsource files of the families marked "addYiddish" in list.json. A file that already has
# everything is left as it is, so running it twice does nothing more.
# Every font changed here allows it: they are under the SIL Open Font License without a reserved
# name, or the GPL with the font exception.

import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables
from fontTools.ttLib.tables.TupleVariation import TupleVariation

VAV, YOD, PATAH, RAFE = 0x05D5, 0x05D9, 0x05B7, 0x05BF
# Double letter -> its two letters from right to left (the order they are read).
DOUBLES = {0x05F0: (VAV, VAV), 0x05F1: (VAV, YOD), 0x05F2: (YOD, YOD)}
HEBREW_LETTERS = range(0x05D0, 0x05EB)


def bounds(font, name):
    pen = BoundsPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return pen.bounds


def new_name(font, base):
    names = set(font.getGlyphOrder())
    name = base
    while name in names:
        name += '.yi'
    return name


def add_glyph(font, name, parts, advance):
    # parts: [(glyph name, dx, dy)], drawn together as one new glyph.
    order = font.getGlyphOrder() + [name]
    if 'glyf' in font:
        pen = TTGlyphPen(font.getGlyphSet())
        for part, dx, dy in parts:
            pen.addComponent(part, (1, 0, 0, 1, dx, dy))
        glyph = pen.glyph()
        glyf = font['glyf']
        font.setGlyphOrder(order)
        glyf.setGlyphOrder(order)
        glyf[name] = glyph
        glyph.recalcBounds(glyf)
        font['hmtx'][name] = (advance, getattr(glyph, 'xMin', 0))
    else:
        cff = font['CFF '].cff
        top = cff.topDictIndex[0]
        if hasattr(top, 'FDSelect'):
            raise ValueError('CID-keyed CFF fonts are not handled')
        private = top.Private
        glyph_set = font.getGlyphSet()
        width = None if advance == getattr(private, 'defaultWidthX', 0) else advance - getattr(private, 'nominalWidthX', 0)
        pen = T2CharStringPen(width, glyph_set)
        for part, dx, dy in parts:
            glyph_set[part].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
        charstring = pen.getCharString(private=private, globalSubrs=cff.GlobalSubrs)
        strings = top.CharStrings
        strings.charStringsIndex.append(charstring)
        strings.charStrings[name] = len(strings.charStringsIndex) - 1
        top.charset.append(name)
        font.setGlyphOrder(order)
        font['hmtx'][name] = (advance, 0)
        b = bounds(font, name)
        font['hmtx'][name] = (advance, round(b[0]) if b else 0)
    if 'gvar' in font:
        font['gvar'].variations[name] = []
    for table in ('hdmx', 'LTSH', 'VDMX'):
        if table in font:
            del font[table]
    if 'post' in font and font['post'].formatType == 2.0:
        font['post'].extraNames = getattr(font['post'], 'extraNames', [])
    return name


def set_gdef_class(font, name, cls):
    if 'GDEF' in font and font['GDEF'].table.GlyphClassDef:
        font['GDEF'].table.GlyphClassDef.classDefs[name] = cls


def advance_deltas(font, name):
    # For a variable font: per variation, how much the glyph's advance changes.
    gvar = font['gvar']
    count = len(font['glyf'][name].getCoordinates(font['glyf'])[0])
    result = []
    for variation in gvar.variations.get(name, []):
        coords = variation.coordinates
        left = coords[count] if len(coords) > count else None
        right = coords[count + 1] if len(coords) > count + 1 else None
        delta = (right[0] if right else 0) - (left[0] if left else 0)
        result.append((variation.axes, delta))
    return result


def vary_double(font, name, deltas):
    # The second letter's place and the double letter's width change with the first letter's width
    # and the second's; written as variations of the new glyph's two parts and its width.
    axes_list = {}
    for axes, delta in deltas[0]:
        axes_list.setdefault(tuple(sorted(axes.items())), [0, 0])[0] += delta
    for axes, delta in deltas[1]:
        axes_list.setdefault(tuple(sorted(axes.items())), [0, 0])[1] += delta
    variations = []
    for axes, (d_first, d_second) in axes_list.items():
        # Points of a composite glyph: one per part, then the four phantom points.
        coords = [(0, 0), (round(d_first), 0), (0, 0), (round(d_first + d_second), 0), (0, 0), (0, 0)]
        variations.append(TupleVariation(dict(axes), coords))
    font['gvar'].variations[name] = variations


def mark_base_subtables(font, letter):
    if 'GPOS' not in font:
        return []
    found = []
    for lookup in font['GPOS'].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            real = sub.ExtSubTable if lookup.LookupType == 9 else sub
            if getattr(real, 'LookupType', lookup.LookupType) == 4 and letter in real.BaseCoverage.glyphs:
                found.append(real)
    return found


def anchor(x, y):
    a = otTables.Anchor()
    a.Format = 1
    a.XCoordinate = round(x)
    a.YCoordinate = round(y)
    return a


def add_double_anchors(font, name, parts):
    # parts: [(letter glyph, dx)]; each mark goes halfway between where it would go on each part.
    for sub in mark_base_subtables(font, parts[0][0]):
        glyphs = sub.BaseCoverage.glyphs
        if not all(part in glyphs for part, _ in parts):
            continue
        records = [sub.BaseArray.BaseRecord[glyphs.index(part)] for part, _ in parts]
        new = otTables.BaseRecord()
        new.BaseAnchor = []
        for cls in range(sub.ClassCount):
            points = [(rec.BaseAnchor[cls], dx) for rec, (_, dx) in zip(records, parts)]
            if any(a is None for a, _ in points):
                new.BaseAnchor.append(None)
                continue
            x = sum(a.XCoordinate + dx for a, dx in points) / len(points)
            y = sum(a.YCoordinate for a, _ in points) / len(points)
            new.BaseAnchor.append(anchor(x, y))
        glyphs.append(name)
        sub.BaseArray.BaseRecord.append(new)
        sub.BaseArray.BaseCount = len(sub.BaseArray.BaseRecord)


def add_rafe_mark(font, rafe, letters):
    # A new kind of mark, over the middle of every Hebrew letter, a little above its top.
    upem = font['head'].unitsPerEm
    gap = upem * 0.06
    rb = bounds(font, rafe)
    for sub in mark_base_subtables(font, letters[0]):
        cls = sub.ClassCount
        sub.ClassCount += 1
        for glyph, record in zip(sub.BaseCoverage.glyphs, sub.BaseArray.BaseRecord):
            b = bounds(font, glyph)
            record.BaseAnchor.append(anchor((b[0] + b[2]) / 2, b[3] + gap) if b else None)
        mark = otTables.MarkRecord()
        mark.Class = cls
        mark.MarkAnchor = anchor((rb[0] + rb[2]) / 2, rb[1])
        sub.MarkCoverage.glyphs.append(rafe)
        sub.MarkArray.MarkRecord.append(mark)
        sub.MarkArray.MarkCount = len(sub.MarkArray.MarkRecord)
        return True
    return False


def add_yiddish(font):
    """Adds the missing Yiddish letters to a font. Returns the code points added."""
    cmap = font.getBestCmap() or {}
    if VAV not in cmap or YOD not in cmap or not any(c in cmap for c in HEBREW_LETTERS):
        return []
    if 'CFF2' in font:
        return []
    variable = 'gvar' in font
    added = []
    hmtx = font['hmtx']
    new_glyphs = {}
    for code, (right, left) in DOUBLES.items():
        if code in cmap:
            continue
        right_glyph, left_glyph = cmap[right], cmap[left]
        left_advance = hmtx[left_glyph][0]
        advance = left_advance + hmtx[right_glyph][0]
        name = new_name(font, f'uni{code:04X}')
        # Drawn left to right: the left letter at 0, the right letter after it.
        add_glyph(font, name, [(left_glyph, 0, 0), (right_glyph, left_advance, 0)], advance)
        if variable:
            vary_double(font, name, (advance_deltas(font, left_glyph), advance_deltas(font, right_glyph)))
        set_gdef_class(font, name, 1)
        add_double_anchors(font, name, [(left_glyph, 0), (right_glyph, left_advance)])
        new_glyphs[code] = name
        added.append(code)
    if RAFE not in cmap and PATAH in cmap:
        patah = cmap[PATAH]
        pb = bounds(font, patah)
        top = max((bounds(font, cmap[c]) or (0, 0, 0, 0))[3] for c in HEBREW_LETTERS if c in cmap)
        if pb:
            name = new_name(font, 'uni05BF')
            # The patah, lifted from under the letters to over them.
            lift = top + font['head'].unitsPerEm * 0.06 - pb[1]
            add_glyph(font, name, [(patah, 0, lift)], hmtx[patah][0])
            set_gdef_class(font, name, 3)
            letters = [cmap[c] for c in HEBREW_LETTERS if c in cmap]
            add_rafe_mark(font, name, letters)
            new_glyphs[RAFE] = name
            added.append(RAFE)
    if not added:
        return []
    if variable and 'HVAR' in font:
        # Widths then come from the glyph variations, which now cover the new letters too.
        del font['HVAR']
    for table in font['cmap'].tables:
        if table.isUnicode():
            for code, name in new_glyphs.items():
                table.cmap[code] = name
    return added


def main():
    for path in sys.argv[1:]:
        font = TTFont(path)
        added = add_yiddish(font)
        if added:
            font.save(path)
            print(f'{path}: added {" ".join(chr(c) if c != RAFE else "rafe" for c in added)}')


if __name__ == '__main__':
    main()
