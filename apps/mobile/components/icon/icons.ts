/**
 * Icon registry — maps semantic icon names to SVG asset imports from @repo/icons.
 *
 * Adding a new icon:
 *   1. Drop the SVG into packages/icons/assets/<category>/
 *   2. Add an entry below: iconName: require('@repo/icons/assets/category/file.svg')
 *   3. Add the name to @repo/icons/src/index.ts (IconName type + iconNames array)
 *
 * All SVGs are transformed by react-native-svg-transformer via metro.config.js.
 */
import type { IconName } from "@repo/icons";

// ── Navigation ───────────────────────────────────────────────────────────────
import HomeIcon from "@repo/icons/assets/home/Home.svg";
import HomePlainIcon from "@repo/icons/assets/home/Home-plain.svg";
import SearchIcon from "@repo/icons/assets/search/magnifier-search.svg";
import MenuIcon from "@repo/icons/assets/menu/horizontal-lines.svg";
import MenuGridIcon from "@repo/icons/assets/menu/grid-layout.svg";
import SettingIcon from "@repo/icons/assets/setting/settings-cog.svg";
import NotificationIcon from "@repo/icons/assets/notification/bell-notifications.svg";
import NotificationDotIcon from "@repo/icons/assets/notification/bell-notifications-dot.svg";
import TimeIcon from "@repo/icons/assets/time/clock-time-arrow.svg";
import BookmarkIcon from "@repo/icons/assets/bookmark/save-bookmark.svg";

// ── Arrows ───────────────────────────────────────────────────────────────────
import ArrowLeftIcon from "@repo/icons/assets/arrow/arrow-left.svg";
import ArrowRightIcon from "@repo/icons/assets/arrow/arrow-right.svg";
import ArrowUpIcon from "@repo/icons/assets/arrow/arrow-up.svg";
import ArrowDownIcon from "@repo/icons/assets/arrow/arrow-down.svg";
import ArrowSendIcon from "@repo/icons/assets/arrow/send-right-arrow.svg";
import CircleArrowRightIcon from "@repo/icons/assets/arrow/circle-arrow-right.svg";
import CircleArrowUpIcon from "@repo/icons/assets/arrow/circle-arrow-up.svg";
import CircleArrowDownIcon from "@repo/icons/assets/arrow/circle-arrow-down.svg";
import RefreshIcon from "@repo/icons/assets/arrow/refresh.svg";
import TransactionIcon from "@repo/icons/assets/arrow/arrow-transaction-left-right.svg";
import SmallArrowRightIcon from "@repo/icons/assets/arrow/small-arrow-right.svg";

// ── Payments & Finance ────────────────────────────────────────────────────────
import CreditCardIcon from "@repo/icons/assets/payment/credit-cards.svg";
import CreditCardCheckIcon from "@repo/icons/assets/payment/credit-card-check-done.svg";
import CreditCardSendIcon from "@repo/icons/assets/payment/credit-card-smartphone-send.svg";
import CreditCardGetIcon from "@repo/icons/assets/payment/credit-card-smartphone-get.svg";
import ReceiptIcon from "@repo/icons/assets/payment/receipt.svg";
import ReceiptSimpleIcon from "@repo/icons/assets/payment/payments-finance-receipt-simple.svg";
import WalletIcon from "@repo/icons/assets/hugeicons_wallet-05.svg";
import DollarIcon from "@repo/icons/assets/currency/dollar.svg";
import NairaIcon from "@repo/icons/assets/currency/naira.svg";

// ── Users ─────────────────────────────────────────────────────────────────────
import UserIcon from "@repo/icons/assets/user/user-profile.svg";
import UserCircleIcon from "@repo/icons/assets/user/user-circle.svg";
import UserAddIcon from "@repo/icons/assets/user/user-profile-add-plus.svg";
import UserCheckIcon from "@repo/icons/assets/user/user-profile-check.svg";
import UserSearchIcon from "@repo/icons/assets/user/user-profile-search.svg";
import GroupIcon from "@repo/icons/assets/user/group-user.svg";

// ── Actions ───────────────────────────────────────────────────────────────────
import PlusIcon from "@repo/icons/assets/plus/add-plus.svg";
import PlusCircleIcon from "@repo/icons/assets/plus/add-cirlce-plus.svg";
import MinusIcon from "@repo/icons/assets/minus/minus-circle.svg";
import CrossIcon from "@repo/icons/assets/cross/cross-remove-close.svg";
import CrossCircleIcon from "@repo/icons/assets/cross/cross-circle-remove-close.svg";
import CheckIcon from "@repo/icons/assets/check/checkmark.svg";
import CheckCircleIcon from "@repo/icons/assets/check/check-circle.svg";
import EditIcon from "@repo/icons/assets/edit/edit-pen.svg";
import DeleteIcon from "@repo/icons/assets/delete/delete-remove-cross.svg";
import ShareIcon from "@repo/icons/assets/share/share.svg";
import DownloadIcon from "@repo/icons/assets/download/download.svg";
import FilterIcon from "@repo/icons/assets/filter.svg";
import FlagIcon from "@repo/icons/assets/flag.svg";

// ── Communication ─────────────────────────────────────────────────────────────
import MessageIcon from "@repo/icons/assets/message/chat-messages-bubble-plain.svg";
import EnvelopeIcon from "@repo/icons/assets/envelope/email-mail-envelope.svg";
import PhoneIcon from "@repo/icons/assets/phone/phone-call-plain.svg";
import SupportIcon from "@repo/icons/assets/support/headphone-customer-support.svg";

// ── Security & Identity ───────────────────────────────────────────────────────
import ShieldIcon from "@repo/icons/assets/security/shield-protection-secure-check.svg";
import LockIcon from "@repo/icons/assets/security/lock-close.svg";
import LockOpenIcon from "@repo/icons/assets/security/lock-open.svg";
import FingerprintIcon from "@repo/icons/assets/security/fingerprint.svg";
import FaceIdIcon from "@repo/icons/assets/security/face-id-bio.svg";
import KeyIcon from "@repo/icons/assets/security/key-simple.svg";
import EyeIcon from "@repo/icons/assets/eye/eye-open-show-visible.svg";
import EyeOffIcon from "@repo/icons/assets/eye/eye-closed-remove.svg";
import IdIcon from "@repo/icons/assets/id/batch.svg";

// ── Scanning & Connectivity ───────────────────────────────────────────────────
import ScanIcon from "@repo/icons/assets/scan/shopping-ecommerce-qr.svg";
import NfcIcon from "@repo/icons/assets/nfc/signals.svg";
import NetworkIcon from "@repo/icons/assets/network/wifi-network-internet.svg";
import LinkIcon from "@repo/icons/assets/link/link.svg";

// ── Status & Feedback ─────────────────────────────────────────────────────────
import InfoIcon from "@repo/icons/assets/info/info-circle.svg";
import WarningIcon from "@repo/icons/assets/warning/warning-triangle.svg";
import QuestionIcon from "@repo/icons/assets/question/ask-circle.svg";
import ForbidIcon from "@repo/icons/assets/forbid/forbidden-remove-circle.svg";
import TargetIcon from "@repo/icons/assets/target/target.svg";

// ── Analytics & Reporting ─────────────────────────────────────────────────────
import ChartIcon from "@repo/icons/assets/analytics/chart-line-increase.svg";
import ChartBarIcon from "@repo/icons/assets/analytics/chart-column.svg";
import ReportIcon from "@repo/icons/assets/report/doc-page-paper.svg";
import LogOutIcon from "@repo/icons/assets/log/logout-arrow.svg";

// ── Misc ──────────────────────────────────────────────────────────────────────
import CalendarIcon from "@repo/icons/assets/calendar/calendar-schedule.svg";
import LocationIcon from "@repo/icons/assets/location/location-pin.svg";
import CloudIcon from "@repo/icons/assets/cloud/cloud-storage.svg";
import DeviceIcon from "@repo/icons/assets/device/mobile-phone.svg";
import BulbIcon from "@repo/icons/assets/bulb/light-bulb.svg";
import SunIcon from "@repo/icons/assets/theme/weather-sun.svg";
import MoonIcon from "@repo/icons/assets/theme/weather-moon.svg";

export const icons: Record<IconName, React.ComponentType<any>> = {
  // Navigation
  home: HomeIcon,
  "home-plain": HomePlainIcon,
  search: SearchIcon,
  menu: MenuIcon,
  "menu-grid": MenuGridIcon,
  setting: SettingIcon,
  notification: NotificationIcon,
  "notification-dot": NotificationDotIcon,
  time: TimeIcon,
  bookmark: BookmarkIcon,

  // Arrows
  "arrow-left": ArrowLeftIcon,
  "arrow-right": ArrowRightIcon,
  "arrow-up": ArrowUpIcon,
  "arrow-down": ArrowDownIcon,
  "arrow-send": ArrowSendIcon,
  "circle-arrow-right": CircleArrowRightIcon,
  "circle-arrow-up": CircleArrowUpIcon,
  "circle-arrow-down": CircleArrowDownIcon,
  "small-arrow-right": SmallArrowRightIcon,
  refresh: RefreshIcon,
  transaction: TransactionIcon,

  // Payments
  "credit-card": CreditCardIcon,
  "credit-card-check": CreditCardCheckIcon,
  "credit-card-send": CreditCardSendIcon,
  "credit-card-get": CreditCardGetIcon,
  receipt: ReceiptIcon,
  "receipt-simple": ReceiptSimpleIcon,
  wallet: WalletIcon,
  dollar: DollarIcon,
  naira: NairaIcon,

  // Users
  user: UserIcon,
  "user-circle": UserCircleIcon,
  "user-add": UserAddIcon,
  "user-check": UserCheckIcon,
  "user-search": UserSearchIcon,
  group: GroupIcon,

  // Actions
  plus: PlusIcon,
  "plus-circle": PlusCircleIcon,
  minus: MinusIcon,
  cross: CrossIcon,
  "cross-circle": CrossCircleIcon,
  check: CheckIcon,
  "check-circle": CheckCircleIcon,
  edit: EditIcon,
  delete: DeleteIcon,
  share: ShareIcon,
  download: DownloadIcon,
  filter: FilterIcon,
  flag: FlagIcon,

  // Communication
  message: MessageIcon,
  envelope: EnvelopeIcon,
  phone: PhoneIcon,
  support: SupportIcon,

  // Security
  shield: ShieldIcon,
  lock: LockIcon,
  "lock-open": LockOpenIcon,
  fingerprint: FingerprintIcon,
  "face-id": FaceIdIcon,
  key: KeyIcon,
  eye: EyeIcon,
  "eye-off": EyeOffIcon,
  id: IdIcon,

  // Scanning
  scan: ScanIcon,
  nfc: NfcIcon,
  network: NetworkIcon,
  link: LinkIcon,

  // Status
  info: InfoIcon,
  warning: WarningIcon,
  question: QuestionIcon,
  forbid: ForbidIcon,
  target: TargetIcon,

  // Analytics
  chart: ChartIcon,
  "chart-bar": ChartBarIcon,
  report: ReportIcon,
  "log-out": LogOutIcon,

  // Misc
  calendar: CalendarIcon,
  location: LocationIcon,
  cloud: CloudIcon,
  device: DeviceIcon,
  bulb: BulbIcon,
  sun: SunIcon,
  moon: MoonIcon,
};

export type { IconName };
