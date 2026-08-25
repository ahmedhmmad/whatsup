import { DEFAULT_LOCALE, LOCALES, type Locale } from './i18n';

/**
 * Messages the API produces, translated at the response boundary.
 *
 * Keyed by the English text rather than a symbolic code — the gettext approach.
 * The trade-off is deliberate: no churn across every `badRequest()` call site, and
 * an untranslated message still reaches the user in English instead of a raw key.
 * The cost is that editing an English message drops its translation until this
 * table is updated, which is why every lookup falls back rather than throwing.
 */
const MESSAGES: Record<string, Partial<Record<Locale, string>>> = {
  // --- auth ---
  'Invalid email or password': { ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
  'Invalid or expired token': { ar: 'الجلسة غير صالحة أو منتهية' },
  'Authentication required': { ar: 'يجب تسجيل الدخول' },
  'Current password is incorrect': { ar: 'كلمة المرور الحالية غير صحيحة' },
  'You do not have access to this resource': { ar: 'ليس لديك صلاحية للوصول إلى هذا المورد' },
  'Only the organization owner can do this': { ar: 'المالك فقط يمكنه تنفيذ هذا الإجراء' },
  'User is not attached to an organization': { ar: 'المستخدم غير مرتبط بأي مؤسسة' },
  'Organization is suspended': { ar: 'المؤسسة موقوفة' },
  'This organization is suspended': { ar: 'هذه المؤسسة موقوفة' },
  'Super admins must specify an organization (orgId)': {
    ar: 'يجب على مدير المنصة تحديد المؤسسة (orgId)',
  },

  // --- not found ---
  'Not found': { ar: 'غير موجود' },
  'Route not found': { ar: 'المسار غير موجود' },
  'Organization not found': { ar: 'المؤسسة غير موجودة' },
  'Group not found': { ar: 'المجموعة غير موجودة' },
  'Contact not found': { ar: 'جهة الاتصال غير موجودة' },
  'Campaign not found': { ar: 'الحملة غير موجودة' },
  'Template not found': { ar: 'القالب غير موجود' },
  'Template not found in this organization': { ar: 'القالب غير موجود في هذه المؤسسة' },
  'Import batch not found': { ar: 'عملية الاستيراد غير موجودة' },
  'Pending import batch not found': { ar: 'لا توجد عملية استيراد قيد الانتظار' },
  'User not found in this organization': { ar: 'المستخدم غير موجود في هذه المؤسسة' },
  'File not found': { ar: 'الملف غير موجود' },

  // --- users & organizations ---
  'A user with this email already exists': { ar: 'يوجد مستخدم بهذا البريد الإلكتروني بالفعل' },
  'This organization needs at least one active owner': {
    ar: 'يجب أن يكون للمؤسسة مالك واحد نشط على الأقل',
  },
  'You cannot remove your own account': { ar: 'لا يمكنك حذف حسابك الخاص' },

  // --- contacts & groups ---
  'Contact validation failed': { ar: 'فشل التحقق من بيانات جهة الاتصال' },
  'Group does not belong to this organization': { ar: 'المجموعة لا تتبع هذه المؤسسة' },
  'The selected group does not belong to this organization': {
    ar: 'المجموعة المختارة لا تتبع هذه المؤسسة',
  },
  'Phone number is missing or malformed': { ar: 'رقم الهاتف مفقود أو غير صحيح' },
  'Phone is required': { ar: 'رقم الهاتف مطلوب' },
  'Name is required': { ar: 'الاسم مطلوب' },
  'No phone number': { ar: 'لا يوجد رقم هاتف' },

  // --- import ---
  'No file uploaded': { ar: 'لم يتم رفع أي ملف' },
  'That file could not be read as an .xlsx workbook': {
    ar: 'تعذّرت قراءة الملف كملف Excel بصيغة xlsx',
  },
  'The workbook has no sheets': { ar: 'الملف لا يحتوي على أي أوراق عمل' },

  // --- campaigns & sending ---
  'This selection resolves to no reachable recipients': {
    ar: 'هذا الاختيار لا ينتج عنه أي مستلمين يمكن الوصول إليهم',
  },
  'This campaign has no messages left to send': { ar: 'لا توجد رسائل متبقية في هذه الحملة' },
  'Only draft campaigns can be edited': { ar: 'يمكن تعديل الحملات في وضع المسودة فقط' },
  'Only a paused campaign can be resumed': { ar: 'يمكن استئناف الحملات الموقوفة مؤقتاً فقط' },
  'This campaign is not scheduled': { ar: 'هذه الحملة غير مجدولة' },
  'Pick a time in the future, or send now': { ar: 'اختر وقتاً في المستقبل، أو أرسل الآن' },
  'Pause or cancel this campaign before deleting it': { ar: 'أوقف الحملة أو ألغِها قبل حذفها' },
  'Make another template the default before deleting this one': {
    ar: 'اجعل قالباً آخر افتراضياً قبل حذف هذا القالب',
  },

  // --- skip reasons shown next to excluded recipients ---
  'No destination number': { ar: 'لا يوجد رقم للإرسال إليه' },
  'Consent not confirmed': { ar: 'لم يتم تأكيد الموافقة' },
  'Same number as an earlier recipient': { ar: 'نفس رقم مستلم سابق' },

  // --- whatsapp ---
  'This organization has no WhatsApp instance yet': { ar: 'لا يوجد اتصال واتساب لهذه المؤسسة بعد' },
  'Evolution API is not configured (set EVOLUTION_API_URL and EVOLUTION_API_KEY)': {
    ar: 'لم يتم ضبط خادم واتساب (EVOLUTION_API_URL و EVOLUTION_API_KEY)',
  },
  'Instance no longer exists on the Evolution server': {
    ar: 'لم يعد هذا الاتصال موجوداً على خادم واتساب',
  },
  'No WhatsApp instance is provisioned': { ar: 'لم يتم تجهيز اتصال واتساب' },

  // --- generic ---
  'Internal server error': { ar: 'خطأ داخلي في الخادم' },
  'Request validation failed': { ar: 'فشل التحقق من صحة الطلب' },

  // --- status words ------------------------------------------------------
  // Statuses travel in API payloads and appear both inside sentences ("A draft
  // campaign cannot be paused") and alone on badges, so they live here and are
  // reachable from both sides through the same lookup.
  draft: { ar: 'مسودة' },
  scheduled: { ar: 'مجدولة' },
  queued: { ar: 'في الطابور' },
  running: { ar: 'قيد الإرسال' },
  paused: { ar: 'متوقفة مؤقتاً' },
  completed: { ar: 'مكتملة' },
  cancelled: { ar: 'ملغاة' },
  failed: { ar: 'فشلت' },
  sending: { ar: 'جارٍ الإرسال' },
  sent: { ar: 'أُرسلت' },
  delivered: { ar: 'تم التسليم' },
  read: { ar: 'تمت القراءة' },
  pending: { ar: 'قيد الانتظار' },
  committed: { ar: 'تم التنفيذ' },
  active: { ar: 'نشط' },
  inactive: { ar: 'غير نشط' },
  create: { ar: 'إنشاء' },
  update: { ar: 'تحديث' },
  skip: { ar: 'تخطٍ' },
  error: { ar: 'خطأ' },
  owner: { ar: 'مالك' },
  staff: { ar: 'موظف' },

  // Instance states, which reach the UI with underscores already stripped.
  connected: { ar: 'متصل' },
  connecting: { ar: 'جارٍ الاتصال' },
  disconnected: { ar: 'غير متصل' },
  provisioned: { ar: 'جاهز للربط' },
  'not provisioned': { ar: 'غير مُجهز' },
  not_provisioned: { ar: 'غير مُجهز' },
};

/**
 * Messages that carry a value: each matches the English text and rebuilds it in
 * the target locale with the captured pieces translated in turn, so a nested
 * message like `Gender: Gender is required` comes out fully Arabic.
 */
const PATTERNS: { pattern: RegExp; ar: string }[] = [
  { pattern: /^"(.+)" is not a valid phone number$/, ar: '"$1" ليس رقم هاتف صالح' },
  { pattern: /^(.+) must be one of: (.+)$/, ar: '$1 يجب أن يكون أحد الخيارات: $2' },
  { pattern: /^(.+) must be a number$/, ar: '$1 يجب أن يكون رقماً' },
  { pattern: /^(.+) is required$/, ar: '$1 مطلوب' },
  { pattern: /^(.+) is empty$/, ar: '$1 فارغ' },
  { pattern: /^A (.+) campaign cannot be sent$/, ar: 'لا يمكن إرسال حملة حالتها "$1"' },
  { pattern: /^A (.+) campaign cannot be paused$/, ar: 'لا يمكن إيقاف حملة حالتها "$1"' },
  { pattern: /^A (.+) campaign cannot be scheduled$/, ar: 'لا يمكن جدولة حملة حالتها "$1"' },
  { pattern: /^This campaign is already (.+)$/, ar: 'هذه الحملة بالفعل في حالة "$1"' },
  { pattern: /^This import was already (.+)$/, ar: 'عملية الاستيراد هذه بالفعل في حالة "$1"' },
  { pattern: /^Duplicate of row (\d+) in this file$/, ar: 'مكرر مع الصف $1 في هذا الملف' },
  { pattern: /^(.+) "(.+)" will be created$/, ar: 'سيتم إنشاء $1 "$2"' },
  { pattern: /^(.+) "(.+)" does not exist$/, ar: '$1 "$2" غير موجود' },
  {
    pattern: /^The sheet is missing required column\(s\): (.+)$/,
    ar: 'الملف تنقصه أعمدة مطلوبة: $1',
  },
  { pattern: /^Column "(.+)" is required$/, ar: 'العمود "$1" مطلوب' },
  { pattern: /^A record with this (.+) already exists$/, ar: 'يوجد سجل بنفس "$1" بالفعل' },
  {
    pattern: /^Connect a WhatsApp number before sending — this one is (.+)$/,
    ar: 'اربط رقم واتساب قبل الإرسال — الحالة الحالية: $1',
  },
  { pattern: /^WhatsApp number is (.+)$/, ar: 'رقم واتساب في حالة: $1' },
  { pattern: /^Rate cap of (\d+)\/minute reached for this number$/, ar: 'تم بلوغ الحد: $1 رسالة في الدقيقة لهذا الرقم' },
  { pattern: /^Daily cap of (\d+) reached for this number$/, ar: 'تم بلوغ الحد اليومي: $1 رسالة لهذا الرقم' },
  { pattern: /^(.+): (.+)$/, ar: '$1: $2' },
];

/** Translates a message the API produced, falling back to the original text. */
export function translateServerMessage(locale: Locale, message: string): string {
  if (locale === DEFAULT_LOCALE || !message) return message;

  const exact = MESSAGES[message]?.[locale];
  if (exact) return exact;

  for (const { pattern, ar } of PATTERNS) {
    const match = message.match(pattern);
    if (!match) continue;
    if (locale !== 'ar') break;
    return ar.replace(/\$(\d)/g, (_full, index: string) =>
      // Captured pieces are themselves messages ("Gender", "Guardian phone").
      translateServerMessage(locale, match[Number(index)] ?? ''),
    );
  }

  return message;
}

/** Picks the best supported locale out of an Accept-Language header. */
export function localeFromHeader(header: string | undefined | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(',')) {
    const base = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if ((LOCALES as readonly string[]).includes(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}
