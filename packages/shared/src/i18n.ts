/**
 * UI translations for the admin console.
 *
 * Lives in `shared` so the API can label things the same way the console does
 * (import templates, validation messages) rather than the two drifting apart.
 *
 * Arabic is the first non-English locale because the first vertical is Egyptian
 * schools, whose staff work in Arabic while the guardians already receive Arabic
 * messages. Adding a locale means adding a column to DICTIONARY — nothing else.
 */

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Locales that read right-to-left. Drives `dir` on the document. */
const RTL_LOCALES: Locale[] = ['ar'];

export const isRtl = (locale: Locale): boolean => RTL_LOCALES.includes(locale);
export const dirFor = (locale: Locale): 'rtl' | 'ltr' => (isRtl(locale) ? 'rtl' : 'ltr');

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

type Entry = Record<Locale, string>;

/**
 * Keys are grouped by screen. Values may contain {placeholders} filled by `t`.
 */
export const DICTIONARY = {
  // --- chrome ---------------------------------------------------------------
  'app.name': { en: 'SendWhats', ar: 'SendWhats' },
  'nav.dashboard': { en: 'Dashboard', ar: 'الرئيسية' },
  'nav.campaigns': { en: 'Campaigns', ar: 'الحملات' },
  'nav.templates': { en: 'Templates', ar: 'القوالب' },
  'nav.import': { en: 'Import', ar: 'استيراد' },
  'nav.whatsapp': { en: 'WhatsApp', ar: 'واتساب' },
  'nav.team': { en: 'Team', ar: 'الفريق' },
  'nav.analytics': { en: 'Analytics', ar: 'التقارير' },
  'nav.activity': { en: 'Activity', ar: 'السجل' },
  'nav.organizations': { en: 'Organizations', ar: 'المؤسسات' },
  'nav.signOut': { en: 'Sign out', ar: 'تسجيل الخروج' },

  // --- common ---------------------------------------------------------------
  'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },
  'common.save': { en: 'Save', ar: 'حفظ' },
  'common.saving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'common.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'common.delete': { en: 'Delete', ar: 'حذف' },
  'common.edit': { en: 'Edit', ar: 'تعديل' },
  'common.add': { en: 'Add', ar: 'إضافة' },
  'common.open': { en: 'Open', ar: 'فتح' },
  'common.search': { en: 'Search', ar: 'بحث' },
  'common.status': { en: 'Status', ar: 'الحالة' },
  'common.name': { en: 'Name', ar: 'الاسم' },
  'common.email': { en: 'Email', ar: 'البريد الإلكتروني' },
  'common.password': { en: 'Password', ar: 'كلمة المرور' },
  'common.phone': { en: 'Phone', ar: 'رقم الهاتف' },
  'common.description': { en: 'Description', ar: 'الوصف' },
  'common.message': { en: 'Message', ar: 'الرسالة' },
  'common.actions': { en: 'Actions', ar: 'إجراءات' },
  'common.previous': { en: 'Previous', ar: 'السابق' },
  'common.next': { en: 'Next', ar: 'التالي' },
  'common.page': { en: 'Page {page} of {pages}', ar: 'صفحة {page} من {pages}' },
  'common.total': { en: '{count} total', ar: 'الإجمالي {count}' },
  'common.none': { en: '—', ar: '—' },
  'common.any': { en: 'Any', ar: 'الكل' },
  'common.active': { en: 'active', ar: 'نشط' },
  'common.inactive': { en: 'inactive', ar: 'غير نشط' },
  'common.yes': { en: 'Yes', ar: 'نعم' },
  'common.no': { en: 'No', ar: 'لا' },
  'common.never': { en: 'never', ar: 'أبداً' },
  'common.somethingWrong': { en: 'Something went wrong', ar: 'حدث خطأ ما' },

  // --- login ----------------------------------------------------------------
  'login.title': { en: 'Sign in', ar: 'تسجيل الدخول' },
  'login.subtitle': { en: 'SendWhats broadcast console', ar: 'لوحة تحكم الرسائل الجماعية' },
  'login.submit': { en: 'Sign in', ar: 'دخول' },
  'login.submitting': { en: 'Signing in…', ar: 'جارٍ الدخول…' },
  'login.failed': { en: 'Login failed', ar: 'فشل تسجيل الدخول' },

  // --- dashboard ------------------------------------------------------------
  'dashboard.workspace': { en: '{label} workspace', ar: 'مساحة عمل {label}' },
  'dashboard.whatsappConnection': { en: 'WhatsApp connection', ar: 'اتصال واتساب' },
  'dashboard.noNumber': { en: 'No number linked yet', ar: 'لم يتم ربط رقم بعد' },
  'dashboard.manageConnection': { en: 'Manage connection', ar: 'إدارة الاتصال' },
  'dashboard.connectNumber': { en: 'Connect a number', ar: 'ربط رقم' },
  'dashboard.templates': { en: 'Message templates', ar: 'قوالب الرسائل' },
  'dashboard.default': { en: 'default', ar: 'افتراضي' },
  'dashboard.sendsTo': { en: 'sends to: {target}', ar: 'يُرسل إلى: {target}' },

  // --- groups ---------------------------------------------------------------
  'groups.addButton': { en: 'Add {label}', ar: 'إضافة {label}' },
  'groups.nameLabel': { en: '{label} name', ar: 'اسم {label}' },
  'groups.deleteConfirm': {
    en: 'Delete {name}? Its {contacts} are kept but ungrouped.',
    ar: 'حذف {name}؟ سيتم الاحتفاظ بـ{contacts} بدون مجموعة.',
  },
  'groups.empty': { en: 'No {label} yet.', ar: 'لا توجد {label} بعد.' },

  // --- contacts -------------------------------------------------------------
  'contacts.addButton': { en: 'Add {label}', ar: 'إضافة {label}' },
  'contacts.searchPlaceholder': { en: 'Name or phone', ar: 'الاسم أو رقم الهاتف' },
  'contacts.allGroups': { en: 'All {label}', ar: 'كل {label}' },
  'contacts.consent': { en: 'Consent', ar: 'الموافقة' },
  'contacts.consentConfirmed': { en: 'Consent confirmed at registration', ar: 'تم تأكيد الموافقة عند التسجيل' },
  'contacts.selected': { en: '{count} selected', ar: 'تم اختيار {count}' },
  'contacts.activate': { en: 'Activate', ar: 'تفعيل' },
  'contacts.deactivate': { en: 'Deactivate', ar: 'إلغاء التفعيل' },
  'contacts.noMatches': { en: 'No {label} match these filters.', ar: 'لا توجد {label} مطابقة لهذه الفلاتر.' },
  'contacts.editTitle': { en: 'Edit {label}', ar: 'تعديل {label}' },
  'contacts.addTitle': { en: 'Add {label}', ar: 'إضافة {label}' },
  'contacts.fullName': { en: 'Full name', ar: 'الاسم الكامل' },
  'contacts.deleteConfirm': { en: 'Delete {count} {label}?', ar: 'حذف {count} {label}؟' },

  // --- campaigns ------------------------------------------------------------
  'campaigns.new': { en: 'New campaign', ar: 'حملة جديدة' },
  'campaigns.untitled': { en: 'Untitled campaign', ar: 'حملة بدون عنوان' },
  'campaigns.recipients': { en: 'Recipients', ar: 'المستلمون' },
  'campaigns.created': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'campaigns.empty': { en: 'No campaigns yet.', ar: 'لا توجد حملات بعد.' },
  'campaigns.step.target': { en: 'Target', ar: 'الجمهور' },
  'campaigns.step.compose': { en: 'Compose', ar: 'الرسالة' },
  'campaigns.step.review': { en: 'Review', ar: 'المراجعة' },
  'campaigns.recipientCount': { en: 'recipients', ar: 'مستلم' },
  'campaigns.recipientCountOne': { en: 'recipient', ar: 'مستلم' },
  'campaigns.matched': { en: '{count} {label} matched', ar: 'تم مطابقة {count} {label}' },
  'campaigns.excluded': { en: '{count} excluded', ar: 'تم استبعاد {count}' },
  'campaigns.sharedNumbers': {
    en: '{count} share a number with another recipient',
    ar: '{count} يشتركون في نفس الرقم مع مستلم آخر',
  },
  'campaigns.whoReceives': { en: 'Who receives this?', ar: 'من سيستلم هذه الرسالة؟' },
  'campaigns.wholeOrg': { en: 'Whole {label}', ar: 'كل {label}' },
  'campaigns.selectedGroups': { en: 'Selected {label}', ar: '{label} المحددة' },
  'campaigns.handPicked': { en: 'Hand-picked {label}', ar: '{label} محددون يدوياً' },
  'campaigns.nameOptional': { en: 'Campaign name (optional)', ar: 'اسم الحملة (اختياري)' },
  'campaigns.template': { en: 'Template', ar: 'القالب' },
  'campaigns.attachments': { en: 'Attachments', ar: 'المرفقات' },
  'campaigns.addFile': { en: 'Add file', ar: 'إضافة ملف' },
  'campaigns.preview': { en: 'Preview', ar: 'معاينة' },
  'campaigns.nextCompose': { en: 'Next: compose', ar: 'التالي: كتابة الرسالة' },
  'campaigns.nextReview': { en: 'Next: review', ar: 'التالي: المراجعة' },
  'campaigns.back': { en: 'Back', ar: 'رجوع' },
  'campaigns.saveCampaign': { en: 'Save campaign', ar: 'حفظ الحملة' },
  'campaigns.sendNow': { en: 'Send now', ar: 'إرسال الآن' },
  'campaigns.queueing': { en: 'Queueing…', ar: 'جارٍ الإضافة للطابور…' },
  'campaigns.pause': { en: 'Pause', ar: 'إيقاف مؤقت' },
  'campaigns.resume': { en: 'Resume', ar: 'استئناف' },
  'campaigns.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'campaigns.schedule': { en: 'Schedule', ar: 'جدولة' },
  'campaigns.sendLater': { en: 'Or send later', ar: 'أو الإرسال لاحقاً' },
  'campaigns.cancelSchedule': { en: 'Cancel schedule', ar: 'إلغاء الجدولة' },
  'campaigns.scheduledFor': { en: 'Scheduled for {when}.', ar: 'مجدولة في {when}.' },
  'campaigns.processed': { en: '{done} of {total} processed', ar: 'تمت معالجة {done} من {total}' },
  'campaigns.sendsTo': { en: 'Sends to', ar: 'يُرسل إلى' },
  'campaigns.excludedFromSend': { en: 'Excluded from this send', ar: 'مستبعدون من هذا الإرسال' },
  'campaigns.noRecipients': {
    en: 'This selection resolves to no reachable recipients',
    ar: 'هذا الاختيار لا ينتج عنه أي مستلمين يمكن الوصول إليهم',
  },

  // --- templates ------------------------------------------------------------
  'templates.title': { en: 'Message templates', ar: 'قوالب الرسائل' },
  'templates.newTemplate': { en: 'New template', ar: 'قالب جديد' },
  'templates.editTemplate': { en: 'Edit “{name}”', ar: 'تعديل «{name}»' },
  'templates.body': { en: 'Body', ar: 'نص القالب' },
  'templates.sendTo': { en: 'Send to', ar: 'الإرسال إلى' },
  'templates.makeDefault': {
    en: 'Use this template by default for new campaigns',
    ar: 'استخدام هذا القالب افتراضياً للحملات الجديدة',
  },
  'templates.create': { en: 'Create template', ar: 'إنشاء القالب' },
  'templates.saveChanges': { en: 'Save changes', ar: 'حفظ التعديلات' },
  'templates.sampleMessage': { en: 'Sample campaign message', ar: 'نموذج لنص الحملة' },
  'templates.typeBody': { en: 'Type a body to see it rendered.', ar: 'اكتب نص القالب لمعاينته.' },

  // --- team -----------------------------------------------------------------
  'team.title': { en: 'Team', ar: 'الفريق' },
  'team.addUser': { en: 'Add user', ar: 'إضافة مستخدم' },
  'team.adding': { en: 'Adding…', ar: 'جارٍ الإضافة…' },
  'team.role': { en: 'Role', ar: 'الصلاحية' },
  'team.owner': { en: 'Owner', ar: 'مالك' },
  'team.staff': { en: 'Staff', ar: 'موظف' },
  'team.tempPassword': { en: 'Temporary password', ar: 'كلمة مرور مؤقتة' },
  'team.lastSignedIn': { en: 'Last signed in', ar: 'آخر دخول' },
  'team.makeOwner': { en: 'Make owner', ar: 'ترقية إلى مالك' },
  'team.makeStaff': { en: 'Make staff', ar: 'تحويل إلى موظف' },
  'team.resetPassword': { en: 'Reset password', ar: 'إعادة تعيين كلمة المرور' },
  'team.disable': { en: 'Disable', ar: 'تعطيل' },
  'team.enable': { en: 'Enable', ar: 'تفعيل' },
  'team.remove': { en: 'Remove', ar: 'إزالة' },
  'team.you': { en: 'you', ar: 'أنت' },
  'team.disabled': { en: 'disabled', ar: 'معطل' },
  'team.readOnly': {
    en: 'You are signed in as staff, so this list is read-only.',
    ar: 'أنت مسجل الدخول كموظف، لذا هذه القائمة للعرض فقط.',
  },

  // --- whatsapp -------------------------------------------------------------
  'whatsapp.title': { en: 'WhatsApp connection', ar: 'اتصال واتساب' },
  'whatsapp.refresh': { en: 'Refresh status', ar: 'تحديث الحالة' },
  'whatsapp.checking': { en: 'Checking…', ar: 'جارٍ الفحص…' },
  'whatsapp.connect': { en: 'Connect WhatsApp', ar: 'ربط واتساب' },
  'whatsapp.showQr': { en: 'Show QR code', ar: 'عرض رمز QR' },
  'whatsapp.requestingQr': { en: 'Requesting QR…', ar: 'جارٍ طلب الرمز…' },
  'whatsapp.replaceNumber': { en: 'Replace number', ar: 'تغيير الرقم' },
  'whatsapp.logout': { en: 'Log out', ar: 'فصل الرقم' },
  'whatsapp.provision': { en: 'Provision instance', ar: 'تجهيز الاتصال' },
  'whatsapp.scanTitle': { en: 'Scan with WhatsApp', ar: 'امسح الرمز بواتساب' },
  'whatsapp.scanStep1': {
    en: 'Open WhatsApp on the phone that owns the sending number.',
    ar: 'افتح واتساب على الهاتف صاحب رقم الإرسال.',
  },
  'whatsapp.scanStep2': {
    en: 'Go to Settings → Linked devices → Link a device.',
    ar: 'اذهب إلى الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.',
  },
  'whatsapp.scanStep3': { en: 'Point the camera at this code.', ar: 'وجّه الكاميرا نحو هذا الرمز.' },
  'whatsapp.waitingScan': {
    en: 'Waiting for the scan… this page updates itself.',
    ar: 'في انتظار المسح… ستتحدث الصفحة تلقائياً.',
  },
  'whatsapp.limits': { en: 'Sending limits', ar: 'حدود الإرسال' },
  'whatsapp.perMinute': { en: 'Messages per minute', ar: 'رسائل في الدقيقة' },
  'whatsapp.perDay': { en: 'Messages per day', ar: 'رسائل في اليوم' },
  'whatsapp.saveLimits': { en: 'Save limits', ar: 'حفظ الحدود' },
  'whatsapp.ownerOnly': { en: 'Only an owner can change these.', ar: 'المالك فقط يمكنه تغيير هذه الإعدادات.' },
  'whatsapp.status.not_provisioned': { en: 'Not provisioned', ar: 'غير مُجهز' },
  'whatsapp.status.provisioned': { en: 'Ready to connect', ar: 'جاهز للربط' },
  'whatsapp.status.connecting': { en: 'Waiting for scan', ar: 'في انتظار المسح' },
  'whatsapp.status.connected': { en: 'Connected', ar: 'متصل' },
  'whatsapp.status.disconnected': { en: 'Disconnected', ar: 'غير متصل' },
  'whatsapp.status.error': { en: 'Error', ar: 'خطأ' },

  // --- import ---------------------------------------------------------------
  'import.title': { en: 'Import {label}', ar: 'استيراد {label}' },
  'import.downloadTemplate': { en: 'Download template', ar: 'تحميل النموذج' },
  'import.uploadSheet': { en: 'Upload filled sheet', ar: 'رفع الملف المعبأ' },
  'import.working': { en: 'Working…', ar: 'جارٍ العمل…' },
  'import.defaultGroup': { en: 'Default {label}', ar: '{label} الافتراضية' },
  'import.createMissing': { en: 'Create missing {label}', ar: 'إنشاء {label} غير الموجودة' },
  'import.discard': { en: 'Discard', ar: 'تجاهل' },
  'import.importRows': { en: 'Import {count} rows', ar: 'استيراد {count} صف' },
  'import.row': { en: 'Row', ar: 'الصف' },
  'import.action': { en: 'Action', ar: 'الإجراء' },
  'import.notes': { en: 'Notes', ar: 'ملاحظات' },
  'import.complete': { en: 'Import complete', ar: 'اكتمل الاستيراد' },

  // --- analytics ------------------------------------------------------------
  'analytics.title': { en: 'Analytics', ar: 'التقارير' },
  'analytics.subtitle': {
    en: 'Sending performance over the last {days} days.',
    ar: 'أداء الإرسال خلال آخر {days} يوم.',
  },
  'analytics.campaigns': { en: 'Campaigns', ar: 'الحملات' },
  'analytics.messages': { en: 'Messages', ar: 'الرسائل' },
  'analytics.reached': { en: 'Reached WhatsApp', ar: 'وصلت إلى واتساب' },
  'analytics.failed': { en: 'Failed', ar: 'فشلت' },
  'analytics.delivered': { en: 'Delivered', ar: 'تم التسليم' },
  'analytics.read': { en: 'Read', ar: 'تمت القراءة' },
  'analytics.whenSent': { en: 'When messages go out', ar: 'أوقات الإرسال' },
  'analytics.busiestHour': {
    en: 'Busiest hour: {hour}:00 ({count} messages)',
    ar: 'أكثر ساعة نشاطاً: {hour}:00 ({count} رسالة)',
  },
  'analytics.nothingSent': { en: 'Nothing sent in this period yet.', ar: 'لم يتم إرسال شيء في هذه الفترة.' },
  'analytics.topFailures': { en: 'Most common failures', ar: 'أكثر أسباب الفشل شيوعاً' },
  'analytics.awaitingReceipts': { en: 'Awaiting receipts', ar: 'في انتظار إشعارات التسليم' },
  'analytics.noCampaigns': { en: 'No campaigns in this period.', ar: 'لا توجد حملات في هذه الفترة.' },


  // --- organizations (super admin) -----------------------------------------
  'orgs.title': { en: 'Organizations', ar: 'المؤسسات' },
  'orgs.onboard': { en: 'Onboard an organization', ar: 'إضافة مؤسسة جديدة' },
  'orgs.type': { en: 'Type', ar: 'النوع' },
  'orgs.countryCode': { en: 'Country dialling code', ar: 'رمز الدولة' },
  'orgs.ownerEmail': { en: 'Owner email', ar: 'بريد المالك' },
  'orgs.ownerPassword': { en: 'Owner password', ar: 'كلمة مرور المالك' },
  'orgs.create': { en: 'Create organization', ar: 'إنشاء المؤسسة' },
  'orgs.creating': { en: 'Creating…', ar: 'جارٍ الإنشاء…' },
  'orgs.users': { en: 'Users', ar: 'المستخدمون' },
  'orgs.groups': { en: 'Groups', ar: 'المجموعات' },
  'orgs.contacts': { en: 'Contacts', ar: 'جهات الاتصال' },
  'orgs.suspend': { en: 'Suspend', ar: 'إيقاف' },
  'orgs.activate': { en: 'Activate', ar: 'تفعيل' },
  'orgs.suspended': { en: 'suspended', ar: 'موقوفة' },
  'orgs.empty': { en: 'No organizations yet.', ar: 'لا توجد مؤسسات بعد.' },
  'orgs.superAdminOnly': { en: 'Super admin access required.', ar: 'مطلوب صلاحية مدير المنصة.' },

  // --- confirmations --------------------------------------------------------
  'confirm.deleteGroup': {
    en: 'Delete {name}? Its {label} are kept but ungrouped.',
    ar: 'حذف {name}؟ سيتم الاحتفاظ بـ{label} بدون مجموعة.',
  },
  'confirm.deleteContacts': { en: 'Delete {count} {label}?', ar: 'حذف {count} من {label}؟' },
  'confirm.deleteTemplate': { en: 'Delete the “{name}” template?', ar: 'حذف القالب «{name}»؟' },
  'confirm.removeUser': {
    en: 'Remove {email}? They lose access immediately.',
    ar: 'إزالة {email}؟ سيفقد صلاحية الدخول فوراً.',
  },
  'confirm.newPassword': {
    en: 'New password for {email} (at least 8 characters)',
    ar: 'كلمة مرور جديدة لـ {email} (٨ أحرف على الأقل)',
  },
  'confirm.cancelCampaign': {
    en: 'Cancel this campaign? Unsent messages will not go out.',
    ar: 'إلغاء هذه الحملة؟ لن تُرسل الرسائل المتبقية.',
  },
  'confirm.deleteCampaign': {
    en: 'Delete this campaign and its prepared messages?',
    ar: 'حذف هذه الحملة والرسائل المجهزة بها؟',
  },
  'confirm.logout': {
    en: 'Disconnect this WhatsApp number? Campaigns cannot send until it is reconnected.',
    ar: 'فصل رقم واتساب هذا؟ لن ترسل الحملات حتى يعاد ربطه.',
  },
  'confirm.replaceNumber': {
    en: 'Disconnect the current number and show a QR for a new one?',
    ar: 'فصل الرقم الحالي وعرض رمز QR لرقم جديد؟',
  },

  // --- explanatory copy -----------------------------------------------------
  'help.whatsapp': {
    en: 'Link the number this {label} sends from. Scanning is a one-time step — the connection stays live until the number is logged out or replaced.',
    ar: 'اربط الرقم الذي ترسل منه {label}. المسح يتم مرة واحدة — يبقى الاتصال قائماً حتى يتم فصل الرقم أو استبداله.',
  },
  'help.limits': {
    en: 'Caps for this number. Leave empty to use the platform defaults. Lower is safer — WhatsApp flags numbers that send in bursts.',
    ar: 'حدود هذا الرقم. اتركها فارغة لاستخدام الإعدادات الافتراضية. الأقل أأمن — واتساب يحظر الأرقام التي ترسل دفعات كبيرة.',
  },
  'help.import': {
    en: 'Download the template for this {label}, fill it in, and upload it. Nothing is saved until you confirm the preview.',
    ar: 'حمّل النموذج الخاص بـ{label}، املأه، ثم ارفعه. لا يتم حفظ أي شيء حتى تؤكد المعاينة.',
  },
  'help.templates': {
    en: 'A template wraps the message an admin types — the greeting, the {label} name, and which number it goes to.',
    ar: 'القالب يغلّف الرسالة التي يكتبها المسؤول — التحية، واسم {label}، والرقم الذي تُرسل إليه.',
  },
  'help.team': {
    en: 'Who can sign in to this {label}. Staff manage contacts, imports and campaigns. Owners can also manage the team, the WhatsApp connection and the sending limits.',
    ar: 'من يمكنه الدخول إلى {label}. الموظفون يديرون جهات الاتصال والاستيراد والحملات. المالكون يديرون أيضاً الفريق واتصال واتساب وحدود الإرسال.',
  },
  'help.composer': {
    en: 'Choose who receives it, write the message, review exactly what will be sent.',
    ar: 'اختر من سيستلمها، اكتب الرسالة، وراجع بالضبط ما سيتم إرساله.',
  },
  'help.draft': {
    en: "Prepared but not sent. Sending paces messages with a randomized gap and respects this number's rate caps, so a large campaign takes a while by design.",
    ar: 'تم التجهيز دون إرسال. يتم الإرسال بفواصل زمنية عشوائية مع احترام حدود الرقم، لذا تستغرق الحملات الكبيرة وقتاً بشكل مقصود.',
  },
  'help.scheduleTimezone': {
    en: "Uses this device's time zone. The recipient list is already fixed, so scheduling sends to exactly the people listed below.",
    ar: 'يستخدم توقيت هذا الجهاز. قائمة المستلمين ثابتة بالفعل، لذا ستُرسل الجدولة إلى الأشخاص المذكورين أدناه بالضبط.',
  },
  'help.awaitingReceipts': {
    en: 'No delivery receipts have arrived yet, so delivered and read are shown as “—” rather than 0% — the messages may well have arrived.',
    ar: 'لم تصل إشعارات التسليم بعد، لذا يظهر التسليم والقراءة كـ«—» بدلاً من ٪٠ — قد تكون الرسائل وصلت بالفعل.',
  },

  // --- activity -------------------------------------------------------------
  'activity.title': { en: 'Activity', ar: 'سجل النشاط' },
  'activity.when': { en: 'When', ar: 'الوقت' },
  'activity.who': { en: 'Who', ar: 'المستخدم' },
  'activity.what': { en: 'What', ar: 'الإجراء' },
  'activity.details': { en: 'Details', ar: 'التفاصيل' },
  'activity.system': { en: 'system', ar: 'النظام' },
  'activity.empty': { en: 'Nothing recorded yet.', ar: 'لا يوجد نشاط مسجل بعد.' },
} satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof DICTIONARY;

/**
 * Looks up a key and fills {placeholders}. Falls back to English, then to the key
 * itself, so a missing translation degrades to readable text rather than blank UI.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const entry = DICTIONARY[key] as Entry | undefined;
  const template = entry?.[locale] ?? entry?.[DEFAULT_LOCALE] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}

/** Arabic-Indic digits, for dates and counts when the locale calls for them. */
export function localizeDigits(value: string | number, locale: Locale): string {
  const text = String(value);
  if (locale !== 'ar') return text;
  return text.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}
