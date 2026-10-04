# Font forensic audit

Date: 2026-10-04. Source: rendered public page at `https://katteb.com/ar/`.

## Observed fonts

| Family | Runtime evidence | Role |
| --- | --- | --- |
| Cairo | CSS family `Cairo, system-ui, sans-serif`; weights 400, 500, 600, 700, 800, 900 observed loaded | Body, Arabic navigation, headings, buttons and form controls |
| Font Awesome 6 Free | Loaded regular 400 and solid 900 faces | Interface glyphs |
| Font Awesome 6 Brands | Loaded 400 face | Social/brand glyphs |
| System UI / sans-serif | Declared fallback | Fallback only; not the computed primary family |

## Computed samples

| Element | Desktop 1440×900 | Mobile 390×844 |
| --- | --- | --- |
| Body | Cairo; 14px, 400, 20px line-height | Cairo; 14px, 400, 20px line-height |
| Hero `h1` | Cairo; 60.8px, 900, 79.04px line-height, normal tracking | Cairo; 23.424px, 900, 33.9648px line-height, normal tracking |
| First section `h2` | Cairo; 50.4px, 900, 66.528px line-height, normal tracking | Cairo; 29.6px, 900, 39.072px line-height, normal tracking |
| Hero CTA | Cairo; 13.5px, 800, 20px line-height | Cairo; 13.5px, 800, 20px line-height |
| Hero textarea | Cairo; 16px, 400, 26px line-height | Cairo; 16px, 400, 26px line-height |

## Remote source and independence requirement

The reference loads Cairo from Google Fonts and Font Awesome from cdnjs. A later clone must not rely on either remote request. Verify font license and self-host approved font files under local app assets; otherwise document and test a licensed substitute. Bundle local icons or use approved inline SVGs. Before final approval, confirm computed family/weights, heading wrapping and absence of network/CORS/fallback errors.

## Unmeasured items

Full computed-style coverage for nav links, body copy variants, cards, footer, pricing titles, FAQ, input placeholder, hover/focus/disabled states, and intermediate breakpoints remains pending.
