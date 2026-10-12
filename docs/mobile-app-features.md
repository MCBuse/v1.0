# MCBuse Mobile App - Working Functionalities

## Core Architecture

- **Framework**: Expo (React Native with new architecture enabled)
- **Navigation**: File-based routing with Expo Router
- **State Management**: Zustand for app state, TanStack Query for server state
- **Network Detection**: Offline banner with automatic network status monitoring
- **Theme Support**: Light and dark mode with Restyle theme system
- **Secure Storage**: Expo SecureStore for sensitive data (tokens, preferences)

---

## 1. Authentication & Onboarding

### Registration
- ✅ Multi-mode registration (email or phone)
- ✅ Username creation with real-time availability checking
- ✅ Username format validation and normalization
- ✅ Password with show/hide toggle
- ✅ Phone number input with international format support
- ✅ OTP verification for phone registration
- ✅ Automatic profile creation with primary currency selection

### Login
- ✅ Multi-mode login (email or phone)
- ✅ Mode switcher between email and phone
- ✅ Password visibility toggle
- ✅ OTP verification for phone login
- ✅ Session management with automatic token refresh
- ✅ Forgot password flow
- ✅ Password reset functionality

### Onboarding
- ✅ First-time user onboarding screen
- ✅ Persistent onboarding state (doesn't show again)
- ✅ Smooth navigation to authentication

---

## 2. Home Screen (Dashboard)

### Account Overview
- ✅ Dual wallet display (Routine & Holding accounts)
- ✅ Horizontal scrollable account cards
- ✅ Multi-currency balance display (USDC & EURC)
- ✅ Real-time balance updates
- ✅ Pull-to-refresh functionality
- ✅ Time-based greeting (morning, afternoon, evening)
- ✅ User avatar with first name initial
- ✅ Notification icon button (UI ready)

### Quick Actions (Routine Account)
- ✅ **Send** - P2P payments by username
- ✅ **Receive** - Generate QR code for receiving payments
- ✅ **Invoice** - Create payment requests
- ✅ **Scan** - Scan QR codes for payments
- ✅ **Top Up** - Add funds via card (Stripe/MoonPay)

### Holding Account Actions
- ✅ **Move** - Transfer between Routine and Holding accounts
- ✅ **Swap** - Exchange between USDC and EURC
- ✅ **Cash Out** - Withdraw to bank account

### Recent Activity
- ✅ Last 5 transactions display
- ✅ Transaction type icons and labels
- ✅ Amount display with credit/debit indicators
- ✅ Status badges (completed, pending, failed)
- ✅ Relative timestamps (e.g., "2 hours ago")
- ✅ Tap to view transaction receipt
- ✅ "See all" link to activity screen

---

## 3. Activity Screen

### Transaction History
- ✅ Paginated transaction list (50 items)
- ✅ Transaction type filters:
  - All transactions
  - Top Ups (on-ramps)
  - Payments (P2P)
  - Swaps
  - Transfers (internal)
  - Cash Out (off-ramps)
- ✅ Pull-to-refresh
- ✅ Transaction direction detection (credit/debit/neutral)
- ✅ Status indicators with color coding
- ✅ Empty state UI
- ✅ Loading skeletons
- ✅ Tap to view transaction details

---

## 4. Profile Screen

### User Information
- ✅ Full name display
- ✅ Username display
- ✅ User avatar with initial
- ✅ Primary currency display (USD/EUR)
- ✅ Username sharing functionality
- ✅ Edit profile navigation

### Wallet Information
- ✅ Solana wallet addresses display
- ✅ Routine account Solana public key
- ✅ Holding account Solana public key
- ✅ Address truncation for readability
- ✅ Copy/share wallet addresses
- ✅ Network indicator (Solana Devnet)

### Account Actions
- ✅ Edit profile button
- ✅ Share username button
- ✅ Sign out with confirmation dialog
- ✅ Loading states for all operations

---

## 5. Send Money (P2P Payments)

### Recipient Selection
- ✅ Username search and resolution
- ✅ Username format validation
- ✅ Real-time username lookup
- ✅ QR code scanning for recipient
- ✅ User not found error handling

### Amount Entry
- ✅ Custom NumPad component
- ✅ Currency selection (USDC/EURC)
- ✅ Live amount display
- ✅ Visual amount validation
- ✅ Recipient confirmation display

### Payment Execution
- ✅ Payment processing
- ✅ Success confirmation screen
- ✅ Transaction summary
- ✅ Option to send more
- ✅ Error handling with user feedback

---

## 6. Receive Money

### QR Code Generation
- ✅ Dynamic QR code generation
- ✅ Username-based payment requests
- ✅ QR code display
- ✅ Instructions for sender

---

## 7. Top Up (On-Ramp)

### Amount Selection
- ✅ Fiat currency selection (USD/EUR)
- ✅ Custom amount input
- ✅ Quick amount buttons ($25, $50, $100, $250)
- ✅ Min/max validation ($20 - $10,000)
- ✅ Decimal input support (2 decimal places)

### Payment Processing
- ✅ Stripe integration via WebView
- ✅ Onramp session creation
- ✅ Widget URL caching
- ✅ Checkout navigation
- ✅ Status tracking screen
- ✅ Polling for completion
- ✅ Success/failure notifications

---

## 8. Internal Transfer

### Between Accounts
- ✅ Move from Routine to Holding (or vice versa)
- ✅ Direction flip button
- ✅ Amount entry with NumPad
- ✅ Currency selection (USDC/EURC)
- ✅ Real-time balance checks
- ✅ Instant transfer execution
- ✅ Success confirmation
- ✅ Transfer more option

---

## 9. Currency Swap

### Token Exchange
- ✅ USDC ↔ EURC swapping
- ✅ Direction toggle
- ✅ Amount input with NumPad
- ✅ Real-time swap preview
- ✅ Exchange rate display
- ✅ Preview amount calculation
- ✅ Swap execution
- ✅ Success confirmation
- ✅ Swap more option

---

## 10. Cash Out (Off-Ramp)

### Bank Withdrawal
- ✅ Cash out checkout screen (WebView ready)
- ✅ MoonPay integration support
- ✅ Amount validation
- ✅ Success tracking

---

## 11. Invoice/Payment Requests

- ✅ Invoice creation flow
- ✅ Amount specification
- ✅ Payment request generation

---

## 12. QR Code Scanning

- ✅ QR scanner screen
- ✅ Camera permissions handling
- ✅ QR code recognition
- ✅ Payment initiation from QR

---

## 13. Transaction Receipt

- ✅ Detailed transaction view
- ✅ Transaction ID display
- ✅ Amount and currency
- ✅ Timestamp
- ✅ Status
- ✅ Parties involved
- ✅ Navigation from activity/home

---

## 14. Profile Edit

- ✅ Name editing
- ✅ Username modification
- ✅ Primary currency selection
- ✅ Form validation
- ✅ Save changes

---

## 15. Network & Error Handling

### Connectivity
- ✅ Offline detection
- ✅ Offline banner display
- ✅ Automatic reconnection
- ✅ Query client integration with network status

### Error Management
- ✅ API error handling
- ✅ User-friendly error messages
- ✅ Alert dialogs for errors
- ✅ Loading states
- ✅ Retry mechanisms
- ✅ Form validation errors

---

## 16. UI/UX Components

### Reusable Components
- ✅ Custom Button (primary, secondary, ghost variants)
- ✅ Input fields with labels and errors
- ✅ PhoneInput with international support
- ✅ NumPad component for amount entry
- ✅ Box layout component (Restyle)
- ✅ Text component with variants
- ✅ Loading skeletons
- ✅ Empty states

### Design System
- ✅ Consistent color scheme
- ✅ Light/dark mode support
- ✅ IBM Plex Sans font family
- ✅ Responsive spacing system
- ✅ Border radius system
- ✅ Safe area handling
- ✅ Icon system (Iconsax)

---

## 17. Security Features

- ✅ JWT token management
- ✅ Secure token storage
- ✅ Automatic token refresh
- ✅ Auth expiration handling
- ✅ Session persistence
- ✅ Logout functionality
- ✅ Password visibility toggle
- ✅ Platform-specific security (web checks)

---

## 18. Developer Experience

- ✅ TypeScript throughout
- ✅ Form validation with Zod and React Hook Form
- ✅ API client with Axios
- ✅ React Query for data fetching
- ✅ Hot reload support
- ✅ Environment variable configuration
- ✅ URL polyfill for React Native

---

## Currency Support

- ✅ **USDC** (USD Coin)
- ✅ **EURC** (Euro Coin)
- ✅ Multi-currency wallet balances
- ✅ Currency-specific formatting
- ✅ Symbol display ($ for USDC, € for EURC)
- ✅ Base units conversion (6 decimals)

---

## Known Limitations

- 🚧 NFC payments (UI ready, integration pending)
- 🚧 Notifications system (icon present, functionality pending)
- 🚧 Some transaction types may need backend support
- 🚧 MoonPay off-ramp (checkout screen is placeholder)

---

## Testing Capabilities

- ✅ Works on iOS (via TestFlight)
- ✅ Works on Android (via APK)
- ✅ Expo Go compatible
- ✅ Simulator/Emulator compatible
- ✅ Physical device testing ready
- ✅ Deep linking support (`mcbuse://`)

---

## Summary Statistics

- **Total Screens**: 20+
- **Main Flows**: 8 (Auth, Send, Receive, Top-up, Transfer, Swap, Cash-out, Profile)
- **Tab Screens**: 4 (Home, Explore, Activity, Profile)
- **Feature Modules**: 10 (auth, users, wallets, transactions, transfer, swap, onramp, offramp, payments, nfc)
- **Reusable UI Components**: 15+
- **Supported Currencies**: 2 (USDC, EURC)
- **Payment Methods**: 3 (P2P username, QR code, Invoice)
