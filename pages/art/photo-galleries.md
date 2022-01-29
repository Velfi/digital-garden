import Gallery from '../../components/Gallery/index.js'

# How I display photographs on this site

## Process the images

_This requires PowerShell v7 (Yes, I develop on Windows, fight me)_

I'm using [GraphicsMagick](http://www.graphicsmagick.org/) for generating thumbnails and to convert `PNG`s into `webp`s. It has options to dither the image and I tried that in hopes that it would further reduce image size but it actually made them larger *(when passing `-colors 16 -depth 4`)*.

```ps
# For all PNGs in the current folder
foreach ($f in (Get-ChildItem -File -Filter *.png))
{
  # Get the name of the file, sans the extension
  $name = Split-Path $f -LeafBase

  # Create a thumbnail
  $output = "${name}-thumbnail.webp"
  gm.exe convert $f -resize 640 $output

  # Convert the original PNG to webp
  $output = "${name}.webp"
  gm.exe convert $f $output

  # Delete the original
  Remove-Item $f
}
```

<Gallery />
