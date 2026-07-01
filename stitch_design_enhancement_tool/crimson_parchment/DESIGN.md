---
name: Crimson Parchment
colors:
  surface: '#fff8f3'
  surface-dim: '#e6d8c5'
  surface-bright: '#fff8f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff2e2'
  surface-container: '#fbecd9'
  surface-container-high: '#f5e6d3'
  surface-container-highest: '#efe0cd'
  on-surface: '#221a0f'
  on-surface-variant: '#5a403c'
  inverse-surface: '#372f22'
  inverse-on-surface: '#feefdb'
  outline: '#8e706b'
  outline-variant: '#e3beb8'
  surface-tint: '#b52619'
  primary: '#610000'
  on-primary: '#ffffff'
  primary-container: '#8b0000'
  on-primary-container: '#ff907f'
  inverse-primary: '#ffb4a8'
  secondary: '#695c4e'
  on-secondary: '#ffffff'
  secondary-container: '#f1e0cd'
  on-secondary-container: '#6f6254'
  tertiary: '#003321'
  on-tertiary: '#ffffff'
  tertiary-container: '#064c33'
  on-tertiary-container: '#7ebc9c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#920703'
  secondary-fixed: '#f1e0cd'
  secondary-fixed-dim: '#d4c4b2'
  on-secondary-fixed: '#231a0f'
  on-secondary-fixed-variant: '#504538'
  tertiary-fixed: '#b1f0ce'
  tertiary-fixed-dim: '#95d4b3'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#0e5138'
  background: '#fff8f3'
  on-background: '#221a0f'
  surface-variant: '#efe0cd'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 32px
  gutter: 24px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
This design system is built for media cataloging and personal curators who appreciate a blend of traditional "paper-and-ink" aesthetics with modern digital efficiency. The brand personality is warm, scholarly yet passionate, and deeply organized.

The visual style is **Modern/Corporate with Tactile influences**. It utilizes a "warm-mode" foundational palette that reduces eye strain during long cataloging sessions. By moving away from stark white or deep black, the UI evokes the feeling of a premium physical archive. Key characteristics include high-quality typography, generous internal card padding, and subtle depth through tonal layering rather than aggressive shadows.

## Colors
The palette is centered around the contrast between "Old Paper" (#F5E6D3) and "Deep Oxblood" (#8B0000). 

- **Primary:** Used for high-emphasis actions, primary buttons, and critical branding elements.
- **Secondary:** A slightly darker parchment tone used for card surfaces and container backgrounds to create subtle distinction from the main page background.
- **Tertiary:** A deep forest green reserved strictly for "Active" states or positive confirmations, providing a sophisticated alternative to standard bright greens.
- **Neutrals:** The text uses a deep coffee-brown instead of pure black to maintain the warmth of the design.

## Typography
This design system utilizes **Manrope** for all roles to ensure a clean, professional, and highly legible experience. The hierarchy is established through significant weight variations—using ExtraBold for titles to give them an "ink-pressed" feel.

- **Headlines:** Use tighter letter-spacing and heavy weights to anchor sections.
- **Labels:** Small labels and tags utilize uppercase with increased tracking for maximum readability at small scales.
- **Body:** Standard body text maintains a generous line height (1.5x) to prevent dense catalog metadata from feeling cluttered.

## Layout & Spacing
The layout follows a **Fixed-Width Grid** on desktop (max-width: 1280px) to maintain the "dashboard" feel without elements stretching too far apart. 

- **Grid:** 12-column system with 24px gutters.
- **Margins:** 32px safe areas on mobile, scaling to auto-centered on desktop.
- **Rhythm:** All spacing is a multiple of 8px. Cards use 24px internal padding to ensure content feels premium and uncrowded. 
- **Reflow:** On tablet, the 12 columns collapse to 8; on mobile, elements stack into a single column with full-bleed cards.

## Elevation & Depth
Depth is achieved through **Tonal Layering** supplemented by very soft, wide-spread shadows. 

1. **Base Layer:** The main background (#F5E6D3).
2. **Surface Layer:** Cards use a slightly darker tone (#E6D5C3) or white with 0.04 opacity to create a "recessed" or "elevated" look without high-contrast borders.
3. **Shadows:** Use a "Natural Ambient" style—0px offset, 20px blur, and 5% opacity using the primary Oxblood color instead of black. This creates a warm glow rather than a cold shadow.
4. **Interactions:** Hovering over a card should slightly deepen the shadow and lift the element by 2px.

## Shapes
The shape language is consistently **Rounded**, avoiding sharp corners to maintain a friendly and approachable catalog feel.

- **Cards & Large Containers:** 1rem (16px) corner radius.
- **Buttons & Inputs:** 0.5rem (8px) corner radius.
- **Selection Indicators:** Active states (like selected profiles) use a 2px solid border with the same roundedness as the container they surround.

## Components

### Buttons
- **Primary:** Deep Oxblood (#8B0000) background with White text. Bold weight.
- **Secondary:** Transparent background with an Oxblood border and text.
- **Ghost:** No border, Oxblood text, used for secondary navigation.

### Cards
Cards are the heart of the system. Every card should have a 16px corner radius, a subtle 1px border (#DCC7B0), and the ambient oxblood-tinted shadow. Content inside cards should be grouped using the `stack-sm` (12px) spacing.

### Chips & Badges
Small, pill-shaped elements for tags (e.g., "4K", "Active", "v2.4.0"). Use low-opacity versions of the primary or tertiary colors for the background to keep them legible but secondary to the main text.

### Input Fields
Inputs should have the parchment background, but 5% darker than their parent container. Use a 1px border that turns Oxblood on focus. 

### Navigation
The top navigation bar is flat and relies on typography and the primary logo for identity. Active states in the nav are indicated by a small horizontal line beneath the text in Oxblood color.