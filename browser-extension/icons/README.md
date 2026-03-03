# PhishLogic Extension Icons

## Required Icon Sizes

Create the following PNG icon files:

- `icon16.png` - 16x16px (toolbar icon)
- `icon48.png` - 48x48px (extension manager)
- `icon128.png` - 128x128px (Chrome Web Store)

## Design Guidelines

**Recommended Design**:
- Shield icon with "PL" or "🛡️" symbol
- Color scheme: Purple gradient (#667eea to #764ba2)
- Simple, recognizable design at small sizes

## Creating Icons

### Option 1: Use an Icon Generator

1. Visit [RealFaviconGenerator](https://realfavicongenerator.net/)
2. Upload a square image (at least 260x260px)
3. Generate and download extension icons

### Option 2: Use Figma/Sketch/Photoshop

1. Create a 128x128px canvas
2. Design shield/security icon
3. Export at 16x16, 48x48, and 128x128 sizes

### Option 3: Quick Placeholder (For Testing)

For testing purposes, you can use simple colored squares:

```bash
# Using ImageMagick (if installed)
convert -size 16x16 xc:#667eea icon16.png
convert -size 48x48 xc:#667eea icon48.png
convert -size 128x128 xc:#667eea icon128.png
```

Or use online tools like [Placeholder.com](https://placeholder.com/):
- Download: https://via.placeholder.com/16/667eea/FFFFFF?text=PL
- Download: https://via.placeholder.com/48/667eea/FFFFFF?text=PL
- Download: https://via.placeholder.com/128/667eea/FFFFFF?text=PL

## Current Status

⚠️ **Icons not yet created** - Extension will show generic icon until real icons are added.

The extension will work without custom icons, but Chrome will show a default puzzle piece icon.
