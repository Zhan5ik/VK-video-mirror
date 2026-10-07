# VK Video Mirror

A lightweight Chrome extension for mirroring video players on the current tab, including VK Video.

## Features

- **Mirror / restore** - horizontally flips the largest visible video on the active tab. Click again to restore its previous scale.
- **Mirrored Picture-in-Picture** - adds a floating button to the page. Click it to open the current video in a mirrored PiP window.
- Searches open Shadow DOM roots, which lets it find players that regular page selectors cannot reach.
- Requests access only to the active tab after you click the extension icon. It does not run a background service.

VK Video has been tested successfully.

## Install locally

1. Extract this folder if you downloaded the ZIP archive.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Open a video page, click the extension icon, and choose an action.

## Use

### Mirror the video on the page

Click **Mirror / restore** in the extension popup. The extension selects the largest visible video that is currently loaded. Click the button again to restore it.

### Open mirrored Picture-in-Picture

Click **Mirrored PiP** in the popup. A **Mirrored PiP** button appears in the bottom-right corner of the page. Click that page button to open the video in the floating window; Chrome requires a direct page click to start PiP.

The PiP window uses a mirrored canvas stream with the source video's audio track. CSS transforms on the original `<video>` element do not carry over to native PiP, so the extension creates this separate stream for the floating window.

## Permissions

The extension uses Chrome's `activeTab` and `scripting` permissions. It injects its helper into the tab only after you click the extension action; it does not request broad host access.

## Limitations

Video sites may restrict capturing frames or audio. If a site's stream blocks capture, inline mirroring may still work while mirrored PiP does not.
