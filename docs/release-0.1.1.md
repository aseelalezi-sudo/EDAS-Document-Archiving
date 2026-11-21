# ملاحظات الإصدار 0.1.1 — EDAS

> **النوع:** إصدار إصلاحات وتثبيت تشغيلي (Patch). **لا تغييرات هيكلية.**
> **الفرع:** `fix/0.1.1-stabilization` (متفرّع من `master` عند `a122472`، والوسم `v0.1.0` لم يُحرَّك).
> **تاريخ التحقق:** 2026-11-21. **الوسم `v0.1.1` لم يُنشأ بعد** بانتظار خضرة CI ومراجعة التغييرات.

## نطاق الإصدار

| داخل النطاق                                       | خارج النطاق (مؤجل إلى `0.2.0`)              |
| ------------------------------------------------- | ------------------------------------------- |
| إغلاق ثغرة `effect` وتثبيت بوابة التدقيق          | ترقيم قوائم السلة/الاحتفاظ/الموظفين (M1)    |
| تحقق سلسلة التدقيق بالدفعات                       | ترحيل `L(ar,en)` إلى `i18n.ts` (L2)         |
| تثبيت Node 22 واستقرار التغطية                    | تفكيك `store-docs.tsx` (L3)                 |
| تسليم تنبيهات Alertmanager إلى Webhook            | ترحيل `prisma.config.ts` (مرتبط بـPrisma 7) |
| نسخ احتياطي خارجي مشفّر + systemd + تدريب استعادة | تغييرات واجهة أو مسارات جديدة               |

## قائمة التحقق والقياس

| البوابة                                         | النتيجة                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run typecheck` / `lint` / `format:check`   | ✅ 0 أخطاء / 0 تحذيرات                                                            |
| `npm run check:secrets`                         | ✅ 579 ملفاً متتبعاً / 586 مفحوصاً                                                |
| `npm test` (SPA، Node 22)                       | ✅ **112 ملفاً / 1,441 اختباراً**                                                 |
| SPA coverage (Node 22)                          | ✅ **92.10 / 82.44 / 88.66 / 94.15** (العتبة 74/67/69/76)                         |
| `npm run test:browser`                          | ✅ **4/4** Chromium (دخول، مستند+معاينة، لغة/RTL، CSP)                            |
| `npm run build`                                 | ✅                                                                                |
| API: typecheck / lint / build                   | ✅                                                                                |
| API tests (Node 22)                             | ✅ **84 ملفاً / 1,215 اختباراً**                                                  |
| API coverage                                    | ✅ **98.20 / 98.08 / 98.20 / 98.20** (العتبة 98)                                  |
| `npx prisma validate`                           | ✅                                                                                |
| `npm audit --omit=dev` (الجذر + API)            | ✅ **0**                                                                          |
| `bash scripts/backup/offsite.test.sh`           | ✅ 5 سيناريوهات (تخطٍّ، رفض بلا تشفير، رفع+تحقق+تقليم، فك تشفير، احتفاظ غير محدد) |
| `docker compose --profile observability config` | ✅                                                                                |
| `amtool check-config` (بعد تصيير القالب)        | ✅                                                                                |
| تسليم Alertmanager فعلي إلى Webhook محلي        | ✅ وصل `status=firing`                                                            |
| استقرار التغطية على Node 22                     | ✅ **5 تشغيلات متتالية** بلا فشل (دون retries)                                    |

## الالتزامات (commits)

1. `fix(api): clear the effect advisory with a pinned override`
2. `perf(api): stream audit-chain verification in batches`
3. `chore(api): load the vitest config as an ES module`
4. `docs: add the 0.1.0 technical report and remediation plan`
5. `chore(tooling): pin Node 22 and stabilize the coverage run`
6. `feat(backup): add encrypted off-site copies and systemd drills`
7. `feat(monitoring): deliver alerts to a configurable webhook`
8. `chore(release): 0.1.1` (هذا الالتزام: رفع الإصدار وملاحظات الإصدار)

## متطلبات تشغيلية متبقية قبل اعتبار M3/M4 «إنتاجية»

1. **التنبيهات (M3):** إعادة اختبار التسليم على عنوان المؤسسة الحقيقي (Slack/Webhook) وتوثيق النتيجة. التوصيل تحقق على مستقبِل محلي فقط.
2. **النسخ خارج الموقع (M4):**
   - توفير حساب/بيئة S3 مستقلة عن الإنتاج + مفاتيح AWS على الخادم.
   - عبارة تشفير في `/etc/edas/backup-passphrase` (أو Docker/systemd secret) بصلاحية `0640`.
   - تفعيل `edas-backup.timer` و`edas-backup-verify.timer` بعد ضبط `/etc/edas/backup.env`.
   - تنفيذ **استعادة فعلية من الحاوية الخارجية** مرة واحدة وتوثيقها؛ حتى ذلك الحين النسخ الخارجية غير معتمدة إنتاجياً (النسخة المحلية ليست بديلاً).
3. **CI:** انتظار خضرة الـ5 مهام (SPA، API، E2E، Docker، Backup/Alerting، Browser) قبل الوسم والدمج.

## الترقية والتراجع

- الترقية: `npm ci --legacy-peer-deps` في الجذر و`api`، ثم `npm run shared:build`، ثم `npm --prefix api run prisma:generate`. لا ترحيلات جديدة في هذا الإصدار.
- التراجع: `git revert` لالتزامات الإصدار أو العودة إلى `v0.1.0`؛ لا تغييرات مخطط، لذا لا حاجة لتراجع قاعدة بيانات.
- السياسة الكاملة في `docs/release-process.md`، والنسخ في `docs/backup-restore.md`.
