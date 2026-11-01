# Validated interface invariants

- Every open numbox dropdown must be visible and clickable above navigation,
  tabs and adjacent panels in **Sombre, Clair, Ivoire and Citron**, on desktop,
  tablet and phone (portrait and landscape). This rule applies to every future
  layout, theme and component change. Preserve each theme's approved palette.
- Keep the menu in its original DOM to preserve labels, theme inheritance and
  keyboard behavior. The shared numbox controller uses the browser top layer
  to avoid ancestor stacking/clipping regressions.
- Run `tests/numbox-foreground-test.cjs` for any change affecting numboxes,
  navigation, layout or themes. It must check actual hit testing, selection,
  keyboard close and a deliberately overlapping high-z-index surface, not
  merely compare z-index values. Keep this check in CI and production checks.
- The browser top layer is not a reason to draw an old dropdown above a newly
  opened modal dialog. Existing modal confirmation behavior remains mandatory.

Do not modify approved audio behavior or unrelated theme colors for a layout fix.
