# TryOn.AI Chrome Extension

A Chrome extension (Manifest V3) that enables virtual try-on functionality on any fashion website.

## Features

- 🔍 Automatic clothing item detection on fashion websites
- 🎯 Click any clothing item to try it on instantly
- ✨ Beautiful overlay highlights for detected items
- 📱 Works on all major fashion e-commerce sites
- 🚀 One-click integration with TryOn.AI platform

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. The extension is now installed!

## Setup

### Icons

You need to create the following icon files in the `assets/` folder:

- `icon-16.png` - 16x16 pixels
- `icon-48.png` - 48x48 pixels  
- `icon-128.png` - 128x128 pixels

You can use any image editing tool to create these. The icons should represent your TryOn.AI branding.

## Usage

1. Navigate to any fashion website
2. Click the TryOn.AI extension icon in your browser toolbar
3. Click "Detect Clothing Items" to scan the page
4. Hover over detected items to see the "Try On" button
5. Click "Try On" to open the item in TryOn.AI

## File Structure

```
chrome-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── popup/
│   ├── popup.html        # Popup UI HTML
│   ├── popup.js          # Popup logic
│   └── popup.css         # Popup styles
├── content/
│   ├── content.js        # Content script (runs on web pages)
│   └── overlay.css       # Styles for highlights/overlays
├── background/
│   └── background.js     # Service worker (background tasks)
├── assets/
│   ├── icon-16.png       # Extension icon (16x16)
│   ├── icon-48.png       # Extension icon (48x48)
│   └── icon-128.png      # Extension icon (128x128)
└── utils/
    └── imageDetector.js  # Image detection utilities
```

## Manifest Features

- **Manifest Version**: 3 (latest)
- **Permissions**: 
  - `activeTab` - Access current tab
  - `storage` - Save settings/preferences
  - `scripting` - Inject scripts
- **Host Permissions**: All URLs (for universal compatibility)
- **Content Script**: Runs on all URLs
- **Background**: Service worker for background tasks
- **Popup**: Default popup HTML interface

## Development

To modify the extension:

1. Edit the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## Testing

1. Load the extension in Chrome (Developer mode)
2. Visit a fashion website (e.g., Amazon, Etsy, Shopify stores)
3. Click the extension icon
4. Click "Detect Clothing Items"
5. Verify that clothing images are highlighted
6. Click "Try On" to test the flow

## Notes

- The extension uses content scripts to detect clothing items on web pages
- Image detection uses heuristics (alt text, dimensions, context)
- For production, consider integrating with ML models for better detection
- The extension opens `https://tryon.ai/try` with the image URL parameter

## License

Copyright © 2024 TryOn.AI. All rights reserved.

