<div align="center">

# EDAS · نظام الأرشفة الإلكترونية للوثائق

**Electronic Document Archiving System**

منصّة عربية أولًا (RTL) لأرشفة الوثائق المؤسسية وتصنيفها واحتفاظها وبحثها واعتمادها — واجهة React وخادم NestJS.

**اللغة / Language:** [العربية](#ar) · [English](#en)

![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Keycloak](https://img.shields.io/badge/Keycloak-26-4D4D4D?logo=keycloak&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-S3-C72E49?logo=minio&logoColor=white)

</div>

---

<a name="ar"></a>

## 📌 العربية

> **الحالة: نموذج أوّلي (prototype / demo).** بدون متغيّرات بيئة الـ API يعمل تطبيق React بمصادقة وهمية وحفظ محلي في `localStorage`. ومع ضبطها يتم الدخول عبر Keycloak، وتُقرأ وتُكتب الوثائق والمجلدات وقوائم الصلاحيات وسلة المحذوفات من خادم NestJS + PostgreSQL في `api/`. بقية المجالات ما زالت وهمية — راجع [حدود النسخة التجريبية](#ar-limits).

### 🧭 نظرة عامة

| المجال | ما هو مُنفَّذ فعليًا |
| --- | --- |
| **الوثائق** | إنشاء، تعديل، نسخ جديدة، نقل وأرشفة، حجز/إفراج (checkout/checkin)، حذف/استعادة/إتلاف نهائي، توقيع، إعلان سجل |
| **التصنيف والصلاحيات** | شجرة مجلدات، قواعد ACL لكل مجلد (`USER` / `ROLE` / `DEPARTMENT` × `VIEW\|CREATE\|EDIT\|DELETE\|APPROVE\|EXPORT`)، نطاق القسم، مصفوفة أدوار في `packages/shared` |
| **الاعتماد والاحتفاظ** | سلاسل اعتماد وقرارات، سياسات احتفاظ وبنودها وتنفيذ الإتلاف، حجز قانوني، مهام وإشعارات |
| **البحث والتقارير** | بحث متقدّم، بحوث محفوظة، تقارير مجدولة وتشغيل يدوي وتصدير CSV وExcel وPDF عربي (RTL بخط أميري) |
| **المعاينة والتنزيل** | معاينة داخلية لـ PDF والصور وOffice وDXF وDWG عبر الخادم، وتنزيل بروابط مؤقتة موقّعة — دون كشف MinIO |
| **الهوية والتدقيق** | Keycloak (authorization code + PKCE) بجلسة `httpOnly` وCSRF، وسجل تدقيق متسلسل بـ hash لكل تعديل |

### 🧱 حزمة التقنيات

| الطبقة | التقنيات |
| --- | --- |
| **الواجهة** | React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 (RTL، فاتح/داكن) · React Router 7 (HashRouter) |
| **المكوّنات والرسوم** | Recharts · lucide-react · pdfjs-dist · dxf-viewer |
| **الاختبارات** | Vitest · Testing Library · jsdom · Playwright (اختبار دخان بمتصفح) |
| **الخادم (`api/`)** | NestJS 11 · Prisma 6 · PostgreSQL · Keycloak (OIDC/JWKS) · MinIO (S3) |
| **البناء** | حزمة إنتاج مقسّمة (vendor + تحميل كسول للمعاينات والمسارات)، وبناء ملف واحد عبر `vite-plugin-singlefile` للعرض دون اتصال |

### ⚡ البدء السريع

المتطلبات: **Node.js 20.19+ أو 22.12+** وnpm وDocker Desktop.

```bash
npm install
npm run dev:all   # يشغّل PostgreSQL + Keycloak + MinIO + API ثم الواجهة على http://localhost:5173
```

`npm run stack:down` يوقف حاويات الخادم، و`Ctrl+C` يوقف الواجهة.

**تشغيل الخادم منفصلًا (بدون Docker للـ API):**

```bash
# مرة واحدة من جذر المستودع
npm install && npm run shared:build
cd api && npm install && npx prisma generate

# الحزمة المحلية كاملة (PostgreSQL + Keycloak + MinIO + API)
docker compose up -d

# أو تشغيل الـ API مباشرة (يحتاج Postgres وKeycloak يعملان)
cd api && npm run start:dev

# تهيئة دليل المؤسسة (إدارات، أقسام، موظفون، مشاريع، مجموعات، مجلدات،
# سياسات احتفاظ، سلاسل اعتماد، إعدادات) — عملية تكرارية آمنة
cd api && npx prisma migrate deploy && npm run prisma:seed

# 20 وثيقة تجريبية عبر مسار الرفع الحقيقي (presign → PUT → register → create)
npm run demo:seed              # من الجذر؛ يحتاج API + Keycloak + MinIO
npm run demo:seed -- --clean   # حذفها مرة أخرى (تحمل الوسم demo-seed)

# إصلاح الوثائق التي انحرف قسمها المخزّن عن مجلدها
cd api && npm run build && npm run maintenance:reconcile-departments -- --apply
```

### 🔌 ربط الواجهة بالـ API

الواجهة تعمل في وضع النموذج المحلي حتى تُضبط متغيّرات `VITE_` التالية. انسخ [`.env.example`](.env.example) إلى `.env.local`:

| المتغيّر | مثال | الغرض |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000` | أصل الـ API (المسارات تحت `/api/v1`) |
| `VITE_OIDC_ISSUER` | `http://localhost:8080/realms/edas` | الـ realm المستخدم لتسجيل الدخول |
| `VITE_OIDC_CLIENT_ID` | `edas-web` | عميل PKCE عام من استيراد الـ realm |

عند الضبط يعرض `/login` زر Keycloak واحدًا يوجّه المتصفح إلى `/api/v1/auth/login`، ثم ينفّذ **الخادم** تبادل authorization code + PKCE في `/api/v1/auth/callback`، ويحفظ رموز OIDC في صفّ `UserSession`، ويسلّم الواجهة **كوكي جلسة `httpOnly`** (`edas_session`) وكوكي CSRF مقروءًا (`edas_csrf`) يجب إعادته في ترويسة `x-csrf-token` مع كل طلب معدِّل. الواجهة لا تخزّن أي رمز، وتستعيد الملف الشخصي من `/auth/me` عند الإقلاع، وتستدعي `/auth/logout` لإنهاء جلسة Keycloak. ويقوم `src/lib/role-bridge.ts` بمطابقة أدوار الـ API وإجراءات ACL على نموذج الأدوار والصلاحيات في الواجهة.

يحتاج الخادم إلى `APP_BASE_URL` (أصل الواجهة للعودة إليها) وإلى `SESSION_SECRET` ثابت (32 حرفًا فأكثر) يختم الرموز المخزّنة — نفس القيمة على كل نسخة. سجّل عنوان العودة (`<API>/api/v1/auth/callback`) في Keycloak، وراجع [`api/.env.example`](api/.env.example) لـ `SESSION_TTL_SECONDS` و`SESSION_COOKIE_SECURE` و`SESSION_COOKIE_SAMESITE`.

**نطاق الكتابة عبر الـ API:** المجلدات وقواعد الوصول والوثائق والنسخ والرفع وسلة المحذوفات وبنود الاحتفاظ والحجز القانوني ومهام سير العمل والإشعارات وسجل التدقيق والبحوث المحفوظة ودليل المؤسسة (قراءة/كتابة) والمجموعات وحسابات المستخدمين وسياسات الاحتفاظ وسلاسل الاعتماد (تُعدَّل خطواتها ما دام لا توجد نسخة معلّقة) والإعدادات وأرقام لوحة المعلومات والتقارير وجدولتها وسجل تشغيلها. أما حسابات المستخدمين (إنشاء، تعديل، قفل/فتح، حذف، إعادة تعيين كلمة المرور) فتُنسَخ إلى Keycloak عبر Admin API (الأدوار، حالة التمكين، كلمة المرور، الإجراءات المطلوبة، إنهاء الجلسات) ثم يُحدَّث صفّ قاعدة البيانات ويُسجَّل الحدث في التدقيق.

**قاعدة البيانات:** تغييرات المخطّط تُشحن كترحيلات Prisma في `api/prisma/migrations`، ويطبّقها `docker compose` بـ `prisma migrate deploy` عند الإقلاع؛ محليًا `cd api && npx prisma migrate deploy` (أو `npm run prisma:migrate` أثناء التطوير). قاعدة أُنشئت سابقًا بـ `db push` تحتاج تثبيتًا لمرة واحدة: `npx prisma migrate resolve --applied 20261022000000_init`. ويتحقّق الـ API من متغيّرات البيئة المطلوبة ويرفض أصول CORS ذات العلامات العامة عندما `NODE_ENV=production`.

### 🔐 الأمان والصلاحيات

- التحقق من رموز Keycloak (RS256 عبر JWKS) وتنفيذ RBAC على الخادم، لا في المتصفح.
- فحص حالة الحساب في كل طلب، فالمستخدم المقفل أو المعطّل يُرفض حتى لو كان رمزه ما زال صالحًا.
- مصفوفة الصلاحيات مصدرها الوحيد `packages/shared` (`ROLE_CAPABILITIES`، `isGlobalRole`، `USER_ROLES`) وتستهلكها الواجهة والـ API معًا.
- كل عملية تعديل تكتب صفًّا في سجل تدقيق متسلسل بـ hash وغير قابل للتعديل.
- الـ realm في `infra/keycloak/realm-edas.json` للتطوير فقط (مستخدمو `admin`/`manager`/`employee` بكلمة مرور = اسم المستخدم، وعميل `edas-cli` يسمح بـ password grant للسكربتات و`npm run e2e`). عميل المتصفح `edas-web` لا يسمح بـ password grant ويقبل authorization code + PKCE فقط. الإنتاج يستورد realm خاصًا به ويبدّل كل بيانات الاعتماد — راجع [`infra/keycloak/README.md`](infra/keycloak/README.md).

### 👁️ المعاينة والتنزيل

صفحة المعاينة (`/documents/:id/preview`) تبثّ الأصل أو نسخة محوّلة من `/api/v1/preview/files/:id/content` عبر الخادم، فيبقى MinIO خاصًا دون أي سياسة حاوية. المعاينة تتطلّب `VIEW` على وثيقة مرتبطة، أما تنزيل الأصل (`/files/:id/download`) فيتطلّب `EXPORT` إضافةً إلى ذلك، فلا تكفي صلاحية عرض لجلب الملف.

- الفتحات الناجحة والرفض تُضاف إلى سلسلة التدقيق مرة واحدة لكل فاعل وملف ونوع خلال خمس دقائق (طلبات `Range` كانت ستُسلسل السجل المتسلسل).
- الاستجابات تحمل `Content-Disposition: inline` و`X-Content-Type-Options: nosniff` و`Cache-Control: private, no-store`.
- العرض: PDF عبر `pdfjs-dist` (مع `Range`/`206`/`416`)، DXF وDWG المحوّل عبر `dxf-viewer`، الصور عبر روابط كائنات تُلغى عند الإغلاق، ونصوص CSV/TXT/JSON/XML عبر iframe بـ `text/plain`.
- محتوى SVG مرفوض كعدم تطابق نوع حتى لو غُيّر امتداده، لأنه قادر على تنفيذ سكربت عند فتحه مباشرة.

لا يكشف التنزيل MinIO أيضًا: `/files/:id/download` يعيد رابط تذكرة صالحًا 120 ثانية إلى `/files/:id/content?ticket=…` بدل رابط تخزين موقّع. فتح الرابط لا يحتاج ترويسة bearer (فيعمل التنزيل من المتصفح)، لكن النقطة تعيد فحص الوصول وصلاحية `EXPORT` لحظة التسليم وتدوّن أول تسليم، فلا تستمر صلاحية مسحوبة في استخدام رابط قديم. التذاكر مختومة بـ AES-256-GCM وبلا حالة، فلا حاجة إلى Redis أو صفوف قاعدة بيانات: اضبط `DOWNLOAD_TICKET_SECRET` (32 حرفًا فأكثر) بنفس القيمة على كل نسخة لتبقى الروابط صالحة عبر إعادة التشغيل والتوسّع؛ وبدونه تصلح داخل العملية المُصدِرة فقط. تقارير التصدير تستخدم الآلية نفسها عبر `/reports/runs/:id/download` و`/reports/runs/:id/content`.

| المحتوى المكتشف | المعاينة | مفتاح التخزين المؤقت |
| --- | --- | --- |
| PDF، PNG/JPEG/GIF/WebP/BMP/TIFF/SVG، DXF، نص عادي | الأصل | — |
| DOCX/XLSX/PPTX، DOC/XLS/PPT، ODT/ODS/ODP | LibreOffice إلى PDF | `previews/<fileId>/<sha256>.pdf` |
| DWG (`AC10xx`) | ODA إلى DXF | `previews/<fileId>/<sha256>.dxf` |

يُكتشف نوع المحتوى من البايتات السحرية، فملف مُعاد تسميته يُرفض بدل الوثوق بامتداده. تحويلات Office/DWG تجري خارج مسار الطلب عبر طابور في الذاكرة بحدّ تزامن ومهلة وسقوف لحجم المصدر والناتج ومجلدات مؤقتة معزولة تُحذف دائمًا وبيئة مصغّرة تُبعد أسرار قاعدة البيانات وKeycloak وMinIO عن عملية التحويل؛ وتستعلم الصفحة حالة المعاينة حتى تجهز النسخة المخزّنة. المهام تعيش داخل عملية API واحدة: شغّل نسخة واحدة أو انقل الطابور إلى Redis/BullMQ عند التوسّع. تُحذف المعاينات المخزّنة عند إتلاف الملف، ويمكن للمشرف إزالة القديم عبر `POST /api/v1/preview/cache/cleanup` (`{ "olderThanDays": 30 }`)، ويعرض `GET /api/v1/preview/capabilities` المحوّلات المكتشفة.

| المتغيّر | الافتراضي | الغرض |
| --- | --- | --- |
| `PREVIEW_SOFFICE_PATH` | كشف تلقائي | مسار تنفيذي LibreOffice `soffice` |
| `PREVIEW_ODA_PATH` | كشف تلقائي | مسار تنفيذي ODA `ODAFileConverter` |
| `PREVIEW_MAX_SOURCE_BYTES` | 50 MiB | المصادر الأكبر للتنزيل فقط |
| `PREVIEW_MAX_OUTPUT_BYTES` | 200 MiB | حدّ المخرَج المحوّل |
| `PREVIEW_TIMEOUT_MS` | 120000 | مهلة كل تحويل |
| `PREVIEW_CONCURRENCY` | 2 | تحويلات متوازية لكل عملية API |
| `PREVIEW_CACHE_SCAN_LIMIT` | 5000 | كائنات يفحصها منفذ التنظيف |

على Ubuntu/Debian: `apt-get install libreoffice-writer libreoffice-calc libreoffice-impress fonts-noto-core fonts-noto-ui-core` ثم `PREVIEW_SOFFICE_PATH=/usr/bin/soffice` (أو اتركه للكشف التلقائي). ثبّت ODA File Converter منفصلًا واضبط `PREVIEW_ODA_PATH`؛ وتبقى معاينة DWG معطّلة برسالة واضحة حتى يتوفّر المحوّل. صورة الـ API المرفقة مبنية على Debian (`node:22-bookworm-slim`) وتضم LibreOffice والخطوط العربية، ويُضاف إليها ODA فقط لـ DWG. وODA يعمل على glibc فقط، أي Debian/Ubuntu لا Alpine.

### 🧩 واجهة الـ API

كل المسارات تحت `/api/v1` وبغلاف `{ data }`، والأخطاء `{ error: { code, message, details }, correlationId }`.

<details>
<summary><b>جدول نقاط النهاية (اضغط للعرض)</b></summary>

| المجال | نقاط النهاية |
| --- | --- |
| الصحة | `GET /health`، `GET /health/ready` (بلا بيئة) |
| المراقبة | `GET /api/v1/metrics` (Prometheus؛ يحتاج `Authorization: Bearer` عند ضبط `METRICS_TOKEN`) |
| المصادقة | `GET /auth/config` (عام)، `GET /auth/me` |
| المؤسسة | `GET /org/tree`، `GET /org/projects`، `GET /org/employees`، `POST/PATCH/DELETE /org/{departments,sections,projects,employees}` |
| المجموعات | `GET/POST /groups`، `PATCH/DELETE /groups/:id` (كتابة للمشرف؛ الأعضاء يُستبدلون في كل تحديث) |
| الأدوار | `GET /roles`، `PATCH/DELETE /roles/:role` (كتابة لمسؤول النظام؛ تتفوّق تجاوزات الدور على الافتراضيات المشتركة) |
| المستخدمون | `GET/POST /users`، `GET/PATCH/DELETE /users/:id`، `POST /users/:id/reset-password`، `POST /users/:id/revoke-sessions` (كتابة للمشرف؛ قراءة للمدير والمدقّق) |
| المجلدات | `GET /folders/tree`، `GET/POST /folders`، `GET/PATCH/DELETE /folders/:id`، `GET/PUT /folders/:id/acl` |
| الملفات | `POST /files/presign-upload`، `POST /files`، `GET /files/:id/download` (رابط تذكرة 120 ثانية؛ يحتاج `EXPORT`)، `GET /files/:id/content` (بث بالتذكرة) |
| الوثائق | `GET/POST /documents`، `GET/PATCH/DELETE /documents/:id`، `GET /documents/:id/permissions`، `POST /documents/:id/versions`، `POST /documents/:id/declare-record` |
| الاعتماد | `GET/POST /approval-chains`، `PATCH /approval-chains/:id`، `GET/POST /approvals`، `GET /approvals/pending`، `GET /approvals/:id`، `POST /approvals/:id/decide` |
| الاحتفاظ | `GET/POST /retention/policies`، `PATCH/DELETE /retention/policies/:id`، `GET/POST /retention/items`، `PATCH /retention/items/:id`، `POST /retention/items/:id/execute` |
| الحجز القانوني | `GET/POST /legal-holds`، `GET /legal-holds/:id`، `POST /legal-holds/:id/documents`، `DELETE /legal-holds/:id/documents/:documentId`، `POST /legal-holds/:id/release` |
| الإشعارات | `GET /notifications`، `GET /notifications/unread-count`، `POST /notifications/:id/read`، `POST /notifications/read-all`، `POST /notifications` |
| قوالب الإشعارات | `GET/POST /notification-templates`، `PATCH/DELETE /notification-templates/:id`، `POST /notification-templates/:id/reset` (كتابة للمشرف؛ كتالوج مبذور) |
| المهام | `GET/POST /tasks`، `PATCH/DELETE /tasks/:id`، `POST /tasks/:id/complete` |
| قوالب التقارير | `GET /report-templates`، `PATCH /report-templates/:id/favorite` |
| التقارير | `GET /reports/summary`، `GET/POST /reports/schedules`، `PATCH/DELETE /reports/schedules/:id`، `POST /reports/schedules/:id/run`، `GET/POST /reports/runs`، `GET /reports/runs/:id/download` (تذكرة 120 ثانية)، `GET /reports/runs/:id/content` |
| البحوث المحفوظة | `GET/POST /saved-searches`، `PATCH/DELETE /saved-searches/:id` |
| الإعدادات | `GET /settings`، `GET/PUT /settings/:key` (مشرف) |
| التدقيق | `GET /audit` (مدقّق / مشرف) |

</details>

### 🛠️ السكربتات

<details>
<summary><b>كل أوامر npm (اضغط للعرض)</b></summary>

| الأمر | الوصف |
| --- | --- |
| `npm run dev` | خادم تطوير Vite |
| `npm run dev:all` | الحزمة المحلية كاملة + الواجهة |
| `npm run build` | فحص الأنواع (`tsc --noEmit`) ثم بناء الإنتاج |
| `npm run build:singlefile` | نفس الحزمة في ملف `dist/index.html` واحد (عرض دون اتصال) |
| `npm run preview` | تقديم حزمة الإنتاج محليًا |
| `npm run typecheck` | فحص TypeScript فقط |
| `npm run lint` | ESLint |
| `npm run test` | تشغيل Vitest مرة واحدة |
| `npm run test:watch` | Vitest في وضع المراقبة |
| `npm run test:coverage` | تغطية مع عتبات دنيا |
| `npm run test:browser` | اختبار دخان بمتصفح Playwright على حزمة الإنتاج في الوضع دون اتصال (يحتاج `npx playwright install chromium` مرة واحدة) |
| `npm run format` / `format:check` | Prettier كتابةً / فحصًا |
| `npm run check:secrets` | فحص الأسرار والتتبّع |
| `npm run shared:build` | تجميع `packages/shared` إلى `dist/` (يستهلكه الـ API) |
| `npm run api:install` | تثبيت حزمة `api/` وربط `@edas/shared` |
| `npm run api:typecheck` / `api:lint` / `api:test` / `api:build` | بوابات الـ API |
| `npm run api:test:coverage` | اختبارات الـ API مع تغطية وعتبات دنيا |
| `npm run api:dev` | الـ API في وضع المراقبة |
| `npm run stack:up` / `stack:down` | تشغيل/إيقاف حاويات الحزمة المحلية |
| `npm run e2e` | اختبار طرفي للـ API (Docker: Postgres + Keycloak + S3 mock) |
| `npm run demo:seed` | إنشاء/حذف 20 وثيقة تجريبية عبر مسار الرفع الحقيقي (`-- --clean`) |

</details>

> ✅ **قبل الرفع:** `npm run typecheck && npm run lint && npm run format:check && npm run check:secrets && npm test && npm audit --audit-level=high && npm run build`، وللخادم: `npm run api:typecheck && npm run api:lint && npm run api:test:coverage && npm run api:build`. نفس البوابات تعمل في `.github/workflows/ci.yml` مع مهام: SPA، API، API end-to-end، بناء صورة الـ API، واختبار المتصفح.

### 📊 السجلات والمراقبة

الـ API يكتب **كائن JSON واحدًا في كل سطر** إلى stdout/stderr (`api/src/common/logging/json.logger.ts`)، فيقرأه جامع سجلات أو `docker logs` دون تعبيرات نمطية:

```json
{"time":"2026-11-10T09:12:44.318Z","level":"log","message":"GET /api/v1/documents 200 41.7ms","context":"HTTP","correlationId":"3f0c…","userId":"9d1e…","method":"GET","route":"/documents"}
```

- `LOG_LEVEL` (`error|warn|log|debug|verbose`، الافتراضي `log`) يرشّح البث؛ والقيمة غير المعروفة تُفشل إقلاع الخادم بدل تجاهلها بصمت.
- كل طلب يحمل معرّف ارتباط (`x-correlation-id`، يُعاد استخدامه إن أرسله المتصل وإلا يُولَّد)، ويُعاد في ترويسة الاستجابة وفي غلاف `{ error, correlationId }`، ويُلحق بكل سطر سجل داخل الطلب — بما فيه تحذيرات الخدمات وأعطال التحويل ومكدّسات 5xx.
- سطور الوصول تسجّل الطريقة والمسار والحالة والمدة؛ 5xx عند `error`، و4xx عند `warn`، والطلبات الناجحة عند `log`، وفحوص الصحة عند `debug` حتى لا تُغرق البث.
- الفحوص: `GET /api/v1/health` (الحياة، يعيد مدة التشغيل) و`GET /api/v1/health/ready` (ينفّذ `SELECT 1` ويعيد 503 عند تعذّر قاعدة البيانات). و`docker-compose.yml` يربط فحص الحاوية بالأول.
- المقاييس: `GET /api/v1/metrics` بصيغة Prometheus النصية (بعيدًا عن غلاف `{ data }`)، وتشمل عدّاد طلبات ومدرّج مدة ومقياس الطلبات الجارية بمفاتيح `method` و`route` (نمط المسار لا المسار الخام، و`unmatched` لغير المطابق) و`status`، إضافة إلى مقاييس Node الافتراضية ببادئة `edas_`. داخل التطوير النقطة مفتوحة، وفي الإنتاج تُغلق (403) ما لم يُضبط `METRICS_TOKEN` (32 حرفًا فأكثر) ويُرسَل `Authorization: Bearer <token>`. لا تُكشف بيانات المستخدم أو المسارات الخام في التسميات.
- جمع المقاييس وقواعد التنبيه: ملفان جاهزان في `infra/monitoring/` بلا أي خدمة إضافية في `docker-compose.yml`. `prometheus.yml` يعرّف مهمة `edas-api` على المسار `/api/v1/metrics` ويقرأ التوكن من `/etc/prometheus/metrics-token` عبر `authorization.credentials_file` (ضع فيه `METRICS_TOKEN` نفسه بصلاحية `0600`، واحفظ الملف خارج شجرة العمل مثل `$HOME/.edas/metrics-token` حتى لا يُلتقط في git). `alerts.yml` يحوي سبع قواعد: تعذّر الجمع (`EdasApiDown`، دقيقتان)، فشل الجاهزية 503 (خمس دقائق)، نسبة 5xx أكبر من 2% (عشر دقائق)، p95 أكبر من ثانية (عشر دقائق)، أكثر من 50 طلبًا جاريًا (خمس دقائق)، ذاكرة مقيمة أكبر من 1.2 غ.ب (عشر دقائق)، وتأخر حلقة الأحداث p99 أكبر من 250 م.ث (عشر دقائق). تسليم التنبيهات (Alertmanager أو البريد) غير مرفق: الملفان يُحلَّلان فقط، والتوجيه متروك للمشغّل. التحقق: `docker run --rm -v "$PWD/infra/monitoring:/m" -v "$HOME/.edas/metrics-token:/etc/prometheus/metrics-token:ro" --entrypoint promtool prom/prometheus:latest check config /m/prometheus.yml` وينتهي بـ `SUCCESS` لملف القواعد والقواعد السبع.
- **ما لا يوجد بعد:** لا تتبّع موزّع ولا OpenTelemetry، ولا تكامل APM، ولا تجميع سجلات أو تسليم تنبيهات، ولا `pm2`/مدير عنقود — إعادة التشغيل متروكة لمدير الحاويات (`restart: unless-stopped`). السجلات المنظّمة والفحصان ونقطة المقاييس وملفا Prometheus هي سطح المراقبة، وأي ادعاء يتجاوز ذلك غير دقيق.

### 🔑 الأسرار

لا بيانات اعتماد في هذا المستودع. كتالوج مزوّد الذكاء الاصطناعي المحلي (`opencode.json`) مستثنى من git ولا يُنشر؛ سجّل مفتاحه مرة واحدة بـ `opencode auth login` ليُحفظ في ملف الاعتماد العام خارج شجرة العمل. أسرار الخادم تأتي من البيئة: `api/.env` (مستثنى، انظر `api/.env.example`) لـ `DATABASE_URL` وإعدادات Keycloak وS3، و`KEYCLOAK_ADMIN_PASSWORD` لمسارات إدارة المستخدمين. بدّل أي مفتاح سبق رفعه أو مشاركته قبل إعادة استخدامه. تقرير التدقيق الداخلي (`AUDIT.md`) مستثنى كذلك.

يوجد محليًا `.env` و`api/.env` ببيانات تطوير الحزمة (قاعدة `edas_dev_pw`، وMinIO `edas_minio_dev_pw`) وقيم `SESSION_SECRET` مولّدة بطول 48 حرفًا. وهي متجاهلة بواسطة git (`git check-ignore -v .env api/.env`)، و`npm run check:secrets` يُفشل البناء إذا تُتبّع ملف بيئة غير `.env.example`، أو وُجد مفتاح خاص، أو خُتم سرّ في الشيفرة. وCI يشغّله.

### 🚀 النشر

`docker compose` في هذا المستودع للتطوير المحلي فقط. الإنتاج يحتاج:

- صورة الـ API من `api/Dockerfile` (سياق البناء جذر المستودع لأن `@edas/shared` حزمة محلية) وتعمل بمستخدم `node` غير الجذر.
- PostgreSQL 16 وKeycloak 26 وMinIO (أو أي S3 متوافق) مُدارة خارج الحزمة.
- خادم ملفات ثابت يقدّم ناتج `npm run build` من `dist/`، وبوابة عكسية تنهي TLS أمام الواجهة والـ API.

**البوابة العكسية والكوكيز:** مرّر `Host` و`X-Forwarded-Proto` كما هما، واضبط `APP_BASE_URL` (أصل الواجهة) و`API_PUBLIC_URL` (أصل الـ API) و`SESSION_COOKIE_SECURE=true`. يجب أن تكون `CORS_ORIGINS` قائمة أصول `https://` صريحة؛ الخادم يرفض `*` و`http://` عند `NODE_ENV=production`.

**ما يرفض الخادم الإقلاع بدونه في الإنتاج:** `DATABASE_URL`، `KEYCLOAK_ISSUER`، `KEYCLOAK_AUDIENCE`، `KEYCLOAK_ADMIN`، `KEYCLOAK_ADMIN_PASSWORD`، `MINIO_ENDPOINT`، `MINIO_BUCKET`، `MINIO_ACCESS_KEY`، `MINIO_SECRET_KEY`، `CORS_ORIGINS`، `SESSION_SECRET`. ويرفض كذلك قيم التطوير (`admin`، `edas_dev_pw`، `edas_minio_dev_pw`) وأي سر أقصر من 32 حرفًا في `SESSION_SECRET` أو `DOWNLOAD_TICKET_SECRET` — التفاصيل في [`env.validation.ts`](api/src/common/config/env.validation.ts).

**Keycloak:** استورد realm إنتاجيًا مستقلًا، واضبط عنوانه على HTTPS، وسجّل `<API_PUBLIC_URL>/api/v1/auth/callback` عنوانَ عودة والأصل نفسه Web Origin. لا تستخدم `infra/keycloak/realm-edas.json`: مستخدموه بكلمات مرور تطويرية وعميله `edas-cli` يسمح بـ password grant.

**الترقية:** طبّق الترحيلات قبل تشغيل النسخة الجديدة بـ `cd api && npx prisma migrate deploy` (حاوية compose تفعل ذلك عند كل إقلاع). لا تستخدم `prisma db push` في الإنتاج. راقب `/api/v1/health` و`/api/v1/health/ready`، وأبقِ سياسة إعادة التشغيل (`restart: unless-stopped` أو ما يعادلها) في مدير الحاويات. لجمع المقاييس اضبط `METRICS_TOKEN` (32 حرفًا فأكثر) وأرسل `Authorization: Bearer` من Prometheus؛ بدون التوكن تعيد `/api/v1/metrics` الرمز 403 في الإنتاج.

| السر | الأثر عند تدويره |
| --- | --- |
| `SESSION_SECRET` | تُبطل كل جلسات المتصفح ويعود المستخدمون لتسجيل الدخول |
| `DOWNLOAD_TICKET_SECRET` | تُبطل روابط التنزيل الصادرة فورًا |
| `KEYCLOAK_ADMIN_PASSWORD` · `MINIO_SECRET_KEY` · `DATABASE_URL` | تتطلب تحديث الخدمة والمستخدم معًا في نافذة صيانة قصيرة |
| عميل Keycloak السري (إن استُخدم) | أعد النشر بالقيمة نفسها على كل نسخ الـ API |

القاعدة: القيمة نفسها على كل النسخ، ثم إعادة تشغيل متدرجة. جدول تدوير `SESSION_SECRET` خارج ساعات العمل لأنه يقطع الجلسات الحالية.

**التوسّع:** طابور المعاينة وتخزين المعاينات داخل نسخة الـ API وغير مشتركين، فشغّل نسخة واحدة حتى تنقل الطابور إلى Redis/BullMQ. تذاكر التنزيل بلا حالة وتعمل عبر النسخ، ومهمة تنظيف الجلسات المنتهية (`SESSION_CLEANUP_INTERVAL_MS`، الافتراضي ساعة) آمنة مع النسخ المتعددة لأنها حذف متكرر لا يعتمد على حالة مشتركة.

### 💾 النسخ الاحتياطي والاستعادة

يجب نسخ مصدرين معًا:

- **PostgreSQL:** الميتاداتا وصلاحيات الوصول والجلسات وسجل التدقيق المتسلسل — لا يمكن إعادة بنائها من الملفات.
- **MinIO/S3:** الأصول المرفوعة (`documents/…`) والمعاينات المخزّنة (`previews/…`) — صفوف الوثائق بلا كائناتها بلا محتوى.

النسخان لا يتحدثان في اللحظة نفسها: خذ لقطة PostgreSQL أولًا ثم `mc mirror`، أو أوقف حاوية الـ API أثناء النسخ لضمان الاتساق.

```bash
# 1) قاعدة البيانات (نسخة مخصّصة ومضغوطة)
docker compose exec -T postgres pg_dump -U edas -Fc edas > edas-$(date +%F).dump

# 2) الكائنات (بعد ضبط alias لعميل mc على نقطة النهاية والأسرار)
mc alias set edas http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mirror --overwrite edas/edas-documents ./backup/edas-documents
```

**الاستعادة** إلى قاعدة وحاوية فارغتين أو إلى النسخة الحالية:

```bash
docker compose stop api
docker compose exec -T postgres pg_restore -U edas -d edas --clean --if-exists < edas-2026-11-11.dump
mc mirror --overwrite ./backup/edas-documents edas/edas-documents
cd api && npx prisma migrate deploy
docker compose start api
```

استخدم `pg_restore` من الإصدار الرئيسي نفسه لـ `pg_dump` (16). بعد الاستعادة تحقق من `/api/v1/health/ready`، ثم افتح وثيقة واختبر المعاينة والتنزيل (التنزيل يعيد فحص الوصول إلى الأصل في التخزين)، وابحث في `/api/v1/audit` للتأكد من استمرار سلسلة التدقيق.

**الالتزام التشغيلي:** لا توجد في المستودع مهمة نسخ مجدولة ولا Versioning على الحاوية، فالنسخ مسؤولية تشغيلية. الحد الأدنى المقترح: `pg_dump` يومي مع احتفاظ 30 يومًا، و`mc mirror` يومي إلى تخزين خارج الموقع، ونسخة أسبوعية منفصلة، واختبار استعادة كل ربع سنة. زمن الاسترداد = زمن `pg_restore` + `mc mirror`، وقِسه في اختبار الاستعادة بدل تقديره.

### 📦 التبعيات و`npm audit`

تعمل `npm audit --audit-level=high` في CI للحزمتين بعد التثبيت، فأي استشارة جديدة عالية أو حرجة تُفشل البناء. الحزمتان مدقّقتان ومحدّثتان، والتثبيتات في `overrides` لأن عدة حزم متأثرة غير مباشرة ولم تُصدر حزمها الأم نسخًا مصحّحة بعد:

| التثبيت | السبب |
| --- | --- |
| `minimatch@^11` (داخل `eslint` و`@eslint/config-array` و`@typescript-eslint/typescript-estree`) | النسخة المصحّحة الوحيدة (11.0.1+) إصدار رئيسي لم تتبنّه الحزم الأم |
| `esbuild@^0.28` · `nanoid@^3.3.20` · `source-map-js@^1.2.2` | إصدارات مصحّحة تحت `vite` و`postcss` |
| `body-parser@^2.4` · `fast-uri@^3.1.9` · `glob@^14` · `deepmerge-ts@^8` | إصدارات مصحّحة تحت `express` و`ajv` و`@nestjs/cli` و`@prisma/config` |

رُقّيت `vite` إلى `7.3.8` و`@nestjs/platform-express` إلى `11.2.9` (تثبّت `multer@2.5.0`). الاستشارات الثلاث الباقية **منخفضة** ومحصورة في أدوات البناء: `deepmerge` (`>=4.2.0`) لم تنشر إصلاحًا قط، وتصل فقط عبر `@nestjs/cli` → `fork-ts-checker-webpack-plugin` المستخدمة في البناء لا في وقت التشغيل. إزالتها تحتاج `@nestjs/cli` 12 التي تفرض TypeScript 6 و`@nestjs/schematics` 12 — ترحيل سلسلة أدوات لا رقعة. أعد النظر في التثبيتات عندما تُصدر `eslint` و`@typescript-eslint` و`@nestjs/cli` نسخًا تحمل التبعيات المصحّحة.

### 🗂️ بنية المشروع

```text
api/                 خادم NestJS (package.json خاص، مخطّط Prisma، Dockerfile)
packages/shared/     العقود المشتركة (الأدوار، مصفوفة الصلاحيات، DTOs) — مصدر وحيد
infra/keycloak/      استيراد realm الخاص بـ Keycloak
e2e/browser/         اختبار دخان بمتصفح Playwright (playwright.config.ts في الجذر)
docs/                مراجعة الشاشات (عربي/إنجليزي) وملاحظات التصميم
docker-compose.yml   الحزمة المحلية: PostgreSQL + Keycloak + MinIO + API
src/
  components/        واجهة مشتركة (ui.tsx، shared.tsx، Layout، التنقّل، المساعد)
  pages/             ملف لكل مسار؛ الصفحات الكبيرة مقسّمة إلى *-parts.tsx
  lib/               منطق صرف (محرّك الصلاحيات، التحقق، عميل الـ API)
  utils/             الحفظ المحلي والمعرّفات
  store.tsx          جلسة التطبيق/السمة/اللغة/التنبيهات (React context)
  store-docs.tsx     حالة المجال (وثائق، مجلدات، ACL، مهام، …)
  data.ts            بيانات تجريبية
  i18n.ts            قواميس الترجمة ar/en
  types.ts           أنواع المجال
```

تعريفات المسارات في `src/App.tsx`، والتنقّل والوصول حسب الدور في `src/components/nav-config.ts`. أما إرشادات المساهمة والبوابات ففي [`AGENTS.md`](AGENTS.md).

<a name="ar-limits"></a>

### ⚠️ حدود النسخة التجريبية

- **مصادقة نموذجية افتراضيًا:** بدون متغيّرات `VITE_` يسجّل أي اسم مستخدم/كلمة مرور كحساب تجريبي دون تحقق (`src/pages/auth-login.tsx`). ومع ضبطها يتم الدخول عبر Keycloak (authorization code + PKCE).
- **ربط الـ API جزئي:** المصادقة والوثائق والمجلدات وقواعد الوصول والنسخ والرفع وسلة المحذوفات وبنود الاحتفاظ والحجز القانوني ومهام سير العمل والإشعارات وسجل التدقيق والبحوث المحفوظة ودليل المؤسسة وسياسات الاحتفاظ وسلاسل الاعتماد والإعدادات وأرقام لوحة المعلومات وجدول التقارير وسجل تشغيلها وكتالوج قوالبها تمرّ عبر الـ API؛ أما بعض فروق لوحة المعلومات وصفحات الأدوار التجريبية فما زالت من البيانات المحلية (`src/data.ts` ومفاتيح `edas.v1.` في `localStorage` عبر `src/utils/persist.ts`).
- **التحكم بالوصول في الواجهة توضيحي** وليس حدًّا أمنيًا (الخادم هو من ينفّذه).
- بعض الأرقام والمقاييس المعروضة ثابتة (placeholder).

### ♿ الإتاحة والتعريب

الواجهة RTL افتراضيًا (`<html dir="rtl" lang="ar">`) وتتحوّل إلى LTR/الإنجليزية عبر مبدّل اللغة. الترجمات في `src/i18n.ts` ويجب أن يبقى قواميس `ar` و`en` متزامنين. تُستخدم أدوات Tailwind المنطقية (`ps-`، `me-`، `rtl:`) وقواعد `eslint-plugin-jsx-a11y` مفعّلة (عناصر تفاعلية حقيقية، وطبقات الإغلاق بخاصية `aria-hidden="true"`).

---

<a name="en"></a>

## 📌 English

> **Status: prototype / demo.** Without the API environment variables the React app runs with mocked auth and `localStorage` persistence. With them it authenticates against Keycloak and reads/writes documents, folders, ACLs and the trash through the NestJS + PostgreSQL API under `api/`. Other domain areas are still mocked — see [demo limitations](#en-limits).

### 🧭 Overview

| Area | What actually works |
| --- | --- |
| **Documents** | Create, edit, new versions, move/archive, checkout/checkin, delete/restore/purge, signatures, record declarations |
| **Classification & access** | Folder tree, per-folder ACL rules (`USER` / `ROLE` / `DEPARTMENT` × `VIEW\|CREATE\|EDIT\|DELETE\|APPROVE\|EXPORT`), department scoping, and one role matrix in `packages/shared` |
| **Approvals & retention** | Approval chains and decisions, retention policies and items with disposal execution, legal holds, tasks and notifications |
| **Search & reporting** | Advanced search, saved searches, scheduled and manual reports exported as CSV, Excel and right-to-left Arabic PDF (embedded Amiri font) |
| **Preview & download** | In-app preview for PDF, images, Office, DXF and DWG through the API, and downloads through short-lived tickets — MinIO is never exposed |
| **Identity & audit** | Keycloak (authorization code + PKCE) with an `httpOnly` session cookie and CSRF, plus a hash-chained audit trail for every mutation |

### 🧱 Tech stack

| Layer | Technologies |
| --- | --- |
| **Front end** | React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 (RTL, light/dark) · React Router 7 (HashRouter) |
| **UI & rendering** | Recharts · lucide-react · pdfjs-dist · dxf-viewer |
| **Testing** | Vitest · Testing Library · jsdom · Playwright (browser smoke test) |
| **Backend (`api/`)** | NestJS 11 · Prisma 6 · PostgreSQL · Keycloak (OIDC/JWKS) · MinIO (S3) |
| **Build** | Chunked production bundle (vendor split, lazy PDF/DXF viewers and routes) and an optional single-file build via `vite-plugin-singlefile` for the offline demo |

### ⚡ Quick start

Requires **Node.js 20.19+ or 22.12+**, npm and Docker Desktop.

```bash
npm install
npm run dev:all   # PostgreSQL + Keycloak + MinIO + API, then the UI on http://localhost:5173
```

`npm run stack:down` stops the backend containers; `Ctrl+C` stops the UI.

**Running the backend by hand:**

```bash
# one-time, from the repo root
npm install && npm run shared:build
cd api && npm install && npx prisma generate

# the full local stack (PostgreSQL + Keycloak + MinIO + API)
docker compose up -d

# or run the API directly (needs a reachable Postgres + Keycloak)
cd api && npm run start:dev

# bootstrap the organization directory (departments, sections, employees, projects,
# groups, folders, retention policies, approval chains, settings) — idempotent
cd api && npx prisma migrate deploy && npm run prisma:seed

# 20 demo documents through the real upload path (presign → PUT → register → create)
npm run demo:seed              # from the repo root; needs API + Keycloak + MinIO
npm run demo:seed -- --clean   # remove them again (they carry the demo-seed tag)

# repair documents whose stored department drifted from their folder
cd api && npm run build && npm run maintenance:reconcile-departments -- --apply
```

### 🔌 Connecting the SPA to the API

The SPA runs in offline prototype mode unless the `VITE_` variables below are set. Copy [`.env.example`](.env.example) to `.env.local`:

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000` | API origin (routes live under `/api/v1`) |
| `VITE_OIDC_ISSUER` | `http://localhost:8080/realms/edas` | Realm used by the browser login |
| `VITE_OIDC_CLIENT_ID` | `edas-web` | Public PKCE client from the realm import |

When configured, `/login` shows a single Keycloak button that sends the browser to `/api/v1/auth/login`. The API — not the browser — runs the authorization-code + PKCE exchange (`/api/v1/auth/callback`), keeps the OIDC tokens server-side in a `UserSession` row and hands the SPA an opaque **httpOnly session cookie** (`edas_session`) plus a readable CSRF cookie (`edas_csrf`) that mutating requests must echo in the `x-csrf-token` header. The SPA never stores tokens, hydrates `/auth/me` on boot and calls `/auth/logout` (which ends the Keycloak session) on sign-out; `src/lib/role-bridge.ts` maps API roles and ACL actions onto the UI role / `PermAction` model.

The API side needs `APP_BASE_URL` (the SPA origin it redirects back to) and, in production, a stable `SESSION_SECRET` (32+ characters) that seals the stored tokens — the same value on every replica. Register the deployment redirect URI (`<API>/api/v1/auth/callback`) in Keycloak. See [`api/.env.example`](api/.env.example) for `SESSION_TTL_SECONDS`, `SESSION_COOKIE_SECURE` and `SESSION_COOKIE_SAMESITE`.

**What writes through:** folders, ACLs, documents, versions, uploads, the trash, retention items, legal holds, workflow tasks, notifications, the audit trail, saved searches, the organization directory (read/write), groups, user accounts, retention policies, approval chains (steps editable while no instance is pending), system settings, dashboard figures, and report schedules/runs plus the template catalog. User accounts created, edited, locked/unlocked, reactivated, deleted and password-reset from the admin page are mirrored into Keycloak through its Admin API (roles, enabled flag, credentials, required actions, session logout), with the database row updated afterwards and the action audited.

**Database:** schema changes ship as Prisma migrations under `api/prisma/migrations`; `docker compose` applies them with `prisma migrate deploy` on startup, and locally run `cd api && npx prisma migrate deploy` (or `npm run prisma:migrate` while developing). A database created earlier with `db push` should be baselined once: `npx prisma migrate resolve --applied 20261022000000_init`. The API validates required environment variables and rejects wildcard CORS origins when `NODE_ENV=production`.

### 🔐 Security and access control

- Keycloak-issued JWTs are validated server-side (RS256 via JWKS) and RBAC is enforced there, not in the browser.
- Account status is checked on every request, so locked or deactivated users are rejected even while their JWT is still valid.
- The permission matrix is the single source of truth in `packages/shared` (`ROLE_CAPABILITIES`, `isGlobalRole`, `USER_ROLES`) and is consumed by both the SPA and the API.
- Every mutation writes an append-only, hash-chained row to the audit log.
- `infra/keycloak/realm-edas.json` is **development-only**: users `admin` / `manager` / `employee` (password = username) and an `edas-cli` client that allows the password grant for local scripts and `npm run e2e`. The browser client (`edas-web`) has the password grant disabled and only accepts authorization code with PKCE. Production must import its own realm and rotate every credential — see [`infra/keycloak/README.md`](infra/keycloak/README.md).

### 👁️ Previews and downloads

The preview page (`/documents/:id/preview`) streams the stored original or a converted copy from `/api/v1/preview/files/:id/content` through the API, so MinIO stays private and no bucket policy is needed. Previewing requires `VIEW` on a linked document; downloading the original (`/files/:id/download`) additionally requires `EXPORT`, so a view-only grant cannot fetch the file even though it can see it on screen.

- Successful preview opens and refused accesses are appended to the audit chain once per actor, file and kind per five-minute window (range requests would otherwise serialise the hash-chained ledger).
- Responses use `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
- PDFs render with `pdfjs-dist` (including `Range`/`206` and `416`), DXF and converted DWG files with `dxf-viewer`, images through revocable object URLs aborted on close, and CSV/TXT/JSON/XML through a `text/plain` iframe.
- SVG content is rejected as a type mismatch even when renamed, because it can run script when opened directly.

Downloads never expose MinIO either: `/files/:id/download` returns a 120-second ticket URL at `/files/:id/content?ticket=…` instead of a presigned storage link. Opening it needs no bearer header (so a normal browser download works), but the endpoint re-checks access and the `EXPORT` grant at delivery time and audits the first delivery, so a revoked grant cannot keep using an older link. Tickets are AES-256-GCM sealed and stateless, so no Redis or database rows are involved: set `DOWNLOAD_TICKET_SECRET` (32+ characters) to the same value on every instance; without it they are valid only inside the issuing process. Report exports use the same ticketing through `/reports/runs/:id/download` and `/reports/runs/:id/content`.

| Detected content | Preview | Cache key |
| --- | --- | --- |
| PDF, PNG/JPEG/GIF/WebP/BMP/TIFF/SVG, DXF, plain text | original | — |
| DOCX/XLSX/PPTX, DOC/XLS/PPT, ODT/ODS/ODP | LibreOffice to PDF | `previews/<fileId>/<sha256>.pdf` |
| DWG (`AC10xx`) | ODA to DXF | `previews/<fileId>/<sha256>.dxf` |

Content type is detected from magic bytes, so a renamed file is rejected instead of trusted. Office/DWG conversions run outside the request path through an in-memory queue with a concurrency limit, timeout, source/output size caps, isolated temp directories that are always removed, and a minimal environment that keeps database, Keycloak and MinIO secrets away from the converter; the page polls the preview status until the cached copy is ready. Jobs live in one API process: run a single replica or move the queue to Redis/BullMQ when scaling out. Cached previews are removed when the file is purged, an administrator can drop stale ones with `POST /api/v1/preview/cache/cleanup` (`{ "olderThanDays": 30 }`), and `GET /api/v1/preview/capabilities` reports the detected converters.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PREVIEW_SOFFICE_PATH` | auto-detect | LibreOffice `soffice` executable |
| `PREVIEW_ODA_PATH` | auto-detect | ODA `ODAFileConverter` executable |
| `PREVIEW_MAX_SOURCE_BYTES` | 50 MiB | Larger sources are download-only |
| `PREVIEW_MAX_OUTPUT_BYTES` | 200 MiB | Converted output limit |
| `PREVIEW_TIMEOUT_MS` | 120000 | Per-conversion timeout |
| `PREVIEW_CONCURRENCY` | 2 | Parallel conversions per API process |
| `PREVIEW_CACHE_SCAN_LIMIT` | 5000 | Objects scanned by the cleanup endpoint |

Ubuntu/Debian: `apt-get install libreoffice-writer libreoffice-calc libreoffice-impress fonts-noto-core fonts-noto-ui-core`, then set `PREVIEW_SOFFICE_PATH=/usr/bin/soffice` (or leave it unset for auto-detection). Install the ODA File Converter separately and set `PREVIEW_ODA_PATH`; DWG previews stay disabled with a clear message until it is present. The bundled API image is Debian-based (`node:22-bookworm-slim`) and already ships LibreOffice plus Arabic fonts; only the ODA File Converter has to be added for DWG. ODA is glibc-only, so it runs on Debian/Ubuntu but not on Alpine.

### 🧩 API surface

All routes live under `/api/v1` and use a `{ data }` envelope; errors are `{ error: { code, message, details }, correlationId }`.

<details>
<summary><b>Endpoint table (click to expand)</b></summary>

| Area | Endpoints |
| --- | --- |
| Health | `GET /health`, `GET /health/ready` (env-free) |
| Monitoring | `GET /api/v1/metrics` (Prometheus; needs `Authorization: Bearer` when `METRICS_TOKEN` is set) |
| Auth | `GET /auth/config` (public), `GET /auth/me` |
| Org | `GET /org/tree`, `GET /org/projects`, `GET /org/employees`, `POST/PATCH/DELETE /org/{departments,sections,projects,employees}` |
| Groups | `GET/POST /groups`, `PATCH/DELETE /groups/:id` (admin writes; members replaced per update) |
| Roles | `GET /roles`, `PATCH/DELETE /roles/:role` (system admin writes; role overrides win over the shared defaults) |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `POST /users/:id/reset-password`, `POST /users/:id/revoke-sessions` (admin writes; manager/auditor read) |
| Folders | `GET /folders/tree`, `GET/POST /folders`, `GET/PATCH/DELETE /folders/:id`, `GET/PUT /folders/:id/acl` |
| Files | `POST /files/presign-upload`, `POST /files`, `GET /files/:id/download` (120 s ticket link; needs `EXPORT`), `GET /files/:id/content` (ticket stream) |
| Documents | `GET/POST /documents`, `GET/PATCH/DELETE /documents/:id`, `GET /documents/:id/permissions`, `POST /documents/:id/versions`, `POST /documents/:id/declare-record` |
| Approvals | `GET/POST /approval-chains`, `PATCH /approval-chains/:id`, `GET/POST /approvals`, `GET /approvals/pending`, `GET /approvals/:id`, `POST /approvals/:id/decide` |
| Retention | `GET/POST /retention/policies`, `PATCH/DELETE /retention/policies/:id`, `GET/POST /retention/items`, `PATCH /retention/items/:id`, `POST /retention/items/:id/execute` |
| Holds | `GET/POST /legal-holds`, `GET /legal-holds/:id`, `POST /legal-holds/:id/documents`, `DELETE /legal-holds/:id/documents/:documentId`, `POST /legal-holds/:id/release` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `POST /notifications` |
| Notification templates | `GET/POST /notification-templates`, `PATCH/DELETE /notification-templates/:id`, `POST /notification-templates/:id/reset` (admin writes; seeded catalog) |
| Tasks | `GET/POST /tasks`, `PATCH/DELETE /tasks/:id`, `POST /tasks/:id/complete` |
| Templates | `GET /report-templates`, `PATCH /report-templates/:id/favorite` |
| Reports | `GET /reports/summary`, `GET/POST /reports/schedules`, `PATCH/DELETE /reports/schedules/:id`, `POST /reports/schedules/:id/run`, `GET/POST /reports/runs`, `GET /reports/runs/:id/download` (120 s ticket), `GET /reports/runs/:id/content` |
| Searches | `GET/POST /saved-searches`, `PATCH/DELETE /saved-searches/:id` |
| Settings | `GET /settings`, `GET/PUT /settings/:key` (admin) |
| Audit | `GET /audit` (auditor / admin) |

</details>

### 🛠️ Scripts

<details>
<summary><b>All npm commands (click to expand)</b></summary>

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run dev:all` | Full local stack + the UI |
| `npm run build` | Type-check (`tsc --noEmit`) then production build |
| `npm run build:singlefile` | Same bundle inlined into a single `dist/index.html` (offline demo) |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check only |
| `npm run lint` | ESLint |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Coverage with enforced thresholds |
| `npm run test:browser` | Playwright browser smoke test against the production bundle in offline mode (run `npx playwright install chromium` once) |
| `npm run format` / `format:check` | Prettier write / check |
| `npm run check:secrets` | Secrets and tracking scan |
| `npm run shared:build` | Compile `packages/shared` to `dist/` (used by the API) |
| `npm run api:install` | Install the `api/` package and link `@edas/shared` |
| `npm run api:typecheck` / `api:lint` / `api:test` / `api:build` | API gates |
| `npm run api:test:coverage` | API tests with coverage and enforced thresholds |
| `npm run api:dev` | API in watch mode |
| `npm run stack:up` / `stack:down` | Start / stop the local stack containers |
| `npm run e2e` | End-to-end API suite (Docker: Postgres + Keycloak + S3 mock) |
| `npm run demo:seed` | Create/remove 20 demo documents via the real upload path (`-- --clean`) |

</details>

> ✅ **Before pushing:** `npm run typecheck && npm run lint && npm run format:check && npm run check:secrets && npm test && npm audit --audit-level=high && npm run build`, and for the backend: `npm run api:typecheck && npm run api:lint && npm run api:test:coverage && npm run api:build`. The same gates run in `.github/workflows/ci.yml` across the SPA, API, API end-to-end, API image and browser smoke jobs.

### 📊 Observability

The API writes **one JSON object per line** to stdout/stderr (`api/src/common/logging/json.logger.ts`), so a log shipper or `docker logs` consumer can parse it without regexes:

```json
{"time":"2026-11-10T09:12:44.318Z","level":"log","message":"GET /api/v1/documents 200 41.7ms","context":"HTTP","correlationId":"3f0c…","userId":"9d1e…","method":"GET","route":"/documents"}
```

- `LOG_LEVEL` (`error|warn|log|debug|verbose`, default `log`) filters the stream; an unknown value fails boot validation instead of being silently ignored.
- Every request carries a correlation id (`x-correlation-id`, reused when the caller sends one, otherwise generated); it is returned in the response header and in the `{ error, correlationId }` envelope, and attached to every log line emitted inside that request — including service warnings, preview conversion failures and 5xx stacks.
- Access lines record method, path, status and duration; 5xx log at `error`, 4xx at `warn`, successful requests at `log`, and health probes at `debug`.
- Probes: `GET /api/v1/health` (liveness, returns uptime) and `GET /api/v1/health/ready` (executes `SELECT 1` and returns 503 when the database is unreachable). `docker-compose.yml` wires the container healthcheck to the former.
- Metrics: `GET /api/v1/metrics` in the Prometheus text format (bypassing the `{ data }` envelope) with a request counter, a duration histogram and an in-flight gauge keyed by `method`, `route` (the route pattern, never the raw path, and `unmatched` when nothing matched) and `status`, plus the Node default metrics under the `edas_` prefix. The endpoint is open in development and returns 403 in production unless `METRICS_TOKEN` (32+ characters) is set and the scraper sends `Authorization: Bearer <token>`. Labels never carry user data or raw paths.
- Scrape and alert assets: two ready-made files under `infra/monitoring/`, with no extra service in `docker-compose.yml`. `prometheus.yml` defines the `edas-api` job on `/api/v1/metrics` and reads the token from `/etc/prometheus/metrics-token` through `authorization.credentials_file` (put the same `METRICS_TOKEN` there with `0600` permissions, and keep the file outside the working tree, e.g. `$HOME/.edas/metrics-token`, so git never picks it up). `alerts.yml` holds seven rules: scrape failure (`EdasApiDown`, two minutes), readiness returning 503 (five minutes), 5xx ratio above 2% (ten minutes), p95 above one second (ten minutes), more than 50 requests in flight (five minutes), resident memory above 1.2 GB (ten minutes) and event-loop lag p99 above 250 ms (ten minutes). Alert delivery (Alertmanager or email) is not bundled: the files are only parsed and validated, routing is left to the operator. Validate with `docker run --rm -v "$PWD/infra/monitoring:/m" -v "$HOME/.edas/metrics-token:/etc/prometheus/metrics-token:ro" --entrypoint promtool prom/prometheus:latest check config /m/prometheus.yml`, which reports `SUCCESS` for the config and for the seven rules.
- **What does not exist yet:** no distributed tracing or OpenTelemetry, no APM integration, no bundled log aggregation or alert delivery, and no `pm2`/cluster manager — restarts are left to the container runtime (`restart: unless-stopped`). Structured logs, the two probes, the metrics endpoint and the Prometheus files are the observability surface.

### 🔑 Secrets

No credential belongs in this repository. The local AI-provider catalogue (`opencode.json`) is gitignored and never published; register its API key once with `opencode auth login`, which stores it in the global auth file outside the working tree. Server-side secrets come from the environment: `api/.env` (gitignored, see `api/.env.example`) for `DATABASE_URL`, Keycloak and S3 settings, and `KEYCLOAK_ADMIN_PASSWORD` for the user-administration flows. Rotate any key that has ever been committed or shared before reusing it. The internal audit report (`AUDIT.md`) is gitignored as well.

`.env` and `api/.env` exist locally with the compose development credentials (database `edas_dev_pw`, MinIO `edas_minio_dev_pw`) and freshly generated 48-character `SESSION_SECRET` values. They are ignored by git (`git check-ignore -v .env api/.env`), and `npm run check:secrets` fails the build when an environment file other than `.env.example` is tracked, when a private key is present, or when a sealing secret is hardcoded in source. CI runs it.

### 🚀 Deployment

The `docker compose` file in this repository is for local development. Production needs:

- The API image from `api/Dockerfile` (build context is the repo root because `@edas/shared` is a local package); it runs as the unprivileged `node` user.
- PostgreSQL 16, Keycloak 26 and MinIO (or any S3-compatible store) managed outside the compose file.
- A static host serving the `npm run build` output from `dist/`, plus a reverse proxy that terminates TLS in front of the SPA and the API.

**Reverse proxy and cookies:** forward `Host` and `X-Forwarded-Proto` unchanged, and set `APP_BASE_URL` (SPA origin), `API_PUBLIC_URL` (API origin) and `SESSION_COOKIE_SECURE=true`. `CORS_ORIGINS` must be an explicit list of `https://` origins; the API rejects `*` and `http://` when `NODE_ENV=production`.

**Required in production — the API refuses to boot without them:** `DATABASE_URL`, `KEYCLOAK_ISSUER`, `KEYCLOAK_AUDIENCE`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `CORS_ORIGINS`, `SESSION_SECRET`. It also rejects the development credentials (`admin`, `edas_dev_pw`, `edas_minio_dev_pw`) and any `SESSION_SECRET` or `DOWNLOAD_TICKET_SECRET` shorter than 32 characters — see [`env.validation.ts`](api/src/common/config/env.validation.ts).

**Keycloak:** import a separate production realm, put it behind HTTPS, and register `<API_PUBLIC_URL>/api/v1/auth/callback` as the redirect URI and the same origin as a web origin. Do not reuse `infra/keycloak/realm-edas.json`: its users have development passwords and its `edas-cli` client enables the password grant.

**Upgrades:** apply migrations before starting the new release with `cd api && npx prisma migrate deploy` (the compose container does this on every boot). Never use `prisma db push` in production. Watch `/api/v1/health` and `/api/v1/health/ready`, and keep a restart policy (`restart: unless-stopped` or the platform equivalent). To scrape metrics, set `METRICS_TOKEN` (32+ characters) and send `Authorization: Bearer` from Prometheus; without the token `/api/v1/metrics` returns 403 in production.

| Secret | Effect of rotation |
| --- | --- |
| `SESSION_SECRET` | Every browser session is invalidated and users sign in again |
| `DOWNLOAD_TICKET_SECRET` | Every issued download link stops working immediately |
| `KEYCLOAK_ADMIN_PASSWORD` · `MINIO_SECRET_KEY` · `DATABASE_URL` | The service and the underlying account must change together, so plan a short maintenance window |
| Keycloak client secret (if a confidential client is used) | Redeploy with the same value on every API replica |

Rule of thumb: one value across all replicas, update the source of truth, then restart gradually. Rotate `SESSION_SECRET` outside working hours because it cuts existing sessions.

**Scaling:** the preview queue and preview cache live inside one API process, so run a single replica until the queue moves to Redis/BullMQ. Download tickets are stateless and work across replicas, and the expired-session cleanup (`SESSION_CLEANUP_INTERVAL_MS`, default one hour) is safe on multiple replicas because it only repeats an idempotent delete.

### 💾 Backup and restore

Two sources must be copied together:

- **PostgreSQL:** metadata, access rules, sessions and the hash-chained audit log — none of it can be rebuilt from the files.
- **MinIO/S3:** uploaded originals (`documents/…`) and cached previews (`previews/…`) — document rows without their objects have no content.

The two are not captured at the same instant: take the PostgreSQL dump first and mirror the bucket afterwards, or stop the API container while copying to guarantee consistency.

```bash
# 1) database (custom, compressed format)
docker compose exec -T postgres pg_dump -U edas -Fc edas > edas-$(date +%F).dump

# 2) objects (after pointing an mc alias at the endpoint and credentials)
mc alias set edas http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mirror --overwrite edas/edas-documents ./backup/edas-documents
```

**Restore** into an empty or an existing database and bucket:

```bash
docker compose stop api
docker compose exec -T postgres pg_restore -U edas -d edas --clean --if-exists < edas-2026-11-11.dump
mc mirror --overwrite ./backup/edas-documents edas/edas-documents
cd api && npx prisma migrate deploy
docker compose start api
```

Use the `pg_restore` major version that matches the `pg_dump` that produced the archive (16). After restoring, check `/api/v1/health/ready`, open a document and exercise preview plus download (download re-checks access to the stored original), and query `/api/v1/audit` to confirm the audit chain continues.

**Operational commitment:** the repository ships no scheduled backup job and no bucket versioning, so backups are an operational responsibility. Suggested minimum: daily `pg_dump` with 30-day retention, a daily `mc mirror` to off-site storage, a separate weekly copy, and a restore test every quarter. Recovery time equals `pg_restore` + `mc mirror`, so measure it during a restore test instead of guessing.

### 📦 Dependencies and `npm audit`

`npm audit --audit-level=high` runs in CI for both packages after install, so a new high or critical advisory fails the build. Both trees were audited and updated; the fixes are pinned in `overrides` because several vulnerable packages are transitive and their parents have not released patched versions yet:

| Override | Why |
| --- | --- |
| `minimatch@^11` (in `eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree`) | the only patched release (11.0.1+) is a major the parents have not adopted |
| `esbuild@^0.28` · `nanoid@^3.3.20` · `source-map-js@^1.2.2` | patched releases under `vite` and `postcss` |
| `body-parser@^2.4` · `fast-uri@^3.1.9` · `glob@^14` · `deepmerge-ts@^8` | patched releases under `express`, `ajv`, `@nestjs/cli` and `@prisma/config` |

`vite` was upgraded to `7.3.8` and `@nestjs/platform-express` to `11.2.9` (which pins `multer@2.5.0`). The three remaining advisories are **low** and limited to the build toolchain: `deepmerge` (`>=4.2.0`) has never published a fix, and it only arrives through `@nestjs/cli` → `fork-ts-checker-webpack-plugin`, which is used while building, not at runtime. Removing them needs `@nestjs/cli` 12, which requires TypeScript 6 and `@nestjs/schematics` 12 — a toolchain migration, not a patch. Revisit the overrides once `eslint`, `@typescript-eslint` and `@nestjs/cli` ship the patched transitives themselves.

### 🗂️ Project structure

```text
api/                 NestJS backend (own package.json, Prisma schema, Dockerfile)
packages/shared/     shared contracts (roles, permission matrix, API DTOs) — single source of truth
infra/keycloak/      Keycloak realm import (edas realm)
e2e/browser/         Playwright browser smoke test (config at playwright.config.ts)
docs/                screens audit (Arabic/English) and design notes
docker-compose.yml   local stack: PostgreSQL + Keycloak + MinIO + API
src/
  components/        shared UI (ui.tsx, shared.tsx, Layout, navigation, assistant)
  pages/             one file per route; large pages have co-located *-parts.tsx files
  lib/               pure logic (permissions engine, validation, API client)
  utils/             persistence, ids
  store.tsx          app session/theme/lang/toasts (React context)
  store-docs.tsx     domain state (documents, folders, ACLs, tasks, …)
  data.ts            mock seed data
  i18n.ts            ar/en translation dictionaries
  types.ts           domain types
```

Route definitions live in `src/App.tsx`; navigation and role-based access live in `src/components/nav-config.ts`. Contribution rules and the verification gates are in [`AGENTS.md`](AGENTS.md).

<a name="en-limits"></a>

### ⚠️ Demo limitations

- **Prototype auth by default:** without the `VITE_` variables, any username/password logs in as a demo user and the password is not verified (`src/pages/auth-login.tsx`). With them, authentication goes through Keycloak (authorization code + PKCE).
- **API wiring is partial:** authentication, documents, folders, ACLs, versions, uploads, trash, retention items, legal holds, workflow tasks, notifications, audit trail, saved searches, the organization directory, retention policies, approval chains, system settings, dashboard KPIs, report schedules/runs and the template catalog go through the API in API mode; a few dashboard deltas and the role/permission demo pages still use local demo data (`src/data.ts` and `edas.v1.` `localStorage` keys via `src/utils/persist.ts`).
- **Client-side access control** is illustrative only, not a security boundary (the API enforces it server-side).
- Some displayed metrics and figures are hard-coded placeholders.

### ♿ Accessibility & i18n

The UI is RTL by default (`<html dir="rtl" lang="ar">`) and switches to LTR/English through the language toggle. Translations live in `src/i18n.ts`; the `ar` and `en` dictionaries must stay in sync. Logical Tailwind utilities (`ps-`, `me-`, `rtl:`) are used throughout, and `eslint-plugin-jsx-a11y` is enabled (real interactive elements; click-only overlays set `aria-hidden="true"`).

---

<div align="center"><sub>EDAS · نظام الأرشفة الإلكترونية للوثائق / Electronic Document Archiving System</sub></div>
