---
title: My handwriting, as a font
description: I made a font of my own handwriting. It's free to use under the Creative Commons license.
keywords: fonts, otf, handwriting, script, free, creative commons
---

# {title}

I like making fonts for some reason. Here's my latest, based on my own
handwriting. I made it with [Glyphs](https://glyphsapp.com/), a tool I'd
recommend. It's a bit pricey, but it's worth it if you're serious about making
fonts.

I start by writing out the alphabet, numbers, and some punctuation on a piece of
specially marked paper. Then I use a tool I wrote to convert that into 108
little snapshots of forms. Then I get to importing, positioning, and tracing
those forms in Glyphs.

## The handwriting scan tool

I wrote a tool to help me convert my handwriting into a font. [It's available on
GitHub][scan-tool-repo], and it can be installed with cargo:

```sh
cargo install handwriting-scan-tool --locked
```

To learn how to use it, see the docs on the [GitHub page][scan-tool-repo]. You'll need a printer, scanner, and a bit of patience.

## Download the font

- [v0.99 Zelda's Handwriting (OTF Format)][file]
  - _Original flavor. Not too nice to read, but it does look just like my
    handwriting._ Contains the alphabet, numbers, some punctuation, and some
    special characters.
  - ![v0.99 font sample][sample]

[file]: handwriting/Zelda'sHandwriting-Regular.otf
[sample]: handwriting/handwriting_sample.png
[scan-tool-repo]: https://github.com/Velfi/handwriting-scan-tool
