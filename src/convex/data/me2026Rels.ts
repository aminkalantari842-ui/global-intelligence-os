// ME2026 relationship layer. Every edge carries at least one event whose
// sources cite the S01–S35 registry (evidence rule: no edge without stored
// evidence). Weights/confidence are the deterministic label→value mapping in
// me2026Types.ts — computed at ingest, never at render, never by an LLM.
//
// Parts:
//   MATRIX  — the dataset's 40-entry relationship matrix (10 major actors)
//   BLOCK   — intra-block links from the 4 strategic blocks
//   FLASH   — adversarial/coordination links implied by the 7 flashpoints

import type { Me2026Edge } from "./me2026Types";

// Deterministic label → (kind, weight, confidence) mapping.
// Confidence mirrors the dataset's own "high" marker for the matrix.
const MATRIX_MAP = {
  allied: ["ALLIANCE", 92, 90],
  strategic_partner: ["ALLIANCE", 84, 88],
  security_partner: ["SECURITY_CONSULT", 78, 88],
  treaty_ally_complex: ["ALLIANCE", 80, 85],
  strategic_competition: ["COMPETITION", 76, 86],
  strategic_alignment_not_alliance: ["COOPERATION", 74, 84],
  strategic_partnership: ["COOPERATION", 78, 86],
  competitive_dialogue: ["NEGOTIATION", 52, 80],
  adversarial: ["CONFLICT", 88, 92],
  pragmatic_competition: ["COMPETITION", 60, 82],
  competitive_interdependence: ["INTERDEPENDENCE", 62, 82],
  managed_relations: ["NON_AGGRESSION", 48, 78],
  reconciliation_but_competitive: ["COMPETITION", 52, 80],
  security_contact: ["SECURITY_CONSULT", 44, 76],
  strategic_economic_partner: ["INTERDEPENDENCE", 76, 86],
  energy_coordination: ["INTERDEPENDENCE", 68, 82],
  strategic_rivalry: ["COMPETITION", 78, 84],
  cooperative: ["COOPERATION", 66, 82],
  contentious_mediator_relationship: ["MEDIATION", 46, 72],
  security_coordination: ["SECURITY_CONSULT", 62, 80],
  competitive_pragmatism: ["COMPETITION", 58, 78],
  economic_relationship_with_security_limits: ["INTERDEPENDENCE", 54, 76],
  competitive_cooperation: ["COMPETITION", 64, 80],
  economic_engagement: ["COOPERATION", 56, 76],
  close_partner: ["ALLIANCE", 82, 86],
  pragmatic: ["COOPERATION", 54, 76],
  managed_competition: ["COMPETITION", 50, 76],
  strategic_coordination: ["COOPERATION", 72, 84],
} as const;

export const ME2026_MATRIX: Me2026Edge[] = [
  { s: "USA", t: "ISR", kind: "ALLIANCE", w: 92, summary: "متحد راهبردی: حمایت امنیتی، هم‌افزایی دفاع موشکی و هماهنگی اطلاعاتی.", srcs: ["S01", "S14", "S18", "S25"], type: "AGREEMENT", title: "پیمان امنیتی و کمک‌های دفاعی آمریکا–اسرائیل" },
  { s: "USA", t: "SAU", kind: "ALLIANCE", w: 84, summary: "شراکت راهبردی: امنیت دریایی، دفاع هوایی و هماهنگی انرژی با hedging اقتصادی به سمت چین.", srcs: ["S01", "S03", "S29"], type: "POSTURE", title: "شراکت امنیتی آمریکا–عربستان در جنگ ۲۰۲۶" },
  { s: "USA", t: "QAT", kind: "SECURITY_CONSULT", w: 78, summary: "شراکت امنیتی حول پایگاه الوکره و میانجی‌گری دوحه.", srcs: ["S19", "S24"] },
  { s: "USA", t: "ARE", kind: "ALLIANCE", w: 84, summary: "شراکت راهبردی: دفاع، فناوری و سرمایه؛ امارات همزمان شراکت را متنوع می‌کند.", srcs: ["S03", "S24", "S28"] },
  { s: "USA", t: "TUR", kind: "ALLIANCE", w: 80, summary: "متحد پیمانی ناتو اما با رقابت‌های موردی؛ همکاری و اختلاف هم‌زمان.", srcs: ["S18", "S21"], type: "POSTURE", title: "عضویت ناتو با پیچیدگی موردی" },
  { s: "USA", t: "EGY", kind: "SECURITY_CONSULT", w: 78, summary: "شراکت امنیتی: کمک نظامی، هماهنگی غزه و مرز سینا.", srcs: ["S16", "S32"] },
  { s: "USA", t: "IRN", kind: "CONFLICT", w: 88, summary: "تقابل آشکار: جنگ، تحریم حداکثری و مانورهای نظامی؛ کانال عمانی تنها مسیر باقی‌مانده.", srcs: ["S01", "S07", "S10", "S20"], type: "STRIKE", title: "جنگ ایران–آمریکا و کانال مذاکره عمانی" },
  { s: "USA", t: "RUS", kind: "COMPETITION", w: 76, summary: "رقابت راهبردی ساختاری در انرژی، تسلیحات و نظم منطقه‌ای.", srcs: ["S05", "S22"] },
  { s: "USA", t: "CHN", kind: "COMPETITION", w: 76, summary: "رقابت راهبردی با هم‌گرایی محدود در منا؛ واشنگتن و پکن بیشتر هم‌گرا تا واگرا در منطقه.", srcs: ["S05", "S24"] },
  { s: "IRN", t: "RUS", kind: "COOPERATION", w: 74, summary: "همسویی راهبردی بدون پیمان دفاعی: انرژی، فناوری و هماهنگی ضدتحریم.", srcs: ["S05", "S06", "S14", "S22"] },
  { s: "IRN", t: "CHN", kind: "COOPERATION", w: 78, summary: "شراکت راهبردی اقتصادی: خرید نفت، سرمایه‌گذاری و پوشش دیپلماتیک بریکس.", srcs: ["S05", "S06", "S23"] },
  { s: "IRN", t: "SAU", kind: "NEGOTIATION", w: 52, summary: "گفت‌وگوی رقابتی پس از عادی‌سازی چین‌محور؛ تنش کاسته اما اعتماد دفاعی حداقلی.", srcs: ["S03", "S06"] },
  { s: "IRN", t: "ISR", kind: "CONFLICT", w: 94, summary: "دشمنی فعال: جنگ مستقیم، حذف فرماندهان شبکه و بازدارندگی موشکی/پهپادی.", srcs: ["S09", "S14", "S20"], type: "STRIKE", title: "جنگ ایران–اسرائیل ۲۰۲۶ و بازسازی نظامی" },
  { s: "IRN", t: "TUR", kind: "COMPETITION", w: 60, summary: "رقابت عمل‌گرایانه بر سر نفوذ در سوریه/عراق و قفقاز با روابط کاری.", srcs: ["S21", "S25"] },
  { s: "IRN", t: "ARE", kind: "INTERDEPENDENCE", w: 62, summary: "وابستگی متقابل رقابتی: تجارت و لجستیک در کنار تنش امنیتی.", srcs: ["S03", "S24"] },
  { s: "IRN", t: "QAT", kind: "NON_AGGRESSION", w: 48, summary: "روابط مدیریت‌شده: کانال‌های مالی/دیپلماتیک دوحه و احتیاط متقابل.", srcs: ["S19", "S24"] },
  { s: "SAU", t: "ARE", kind: "ALLIANCE", w: 84, summary: "شراکت راهبردی خلیجی در انرژی، سرمایه و موازنه ایران.", srcs: ["S03", "S19", "S29"] },
  { s: "SAU", t: "QAT", kind: "COMPETITION", w: 52, summary: "آشتی اما با رقابت رسانه‌ای/دیپلماتیک و اختلاف در پرونده‌های منطقه‌ای.", srcs: ["S19", "S29"] },
  { s: "SAU", t: "TUR", kind: "COMPETITION", w: 60, summary: "رقابت عمل‌گرایانه با همکاری دفاعی/سرمایه‌گذاری فزاینده.", srcs: ["S14", "S21"] },
  { s: "SAU", t: "ISR", kind: "SECURITY_CONSULT", w: 44, summary: "تماس امنیتی محدود حول مهار ایران؛ عادی‌سازی رسمی تعلیق در جنگ غزه.", srcs: ["S09", "S25"] },
  { s: "SAU", t: "CHN", kind: "INTERDEPENDENCE", w: 76, summary: "شراکت اقتصادی راهبردی: نفت، زیرساخت و میانجی‌گری پکن در عادی‌سازی.", srcs: ["S05", "S24"] },
  { s: "SAU", t: "RUS", kind: "INTERDEPENDENCE", w: 68, summary: "هماهنگی انرژی در چارچوب اوپک+ در کنار رقابت سهم بازار.", srcs: ["S11", "S14"] },
  { s: "ISR", t: "TUR", kind: "COMPETITION", w: 78, summary: "رقابت راهبردی در سوریه و شرق مدیترانه با تنش دیپلماتیک آشکار.", srcs: ["S21", "S25"] },
  { s: "ISR", t: "ARE", kind: "COOPERATION", w: 66, summary: "همکاری پس از توافق ابراهیم: فناوری، امنیت و سرمایه.", srcs: ["S24", "S28"] },
  { s: "ISR", t: "QAT", kind: "MEDIATION", w: 46, summary: "رابطه پرتنش میانجی‌محور: دوحه کانال حماس و در عین حال محور اختلاف.", srcs: ["S09", "S19"] },
  { s: "ISR", t: "EGY", kind: "SECURITY_CONSULT", w: 62, summary: "هماهنگی امنیتی حول غزه، فیلادلفی و صلح مصر–اسرائیل.", srcs: ["S16", "S32"] },
  { s: "ISR", t: "RUS", kind: "COMPETITION", w: 58, summary: "عمل‌گرایی رقابتی: هماهنگی محدود هوایی سوریه در برابر تقابل راهبردی.", srcs: ["S22", "S25"] },
  { s: "ISR", t: "CHN", kind: "INTERDEPENDENCE", w: 54, summary: "رابطه اقتصادی با سقف امنیتی: سرمایه‌گذاری و فناوری با حساسیت واشنگتن.", srcs: ["S23", "S24"] },
  { s: "TUR", t: "RUS", kind: "COMPETITION", w: 64, summary: "همکاری-رقابت: ترانزیت، انرژی و سوریه در کنار تقابل در قفقاز.", srcs: ["S21", "S22"] },
  { s: "TUR", t: "CHN", kind: "COOPERATION", w: 56, summary: "مشارکت اقتصادی با احتیاط امنیتی حول اویغورها و فناوری.", srcs: ["S05", "S22"] },
  { s: "TUR", t: "QAT", kind: "ALLIANCE", w: 82, summary: "شرکت نزدیک: سرمایه، دفاع و هم‌راستایی سیاسی پایدار.", srcs: ["S19", "S21"] },
  { s: "TUR", t: "ARE", kind: "COOPERATION", w: 54, summary: "عمل‌گرایی پس از آشتی: انرژی، سرمایه و پرونده‌های سوریه/لیبی.", srcs: ["S24", "S28"] },
  { s: "TUR", t: "EGY", kind: "COMPETITION", w: 50, summary: "رقابت مدیریت‌شده در شرق مدیترانه و لیبی با دیپلماسی فزاینده.", srcs: ["S16", "S32"] },
  { s: "EGY", t: "ARE", kind: "ALLIANCE", w: 84, summary: "شراکت راهبردی: بسته‌های نجات مالی، سرمایه‌گذاری و هماهنگی سیاسی.", srcs: ["S24", "S32"] },
  { s: "EGY", t: "QAT", kind: "COOPERATION", w: 66, summary: "همکاری مالی/دیپلماتیک پس از آشتی قاهره–دوحه.", srcs: ["S19", "S24"] },
  { s: "EGY", t: "CHN", kind: "INTERDEPENDENCE", w: 76, summary: "شراکت اقتصادی راهبردی: منطقه آزاد سوئز، زیرساخت و بریکس.", srcs: ["S05", "S24"] },
  { s: "ARE", t: "QAT", kind: "COOPERATION", w: 66, summary: "همکاری-رقابت خلیجی: تجارت و سرمایه در کنار رقابت نفوذ.", srcs: ["S19", "S28"] },
  { s: "ARE", t: "CHN", kind: "INTERDEPENDENCE", w: 76, summary: "شراکت اقتصادی راهبردی: انرژی، فناوری و لجستیک.", srcs: ["S05", "S24"] },
  { s: "QAT", t: "CHN", kind: "INTERDEPENDENCE", w: 76, summary: "شراکت اقتصادی راهبردی: قراردادهای LNG بلندمدت و سرمایه‌گذاری متقابل.", srcs: ["S05", "S19"] },
  { s: "RUS", t: "CHN", kind: "COOPERATION", w: 72, summary: "هماهنگی راهبردی در برابر فشار غرب: انرژی، فناوری و بریکس.", srcs: ["S05", "S06", "S22"] },
] as unknown as Me2026Edge[];

// ─── Strategic blocks (4) — intra-block links ───────────────────────────────
export const ME2026_BLOCK_EDGES: Me2026Edge[] = [
  // بلوک امنیتی غرب‌محور
  { s: "SAU", t: "QAT", kind: "NON_AGGRESSION", w: 56, summary: "بلوک امنیتی غرب‌محور: هم‌صفی در دفاع موشکی خلیج با حفظ خودمختاری سیاسی.", srcs: ["S03", "S19"], type: "MILITARY_EXERCISE", title: "پرچم مشترک دفاع هوایی خلیج" },
  { s: "ARE", t: "BHR", kind: "SECURITY_CONSULT", w: 60, summary: "هماهنگی امنیتی خلیجی حول هرمز و پهپادها.", srcs: ["S03", "S18"] },
  { s: "EU", t: "NATO", kind: "COOPERATION", w: 80, summary: "هم‌افزایی اروپایی: تحریم/دیپلماسی اتحادیه و دفاع جمعی ناتو در جنوب.", srcs: ["S18", "S19"], type: "DIPLOMATIC_SUMMIT", title: "نشست آنکارا ۲۰۲۶: پیوند امنیت جنوب با اروپا" },
  { s: "TUR", t: "NATO", kind: "ALLIANCE", w: 82, summary: "عضویت پیمانی: تورماتو و شرق مدیترانه در چارچوب ناتو.", srcs: ["S18"] },
  // شبکه ایران و بازیگران همسو
  { s: "IRN", t: "HIZB", kind: "PROXY_SUPPORT", w: 84, summary: "ستون بازدارندگی توزیع‌شده: تسلیحات، مالی و راهبرد مشترک مقابل اسرائیل.", srcs: ["S09", "S20", "S25"], type: "TRANSFER", title: "حمایت راهبردی ایران از حزب‌الله در سال خلع سلاح" },
  { s: "IRN", t: "HAM", kind: "PROXY_SUPPORT", w: 74, summary: "حمایت سیاسی/لجستیک از شبکه مقاومت فلسطینی؛ فشار ۲۰۲۶ بر ساختار حماس.", srcs: ["S09", "S25"] },
  { s: "IRN", t: "PIJ", kind: "PROXY_SUPPORT", w: 62, summary: "حمایت مالی/تسلیحاتی از جهاد اسلامی به‌عنوان بازیگر کوچکتر غزه.", srcs: ["S09", "S25"] },
  { s: "IRN", t: "HOU", kind: "PROXY_SUPPORT", w: 78, summary: "حمایت از حوثی‌ها: پهپاد/موشک ضدکشتی و هم‌افزایی دریایی باب‌المندب.", srcs: ["S01", "S03", "S27"], type: "TRANSFER", title: "توان حوثی‌ها در پیشروی باب‌المندب" },
  { s: "IRN", t: "PMF", kind: "PROXY_SUPPORT", w: 76, summary: "شبکه شبه‌نظامیان عراقی: لجستیک، راهبری سیاسی و پهپادها.", srcs: ["S08", "S20"] },
  // همگرایی اقتصادی چین–خلیج
  { s: "CHN", t: "SAU", kind: "INTERDEPENDENCE", w: 76, summary: "موتور همگرایی اقتصادی چین–خلیج: نفت، زیرساخت و پول دیجیتال.", srcs: ["S05", "S24"] },
  { s: "CHN", t: "OMN", kind: "INTERDEPENDENCE", w: 58, summary: "لجستیک بندری و انرژی: موقعیت مسقط در مسیرهای پکن.", srcs: ["S07", "S24"] },
  // محور روسیه–چین–ایران
  { s: "RUS", t: "IRN", kind: "COOPERATION", w: 74, summary: "هماهنگی ضدتحریم و انرژی؛ روسیه هم از جنگ سود می‌برد هم شریکش آسیب می‌بیند.", srcs: ["S05", "S06", "S22"] },
];

// ─── Flashpoints (7) — the adversarial/coordination wiring ──────────────────
export const ME2026_FLASH_EDGES: Me2026Edge[] = [
  // FP01 هرمز
  { s: "IRN", t: "OMN", kind: "MEDIATION", w: 64, summary: "میانجی‌گری مسقط در پرونده هرمز: تفاهم ۱۲ سپتامبر بدون بازگشایی فوری.", srcs: ["S07"], type: "MEETING", title: "گفت‌وگوهای عمان برای مدیریت هرمز" },
  { s: "IRN", t: "KWT", kind: "TENSION", w: 44, summary: "آسیب‌پذیری هرمزی کویت در سایه حملات به کشتی‌ها.", srcs: ["S02", "S10"], type: "STRIKE", title: "حمله به کشتی در تنگه هرمز" },
  { s: "IRN", t: "BHR", kind: "TENSION", w: 50, summary: "حساس‌ترین گلوگاه در سناریوی تشدید ایران–GCC؛ پایگاه ناوگان پنجم.", srcs: ["S02", "S18"] },
  { s: "IRN", t: "CHN", kind: "DEPENDENCY", w: 66, summary: "واردات انرژی چین به شدت وابسته به هرمز؛ شوک مستقیم به زنجیره تأمین پکن.", srcs: ["S23", "S24"] },
  { s: "IRN", t: "IND", kind: "TENSION", w: 46, summary: "ریسک هرمز برای امنیت انرژی هند؛ دهلی‌نو در هر دو سو موازنه می‌کند.", srcs: ["S13", "S30"] },
  { s: "IRN", t: "JPN", kind: "TENSION", w: 40, summary: "آسیب‌پذیری مستقیم ژاپن به اختلال هرمز؛ پاسخ عمدتاً غیرنظامی.", srcs: ["S13", "S23"] },
  { s: "IRN", t: "KOR", kind: "TENSION", w: 40, summary: "وابستگی صنعتی سئول به نفت خلیج و ریسک مسیرهای دریایی.", srcs: ["S13"] },
  // FP02 باب‌المندب
  { s: "HOU", t: "YEM", kind: "CONFLICT", w: 86, summary: "جنگ داخلی: پیشروی حوثی‌ها به پریم و ساحل غربی در برابر دولت/ائتلاف.", srcs: ["S01", "S03", "S27"], type: "SEIZURE", title: "پیشروی حوثی‌ها به جزیره پریم" },
  { s: "HOU", t: "SAU", kind: "CONFLICT", w: 82, summary: "حمله به زیرساخت انرژی سعودی و خط لوله شرق–غرب؛ بازگشت جنگ نیابتی.", srcs: ["S03", "S29"], type: "STRIKE", title: "حمله به خط لوله و زیرساخت انرژی سعودی" },
  { s: "HOU", t: "USA", kind: "CONFLICT", w: 78, summary: "بازدارندگی دریایی آمریکا در برابر حملات به کشتیرانی؛ بند جدید واشنگتن.", srcs: ["S01", "S03"] },
  { s: "HOU", t: "EGY", kind: "TENSION", w: 56, summary: "آسیب درآمد سوئز از مسیردهی مجدد کشتی‌ها و ریسک امنیتی دریای سرخ.", srcs: ["S01", "S16"] },
  { s: "HOU", t: "ARE", kind: "TENSION", w: 58, summary: "رقابت ساحلی/تجاری: تهدید بنادر و مسیرهای امارات.", srcs: ["S03", "S28"] },
  { s: "HOU", t: "EU", kind: "TENSION", w: 54, summary: "عملیات دریایی اروپا و تهدید ناوبری باب‌المندب.", srcs: ["S01", "S16"] },
  // FP03 غزه
  { s: "ISR", t: "HAM", kind: "CONFLICT", w: 92, summary: "نظم پساجنگ غزه: حذف فرماندهان، خلع سلاح و معماری حکمرانی.", srcs: ["S09", "S25"], type: "STRIKE", title: "کشته‌شدن فرمانده ارشد حماس" },
  { s: "PSE", t: "ISR", kind: "TENSION", w: 66, summary: "تشکیلات در رقابت بر سر نمایندگی و معماری پساجنگ غزه.", srcs: ["S09", "S25"] },
  { s: "EGY", t: "HAM", kind: "MEDIATION", w: 52, summary: "میانجی‌گری قاهره در آتش‌بس و حکمرانی غزه.", srcs: ["S16", "S32"] },
  { s: "QAT", t: "HAM", kind: "COOPERATION", w: 58, summary: "کانال مالی/سیاسی دوحه در چانه‌زنی پساجنگ.", srcs: ["S09", "S19"] },
  { s: "UN", t: "PSE", kind: "DEBT_AID", w: 62, summary: "کمک انسانی و پشتیبانی حقوقی سازمان ملل از فلسطینیان.", srcs: ["S16", "S26", "S33"] },
  { s: "UNRWA", t: "PSE", kind: "DEBT_AID", w: 58, summary: "خدمات آنروا به پناهندگان؛ وضعیت مالی آن مستقیماً بر غزه/اردن/لبنان اثر دارد.", srcs: ["S26", "S33"] },
  // FP04 جنوب لبنان
  { s: "HIZB", t: "LBN", kind: "TENSION", w: 70, summary: "پرونده خلع سلاح و انحصار سلاح دولت لبنان در ۲۰۲۶.", srcs: ["S20", "S26"] },
  { s: "ISR", t: "LBN", kind: "TENSION", w: 64, summary: "آزادی عمل هوایی و مرز شمالی در چارچوب آتش‌بس شکننده.", srcs: ["S09", "S26"] },
  { s: "FRA", t: "LBN", kind: "COOPERATION", w: 56, summary: "حمایت فرانسه از حاکمیت لبنان و سازوکار خلع سلاح.", srcs: ["S16", "S25"] },
  { s: "USA", t: "LBN", kind: "DEBT_AID", w: 54, summary: "کمک و پشتیبانی امنیتی واشنگتن برای ارتش لبنان.", srcs: ["S16", "S25"] },
  // FP05 سوریه پساآسد
  { s: "SDF", t: "SYR", kind: "COOPERATION", w: 68, summary: "ادغام SDF در دولت سوریه پس از انحلال رسمی اوت ۲۰۲۶.", srcs: ["S04", "S26"], type: "AGREEMENT", title: "انحلال رسمی SDF و ادغام با دمشق" },
  { s: "TUR", t: "SYR", kind: "COOPERATION", w: 66, summary: "نفوذ آنکارا در گذار سوریه و پرونده کردها.", srcs: ["S21", "S04"] },
  { s: "TUR", t: "PKK", kind: "CONFLICT", w: 78, summary: "عملیات نظامی علیه شبکه PKK در شمال عراق/سوریه.", srcs: ["S21", "S25"], type: "STRIKE", title: "فشار نظامی ترکیه بر شبکه PKK" },
  { s: "SYR", t: "ISIS", kind: "CONFLICT", w: 60, summary: "سلول‌های داعش در برابر دولت گذار و ادغام نیروها.", srcs: ["S17", "S25"] },
  { s: "ISR", t: "SYR", kind: "TENSION", w: 58, summary: "حملات اسرائیل به دارایی‌های نظامی در سوریه پساآسد.", srcs: ["S04", "S25"] },
  { s: "RUS", t: "SYR", kind: "NEGOTIATION", w: 52, summary: "مذاکره بر سر پایگاه‌ها و آینده حضور روسیه در گذار.", srcs: ["S04", "S22"] },
  // FP06 عراق
  { s: "PMF", t: "IRQ", kind: "TENSION", w: 72, summary: "فشار خلع سلاح بر شبه‌نظامیان خارج از انحصار دولت.", srcs: ["S08", "S20"] },
  { s: "PMF", t: "USA", kind: "CONFLICT", w: 66, summary: "حملات پهپادی و تقابل با نیروهای آمریکایی در عراق/سوریه.", srcs: ["S08", "S20"] },
  { s: "IRQ", t: "ISIS", kind: "CONFLICT", w: 64, summary: "بقای عملیات ضدتروریسم در برابر سلول‌های باقی‌مانده.", srcs: ["S17", "S08"] },
  { s: "IRQ", t: "IRN", kind: "INTERDEPENDENCE", w: 62, summary: "وابستگی برق/گاز و تجارت در کنار فشار برای کنترل شبکه‌ها.", srcs: ["S08", "S23"] },
  // FP07 سودان/دریای سرخ
  { s: "EGY", t: "SDN", kind: "TENSION", w: 58, summary: "پناهندگان، آب نیل و امنیت مرزی در جنگ سودان.", srcs: ["S13", "S16"] },
  { s: "ARE", t: "SDN", kind: "COOPERATION", w: 56, summary: "نقش ابوظبی در جنگ سودان و بنادر دریای سرخ.", srcs: ["S13", "S28"] },
  { s: "RUS", t: "SDN", kind: "COOPERATION", w: 50, summary: "پیگیری پایگاه/طلا و نفوذ مسکو در دریای سرخ.", srcs: ["S13", "S22"] },
  { s: "AU", t: "SDN", kind: "MEDIATION", w: 48, summary: "میانجی‌گری آفریقایی در جنگ داخلی سودان.", srcs: ["S16", "S33"] },
  // بلوک‌ها: پیوندهای فرمتی
  { s: "BRICS", t: "CHN", kind: "COOPERATION", w: 72, summary: "پکن پیشران تعمیق بریکس و چارچوب امنیتی جدید منطقه‌ای.", srcs: ["S05", "S06"], type: "DIPLOMATIC_SUMMIT", title: "بیانیه مشترک بریکس: خویشتن‌داری حداکثری در منا" },
  { s: "BRICS", t: "IRN", kind: "COOPERATION", w: 58, summary: "عضویت ایران در بریکس؛ پوشش سیاسی در برابر فشار غرب.", srcs: ["S05", "S06"] },
  { s: "GCC", t: "SAU", kind: "COOPERATION", w: 74, summary: "آزمون امنیت جمعی GCC در جنگ ۲۰۲۶.", srcs: ["S03", "S06", "S19"] },
  { s: "GCC", t: "IRN", kind: "TENSION", w: 62, summary: "تقابل امنیتی GCC–ایران در هرمز با اختلاف رویکرد اعضا.", srcs: ["S02", "S03"] },
  { s: "OPECPLUS", t: "SAU", kind: "COOPERATION", w: 70, summary: "مدیریت عرضه/قیمت در شوک جنگ؛ اختلال تقاضا و عرضه هم‌زمان.", srcs: ["S11", "S14"] },
  { s: "OPECPLUS", t: "RUS", kind: "COOPERATION", w: 68, summary: "هماهنگی انرژی مسکو–ریاض در چارچوب اوپک+.", srcs: ["S11", "S14"] },
  { s: "ARAB", t: "PSE", kind: "COOPERATION", w: 54, summary: "حمایت سیاسی اتحادیه عرب از پرونده فلسطین.", srcs: ["S06", "S16"] },
  { s: "OIC", t: "PSE", kind: "COOPERATION", w: 50, summary: "دیپلماسی هنجاری سازمان همکاری اسلامی حول فلسطین.", srcs: ["S06", "S16"] },
  { s: "IRB", t: "SYR", kind: "NEGOTIATION", w: 50, summary: "فرمت سه‌جانبه در پرونده سوریه: تعامل مسکو–آنکارا–تهران بر گذار اثر می‌گذارد.", srcs: ["S04", "S21", "S25"] },
  { s: "GULF_SWF", t: "SAU", kind: "DEPENDENCY", w: 60, summary: "شبکه صندوق‌های ثروت خلیج به درآمد نفت و وابسته است و اهرم نفوذ اقتصادی می‌سازد.", srcs: ["S14", "S29"] },
  { s: "ARAMCO", t: "SAU", kind: "INTERDEPENDENCE", w: 82, summary: "هسته انرژی سعودی: خط لوله شرق–غرب و صادرات آسیا در مرکز ریسک ۲۰۲۶.", srcs: ["S03", "S14"] },
  { s: "ADNOC", t: "ARE", kind: "INTERDEPENDENCE", w: 78, summary: "هسته انرژی ابوظبی: LNG و تنوع مسیر صادرات.", srcs: ["S03", "S28"] },
  { s: "PIF", t: "SAU", kind: "DEPENDENCY", w: 76, summary: "بازوی سرمایه‌ای Vision 2030؛ تبدیل نفت به نفوذ.", srcs: ["S14", "S29"] },
  { s: "USDEF", t: "USA", kind: "SUPPLY", w: 74, summary: "صادرکننده اول سلاح به منطقه؛ وابسته به مجوز صادرات واشنگتن.", srcs: ["S14", "S15"], type: "TRANSFER", title: "چرخه تسلیحاتی منطقه بر پایه صادرات آمریکا" },
  { s: "EUDEF", t: "EU", kind: "SUPPLY", w: 58, summary: "صنعت دفاعی اروپا با مجوزهای سخت‌گیرانه‌تر و سهم بازار فزاینده.", srcs: ["S14", "S15"] },
  { s: "IMF", t: "EGY", kind: "DEBT_AID", w: 62, summary: "پشتیبانی کلان اقتصادی صندوق در بحران ارزی/بدهی مصر.", srcs: ["S11", "S12"] },
  { s: "WB", t: "SYR", kind: "DEBT_AID", w: 50, summary: "تامین مالی بازسازی و مقاومت اقتصادی در گذار سوریه.", srcs: ["S13", "S35"] },
  { s: "WTO", t: "CHN", kind: "COOPERATION", w: 44, summary: "قواعد تجاری و اثر تحریم‌ها بر مسیرهای تجارت منطقه.", srcs: ["S05", "S06"] },
  { s: "OPCW", t: "SYR", kind: "SECURITY_CONSULT", w: 40, summary: "کارکرد راستی‌آزمایی OPCW در پرونده سلاح شیمیایی سوریه ادامه دارد.", srcs: ["S16", "S25"] },
  { s: "NATO", t: "RUS", kind: "TENSION", w: 76, summary: "تقابل ساختاری ناتو–روسیه با بازتاب در مدیترانه و جنوب.", srcs: ["S18", "S22"] },
  { s: "NATO", t: "QAT", kind: "SECURITY_CONSULT", w: 56, summary: "شراکت جنوبی ناتو: همبستگی با شرکای خلیجی.", srcs: ["S18", "S19"], type: "DIPLOMATIC_SUMMIT", title: "بازدید نماینده ویژه ناتو از قطر" },
  { s: "GBR", t: "USA", kind: "ALLIANCE", w: 78, summary: "اتحاد ویژه: دریایی، اطلاعاتی و پایگاه‌های خلیج.", srcs: ["S01", "S14"] },
  { s: "FRA", t: "EU", kind: "COOPERATION", w: 62, summary: "پیشران استقلال راهبردی اروپا و حضور مدیترانه‌ای.", srcs: ["S14", "S18"] },
  { s: "DEU", t: "EU", kind: "COOPERATION", w: 64, summary: "وزن اقتصادی آلمان و بازآرایی دفاعی اروپا.", srcs: ["S14", "S15"] },
  { s: "ITA", t: "LBY", kind: "COOPERATION", w: 54, summary: "حلقه انرژی/مهاجرت رم–طرابلس در مدیترانه.", srcs: ["S15", "S16"] },
  { s: "TUR", t: "LBY", kind: "COOPERATION", w: 56, summary: "پیوند آنکارا–طرابلس در انرژی و موازنه شرق مدیترانه.", srcs: ["S16", "S21"] },
  { s: "AZE", t: "TUR", kind: "ALLIANCE", w: 74, summary: "یک ملت دو دولت: انرژی، کریدور و هم‌راستایی امنیتی.", srcs: ["S21", "S25"] },
  { s: "AZE", t: "ARM", kind: "TENSION", w: 60, summary: "صلح شکننده پس از قره‌باغ با اختلاف مرزی باقی‌مانده.", srcs: ["S21", "S25"] },
  { s: "ARM", t: "IRN", kind: "COOPERATION", w: 48, summary: "کریدور حیاتی ایران–ارمنستان در تحریم‌های قفقاز.", srcs: ["S21", "S25"] },
  { s: "AFG", t: "PAK", kind: "TENSION", w: 56, summary: "تنش مرزی دیورند و بحران اخراج پناهندگان.", srcs: ["S16", "S25"] },
  { s: "DZA", t: "MAR", kind: "TENSION", w: 62, summary: "قطع روابط بر سر صحرا و رقابت منطقه‌ای مکتوب.", srcs: ["S13", "S25"] },
  { s: "MAR", t: "ISR", kind: "COOPERATION", w: 48, summary: "عادی‌سازی و همکاری امنیتی/فناوری.", srcs: ["S13", "S25"] },
  { s: "SDN", t: "ARE", kind: "COOPERATION", w: 52, summary: "نقش ابوظبی در جنگ سودان و بنادر دریای سرخ.", srcs: ["S13", "S28"] },
  { s: "SDN", t: "SAU", kind: "COOPERATION", w: 50, summary: "میانجی‌گری ریاض و پیوند ساحل/حجاریک.", srcs: ["S13", "S27"] },
  { s: "UN", t: "SYR", kind: "DEBT_AID", w: 48, summary: "چارچوب انسانی/سیاسی ملل متحد در گذار سوریه.", srcs: ["S16", "S26"] },
  { s: "UN", t: "YEM", kind: "DEBT_AID", w: 50, summary: "پرونده انسانی یمن و گزارش‌های نتایج کشور.", srcs: ["S27", "S33"] },
  { s: "IAEA", t: "IRN", kind: "SECURITY_CONSULT", w: 52, summary: "مرجع راستی‌آزمایی فنی هسته‌ای؛ داده‌های آژانس مبنای ارزیابی اشاعه.", srcs: ["S16", "S20"] },
];
