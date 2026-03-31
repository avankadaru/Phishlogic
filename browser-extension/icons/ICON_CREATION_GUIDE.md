# PhishLogic Extension Icons

## Required Icons

Create the following icons with the PhishLogic shield logo:

### Sizes
- **icon16.png** - 16x16 pixels (toolbar icon)
- **icon48.png** - 48x48 pixels (extension manager, notifications)
- **icon128.png** - 128x128 pixels (Chrome Web Store, installation)

## Design Guidelines

### Logo Concept
- Shield shape with a phishing hook inside
- Colors: Purple gradient (#667eea to #764ba2)
- Simple, recognizable at small sizes
- Professional and trustworthy appearance

### Icon Specifications
1. **Background**: Transparent PNG
2. **Format**: PNG-24 with alpha channel
3. **Design**: Clean, modern, minimal
4. **Colors**: Match brand gradient (#667eea, #764ba2)
5. **Safe Area**: Leave 2-3px padding on all sides

## Creation Options

### Option 1: Professional Design Tool
- Use Figma, Adobe Illustrator, or Sketch
- Export as PNG at 2x resolution for retina displays
- Downscale to exact sizes

### Option 2: Online Icon Generator
1. Visit iconifier.net or app-icon.net
2. Upload SVG or high-res PNG logo
3. Generate all sizes automatically
4. Download and place in `browser-extension/icons/`

### Option 3: Command Line (ImageMagick)
```bash
# If you have a master 512x512 icon:
convert icon512.png -resize 16x16 icon16.png
convert icon512.png -resize 48x48 icon48.png
convert icon512.png -resize 128x128 icon128.png
```

## Temporary Placeholder

For development/testing, create solid color placeholders:

```bash
# Purple square placeholders (requires ImageMagick)
convert -size 16x16 xc:'#667eea' icon16.png
convert -size 48x48 xc:'#667eea' icon48.png
convert -size 128x128 xc:'#667eea' icon128.png
```

Or use an online tool like placeholder.com to generate test images.

## File Locations

Place the created icons in:
```
browser-extension/icons/
├── icon16.png
├── icon48.png
└── icon128.png
```

## Verification

After creating icons, verify they work:
1. Load unpacked extension in Chrome
2. Check extension icon appears in toolbar
3. Check notification icon is visible
4. Check Chrome://extensions page shows icon correctly

## Design Tips

- **16x16**: Very simple, just recognizable shape/color
- **48x48**: Add more detail, readable shield shape
- **128x128**: Full detail, professional quality

Keep the design consistent across all sizes while adjusting detail level appropriately.
