#!/usr/bin/env python3
"""Patch footer PAGE fields with format switches and strip empty pgNumType (WPS compat)."""
import zipfile, shutil, re, sys

path = "/home/z/my-project/download/Explee_Reverse_Engineering_Report.docx"
tmp = path + ".tmp"

with zipfile.ZipFile(path, "r") as zin:
    names = zin.namelist()
    items = {n: zin.read(n) for n in names}

# 1. document.xml: remove empty pgNumType (cover section artifact)
doc = items["word/document.xml"].decode("utf-8")
before = doc.count("<w:pgNumType/>")
doc = doc.replace("<w:pgNumType/>", "")
print(f"removed {before} empty pgNumType elements")

# 1b. TOC cleanup: drop the empty-PAGEREF hyperlink left in the field's first paragraph
# (it renders as a duplicate first TOC line with no page number)
m = re.search(r"<w:hyperlink [^>]*>(?:(?!</w:hyperlink>).)*?PAGEREF _Toc1(?:(?!</w:hyperlink>).)*?</w:hyperlink>", doc, re.S)
if m:
    doc = doc[:m.start()] + doc[m.end():]
    print("removed empty-PAGEREF hyperlink from TOC field paragraph")
items["word/document.xml"] = doc.encode("utf-8")

# 2. footer*.xml: identify which footer belongs to which section.
# The Roman footer is referenced by section 2 (front matter), Arabic by section 3 (body).
# docx-js creates separate footer files in order: find them and check current field text.
footer_files = sorted(n for n in names if re.match(r"word/footer\d+\.xml", n))
print("footers:", footer_files)
for n in footer_files:
    xml = items[n].decode("utf-8")
    has_page = "PAGE" in xml or "CURRENT" in xml
    print(f"  {n}: contains PAGE field: {has_page}")

# Determine mapping: parse document.xml sectPr order -> footerReference ids
rels = items["word/_rels/document.xml.rels"].decode("utf-8")
rid_map = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))
sect_footers = re.findall(r'<w:footerReference w:type="default" r:id="(rId\d+)"/>', doc)
print("section footer refs in order:", sect_footers, "->", [rid_map.get(r) for r in sect_footers])

# Section order: [front matter (ROMAN), body (arabic)]  (cover has none)
formats = ["ROMAN", "arabic"]
for i, rid in enumerate(sect_footers[:2]):
    fname = "word/" + rid_map.get(rid, "")
    if fname not in items:
        continue
    xml = items[fname].decode("utf-8")
    fmt = formats[i]
    patched = re.sub(
        r'(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)',
        rf'\1 PAGE \\* {fmt} \\* MERGEFORMAT \2',
        xml)
    if patched != xml:
        items[fname] = patched.encode("utf-8")
        print(f"  patched {fname} -> \\* {fmt}")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n, data in items.items():
        zout.writestr(n, data)
shutil.move(tmp, path)
print("done")
