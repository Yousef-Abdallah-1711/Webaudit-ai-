# Responsive matrix

| Viewport | Evidence | Header | Hero | Content | Verification state |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | Screenshot + computed styles | Full horizontal RTL nav; brand at far right | 60.8px black Cairo heading, bounded input/actions, atmospheric background | Desktop layouts; two pricing cards likely side-by-side | Captured |
| 1280×800 | Not captured | Expected desktop nav | Responsive classes imply desktop scale | Not inspected | Pending |
| 1024×768 | Not captured | Breakpoint transition not inspected | Not inspected | Grid collapse behavior unknown | Pending |
| 768×1024 | Not captured | Tablet nav state unknown | Not inspected | Tablet card count/columns unknown | Pending |
| 390×844 | Screenshot + computed styles | Hamburger, free-start pill, logo | 23.424px heading; 656px hero; prompt/actions fit stacked container | All sections stack and page grows to ~18.3k CSS px | Captured |

## Measured desktop/mobile values

- Header height: 92px desktop; 76px mobile.
- Hero: 845px desktop; 656px mobile.
- Hero heading: desktop 60.8px/79.04px, mobile 23.424px/33.96px, weight 900.
- Standard section heading: desktop 50.4px/66.53px, mobile 29.6px/39.07px, weight 900.
- Goal prompt field: 16px/26px, 400 weight, both views.
- Hero primary action: 108×40px, pill shape.
- Main body uses 14px/20px, 400 weight at both sizes.

## Responsive inspection tasks

- Capture section crops at every width, including before/after the desktop-to-mobile menu transition.
- Verify no horizontal overflow in comparison table, tab strips, goal cards, report mockups, and footer.
- Record exact columns and container widths for goal library and pricing at 1280/1024/768.
- Inspect mobile nav open/closed state, keyboard focus, expanded FAQ, goal tabs, and report tabs.
- Confirm logical RTL alignment, line breaks, icons, and arrow directions at narrow width.
