# ImageKit Badge Implementation Guide

This document explains the technical implementation of episode badges on posters using ImageKit's Layer API (`l-text`). It covers the "Master Hack" developed to achieve asymmetrical corner rounding (rounded left, square right) and absolute positioning.

## Core Logic: The "Master Hack"

ImageKit transformations (`r` for rounding) normally apply to all four corners of a layer. To achieve a **rounded-left, square-right** look flush to the image edge, we use a combination of canvas locking and off-canvas masking.

### 1. Canvas Locking (`tr:w-500`)
We force the ImageKit canvas to 500px width.
- **Why**: TMDB `w500` posters are precisely 500px wide. Locking the canvas ensures that `lx` (X-offset) and `pa` (padding) calculations are absolute and reliable. Without this, large padding can cause the canvas to expand, creating white bars.

### 2. Masking with Massive Padding (`pa-right-350`)
We apply a standard pill-shape rounding (`r-50`) but hide the right half.
- **How**: By setting a very large right padding (e.g., `350px`), the right edge of the badge background is pushed well beyond the 500px canvas limit.
- **Result**: The right rounding happens "off-canvas" (is clipped), while the left rounding remains visible, creating a perfectly square edge at the image boundary.

### 3. Fixed Offset Positioning (`lx-160`)
Instead of `oa-top_right` (which proved unreliable for remote origins like TMDB), we use a fixed `lx` offset.
- **lx-160**: The badge background starts at 160px.
- **Visible Text Area**: Effectively starts at `lx + padding-left` (160 + 35 = 195px) and ends at 500px. This provides ~300px of space, which is enough for long strings like "S 12 Ep 123".

## Parameter Breakdown

| Parameter | Value | Meaning |
| :--- | :--- | :--- |
| `ie` | Base64 | The text content (must be Base64 encoded). |
| `fs` | 45 | Font Size. 45-50px provides good readability on `w500` posters. |
| `co` | FFFFFF | White text color. |
| `bg` | 00000080 | **50% Semi-transparent Black**. Provides a premium, modern look. |
| `pa` | 15_350_15_35 | `top_right_bottom_left`. Large right padding is key for the square edge. |
| `r` | 50 | Corner radius. |
| `lx` | 160 | X-coordinate for the layer start. |
| `ly` | 0 | Y-coordinate (0 = flush to top). |

## Integration in YACA

### `src/utils/imageProcessor.js`
Contains the `getImageKitUrl` function which generates the final transformation string. It uses `Buffer.from(text).toString('base64')` to ensure special characters (like spaces) don't break the URL.

### `src/handlers/catalogHandler.js`
Implements the user-defined text rules:
- **Rule**: If `season <= 1` or it's an absolute-numbered catalog (Kitsu/Anime) -> `Ep 12`.
- **Rule**: Otherwise -> `S 2 Ep 5`.

## Limitations & Best Practices
- **TMDB Mirrors**: TMDB does not block ImageKit, but ensure you use live `w500` URLs. `w185` or `original` would require different `lx` and `pa` offsets.
- **Performance**: This method offloads all rendering to ImageKit CDN, protecting the server from OOM issues common with local `Sharp` processing.
