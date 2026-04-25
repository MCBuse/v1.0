# Design System (React Native / Restyle)

TRIGGER: When creating or modifying UI components, screens, or layouts in `apps/mobile/`. Any work in component files, screen files, or style-related files.

Enforce the project's React Native design system. All UI work uses existing components and tokens. No hardcoded values. No one-off `StyleSheet` overrides for values that belong in the token system.

---

## Stack

| Concern | Tool |
|---|---|
| Component primitives | `@shopify/restyle` — `Box`, `Text` |
| Design tokens | `apps/mobile/theme/tokens.ts` |
| Light / dark themes | `apps/mobile/theme/theme.ts`, `dark-theme.ts` |
| UI components | `apps/mobile/components/ui/` |
| Icons | `apps/mobile/components/icon/` (SVG via react-native-svg-transformer) |

---

## Rules

### 1. Use existing UI components first

Before writing any new UI, read `apps/mobile/components/ui/index.ts` to see what's available:

```
Box, Text, Button, Input, Card, ListItem, Badge, Avatar, NumPad, BottomSheet, Divider, Icon
```

If a component exists that covers the use case, use it. If it needs a new variant, add the variant to the component file — do not create a one-off version in the screen.

### 2. Never hardcode visual values

**Colors** — always a theme color key, never a hex/rgb literal:
```tsx
// ✅
<Box backgroundColor="bgPrimary" />
<Text color="textPrimary" />
const { colors } = useTheme<Theme>();
style={{ backgroundColor: colors.brandGreen }}

// ✗ never
style={{ backgroundColor: '#00D632' }}
style={{ color: '#111111' }}
```

**Spacing** — always a spacing token, never a raw number in Restyle props:
```tsx
// ✅
<Box padding="m" gap="s" marginBottom="l" />

// ✗ never (for spacing that has a token)
<Box padding={16} />
```

**Font sizes / weights** — always a `textVariant`:
```tsx
// ✅
<Text variant="h2">Title</Text>
<Text variant="bodyMedium">Description</Text>

// ✗ never
<Text style={{ fontSize: 22, fontWeight: '600' }}>Title</Text>
```

**Border radius** — use `borderRadius` token keys from the theme:
```tsx
// ✅
<Box borderRadius="m" />

// ✗ never
<Box style={{ borderRadius: 12 }} />
```

### 3. `StyleSheet.create` is for layout geometry only

Raw `StyleSheet` is acceptable only for values that have no Restyle equivalent (absolute position, flex ratios, `zIndex`, `overflow`, platform-specific shadow). All color, spacing, typography, and radius values must come from the token system.

```tsx
// ✅ acceptable in StyleSheet
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  avatar: { width: 40, height: 40, borderRadius: 20 },  // computed from tokens
});

// ✗ not acceptable
const styles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5', padding: 16 },  // use tokens
});
```

### 4. Icons

Always use `<Icon name="..." size={24} color={colors.textPrimary} />`. Never import SVGs directly in screen/feature files.

Available icon names are all keys of `IconName` from `components/icon/icons.ts`. Prefer semantic names that describe purpose, not shape (`'arrow-right'`, `'check-circle'`, `'user-add'`).

### 5. Typography variants

Use these exactly as defined in `theme.ts`:

| Variant | Size / Weight | Use |
|---|---|---|
| `display` | 52 / 700 | Hero amounts (NumPad) |
| `h1` | 28 / 700 | Screen titles |
| `h2` | 22 / 600 | Section headers |
| `h3` | 18 / 600 | Card titles |
| `body` | 15 / 400 | Default body text |
| `bodyMedium` | 15 / 500 | Emphasized body |
| `bodySemibold` | 15 / 600 | Strong emphasis |
| `caption` | 12 / 400 | Labels, timestamps |
| `captionMedium` | 12 / 500 | Badge labels |
| `label` | 13 / 500 | Form labels |
| `link` | 15 / 500 | Tappable text links |

### 6. Spacing scale (4pt grid)

| Token | px |
|---|---|
| `none` | 0 |
| `xs` | 4 |
| `s` | 8 |
| `m` | 16 |
| `l` | 24 |
| `xl` | 32 |
| `2xl` | 40 |
| `3xl` | 48 |
| `4xl` | 64 |
| `5xl` | 80 |
| `6xl` | 96 |
| `7xl` | 128 |

---

## Before Writing Screen UI

1. **Read the UI kit barrel**: `apps/mobile/components/ui/index.ts`
2. **Read the theme**: `apps/mobile/theme/theme.ts` — note color keys, textVariants
3. **Check icons**: `apps/mobile/components/icon/icons.ts` — pick semantic name
4. **Plan composition**: Map each section to existing components; flag gaps

---

## When a Component Doesn't Exist

1. Create it in `apps/mobile/components/ui/`
2. Follow existing component patterns: named export, props interface, Restyle primitives
3. Use only token values for all visual properties
4. Export it from `components/ui/index.ts`
5. Import from the barrel in screens

---

## CashApp Design Language (reference)

When building new components or screens, match the CashApp aesthetic:

- **Shape**: pill buttons (borderRadius `full`), cards with moderate radius (`m`/`l`)
- **Color**: near-black (`#111111`) on white primary; brand green (`#00D632`) for key CTAs only
- **Typography**: system fonts (SF Pro on iOS, Roboto on Android), no custom font needed
- **Shadows**: near-zero — prefer `bgSurface` background differentiation over elevation
- **Spacing**: generous padding inside cells, tight inter-element gaps
- **Motion**: subtle haptic feedback on all interactive elements (`expo-haptics`)

---

## Verification

After writing UI code, scan for violations:

```bash
# Hardcoded colors in screen/component files
grep -rn '#[0-9a-fA-F]\{3,8\}\|rgb(\|rgba(' apps/mobile/app apps/mobile/components 2>/dev/null | grep -v 'theme\|tokens\|node_modules'

# Raw pixel spacing in Restyle props (padding/margin passed as numbers)
grep -rn 'padding={[0-9]\|margin={[0-9]\|gap={[0-9]' apps/mobile/app apps/mobile/components 2>/dev/null

# fontSize / fontWeight in StyleSheet outside theme files
grep -rn 'fontSize:\|fontWeight:' apps/mobile/app apps/mobile/components 2>/dev/null | grep -v 'theme\|tokens'
```

Every hit is a violation. Replace with the appropriate token or component.
