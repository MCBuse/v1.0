# MCBuse Merchant Portal visual system

- Light-first product interface using cool neutral surfaces and MCBuse blue (`#165DFF`) for navigation, information, and primary actions.
- IBM Plex Sans for interface copy and IBM Plex Mono for money, counts, and timestamps.
- Hairline slate dividers, restrained 8–12px corner rounding, and shadows only for modal layers.
- Fiat-first language. Never show token names, wallet addresses, networks, signatures, or blockchain imagery to merchants.
- Desktop structure: fixed left navigation, fluid content, and a global Create request action in the app bar. Payment requests and product forms open in right-side drawers on every viewport; mobile keeps bottom navigation for destinations only.
- The authentication image is optional and configured through `NEXT_PUBLIC_AUTH_BACKGROUND_URL`; preserve the dark fallback and bottom-heavy overlay.
