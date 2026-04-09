/**
 * @repo/icons
 *
 * Platform-agnostic icon registry.
 *
 * SVG assets live in `@repo/icons/assets/<category>/<file>.svg`.
 *
 * Platform consumers:
 *   - Mobile (React Native): metro.config.js + react-native-svg-transformer
 *     import HomeIcon from '@repo/icons/assets/home/Home.svg';
 *
 *   - Web (Next.js): @svgr/webpack in next.config.ts
 *     import HomeIcon from '@repo/icons/assets/home/Home.svg';
 *
 * The `IconName` type is the shared contract — import it from this package
 * so web and mobile registries stay in sync.
 */

export type IconName =
  // Navigation
  | 'home'
  | 'home-plain'
  | 'search'
  | 'menu'
  | 'menu-grid'
  | 'setting'
  | 'notification'
  | 'notification-dot'
  | 'time'
  | 'bookmark'
  // Arrows
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-send'
  | 'circle-arrow-right'
  | 'circle-arrow-up'
  | 'circle-arrow-down'
  | 'small-arrow-right'
  | 'refresh'
  | 'transaction'
  // Payments
  | 'credit-card'
  | 'credit-card-check'
  | 'credit-card-send'
  | 'credit-card-get'
  | 'receipt'
  | 'receipt-simple'
  | 'wallet'
  | 'dollar'
  | 'naira'
  // Users
  | 'user'
  | 'user-circle'
  | 'user-add'
  | 'user-check'
  | 'user-search'
  | 'group'
  // Actions
  | 'plus'
  | 'plus-circle'
  | 'minus'
  | 'cross'
  | 'cross-circle'
  | 'check'
  | 'check-circle'
  | 'edit'
  | 'delete'
  | 'share'
  | 'download'
  | 'filter'
  | 'flag'
  // Communication
  | 'message'
  | 'envelope'
  | 'phone'
  | 'support'
  // Security
  | 'shield'
  | 'lock'
  | 'lock-open'
  | 'fingerprint'
  | 'face-id'
  | 'key'
  | 'eye'
  | 'eye-off'
  | 'id'
  // Scanning
  | 'scan'
  | 'nfc'
  | 'network'
  | 'link'
  // Status
  | 'info'
  | 'warning'
  | 'question'
  | 'forbid'
  | 'target'
  // Analytics
  | 'chart'
  | 'chart-bar'
  | 'report'
  | 'log-out'
  // Misc
  | 'calendar'
  | 'location'
  | 'cloud'
  | 'device'
  | 'bulb'
  | 'sun'
  | 'moon';

export const iconNames: IconName[] = [
  'home', 'home-plain', 'search', 'menu', 'menu-grid', 'setting',
  'notification', 'notification-dot', 'time', 'bookmark',
  'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down', 'arrow-send',
  'circle-arrow-right', 'circle-arrow-up', 'circle-arrow-down',
  'small-arrow-right', 'refresh', 'transaction',
  'credit-card', 'credit-card-check', 'credit-card-send', 'credit-card-get',
  'receipt', 'receipt-simple', 'wallet', 'dollar', 'naira',
  'user', 'user-circle', 'user-add', 'user-check', 'user-search', 'group',
  'plus', 'plus-circle', 'minus', 'cross', 'cross-circle',
  'check', 'check-circle', 'edit', 'delete', 'share', 'download',
  'filter', 'flag',
  'message', 'envelope', 'phone', 'support',
  'shield', 'lock', 'lock-open', 'fingerprint', 'face-id', 'key',
  'eye', 'eye-off', 'id',
  'scan', 'nfc', 'network', 'link',
  'info', 'warning', 'question', 'forbid', 'target',
  'chart', 'chart-bar', 'report', 'log-out',
  'calendar', 'location', 'cloud', 'device', 'bulb', 'sun', 'moon',
];
