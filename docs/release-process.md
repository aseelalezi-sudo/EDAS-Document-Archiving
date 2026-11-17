# عملية الإصدار — EDAS

## السياسة

- الإصدارات تتبع Semantic Versioning: `MAJOR.MINOR.PATCH`.
- المرشّح الحالي `0.1.0`. لا يُنشأ وسم أو نشر رسمي قبل موافقة مالك الإصدار.
- كل تغيير يمسّ الصلاحيات أو الترحيلات يحتاج مراجعة أمنية صريحة.
- فرع الإصدار `release/x.y` من `master`، والوسم `vX.Y.Z` على commit الإصدار فقط.

## قائمة التحقق قبل الإصدار

1. الشجرة نظيفة، وكل تغيير مطلوب مرفق باختبار.
2. تحديث `CHANGELOG.md` تحت `[Unreleased]` ثم نقله إلى `[X.Y.Z]`.
3. تشغيل البوابات كاملة:
   ```bash
   npm run typecheck && npm run lint && npm run format:check && npm run check:secrets
   npm test && npm run test:coverage && npm run build && npm run test:browser
   cd api && npm run typecheck && npm run lint && npm test && npm run test:coverage && npm run build
   npm audit --audit-level=high
   ```
4. `cd api && npx prisma validate` ومراجعة SQL في `prisma/migrations/` (لا `db push`).
5. بناء صورة API ووسمها بـdigest أو نسخة ثابتة، لا `latest`.
6. التحقق من `/api/v1/health/ready` في بيئة staging، ومن مصفوفة ACL (سماح/منع/نطاق/وراثة).
7. تشغيل `scripts/backup/backup.sh` ثم `scripts/backup/verify.sh` قبل الترقية.
8. اعتماد مالك الإصدار، ثم إنشاء الوسم ودفعه.

## الترقية

```bash
cd api && npx prisma migrate deploy
docker compose build api
docker compose up -d --no-deps api
```

الترحيلات additive افتراضيًا. أي ترحيل حذف/إعادة تسمية يحتاج خطة توافق مسبقة (expand/contract) وموافقة صريحة.

## التراجع

- إذا فشل الترحيل: أوقف الـAPI، استعد النسخة الاحتياطية المحققة في قاعدة معزولة أولًا، ثم قرر الاستعادة الكاملة.
- إذا فشل التطبيق بعد ترحيل ناجح: أعد الصورة السابقة (digest قديم)؛ لا تعكس الترحيل يدويًا.
- إذا تغيّر نموذج الصلاحيات: أعد الصورة والبيانات معًا، ولا تشغّل إصدارًا قديمًا على مخطط جديد.
- سجّل الحادث و`correlationId` وأي تغييرات بيانات في سجل التشغيل.

## الوسوم والصور

- صور `docker-compose.yml` و`api/Dockerfile` مثبّتة الآن على digests محلية متحققة؛ أعد التحقق منها عند الترقية (`docker image inspect`) بدل استخدام `latest`.
- `MINIO_IMAGE` و`AWS_CLI_IMAGE` يجب تمريرهما بقيم ثابتة في الإنتاج؛ القيم الافتراضية للتطوير فقط.
- لا تضع أسرارًا في مستودع الصور أو ملفات `.env` الملتزمة.

## التوافق

- الـAPI والـSPA يُنشران معًا؛ لا يُفترض توافق SPA جديد مع API قديم عند تغيير عقد الصلاحيات.
- `@edas/shared` يُبنى قبل API، ويُعاد تثبيت API بعد تغيير `package.json` الخاص به.
