# النسخ الاحتياطي والاستعادة — EDAS

هذا الدليل يغطي نسخ PostgreSQL وMinIO وسجلات التدقيق، وأهداف الاستعادة، وخطوات التحقق. لا ينفّذ أي أمر على قاعدة إنتاج حقيقية؛ كل الأوامر أدناه مخصّصة لبيئة اختبار معزولة أو لنسخ قراءة فقط.

## الأهداف

| العنصر          | الهدف                                               |
| --------------- | --------------------------------------------------- |
| RPO             | ساعة واحدة (نسخ WAL كل 15 دقيقة + نسخة كاملة يومية) |
| RTO             | 4 ساعات للاستعادة الكاملة                           |
| الاحتفاظ اليومي | 30 يومًا                                            |
| الاحتفاظ الشهري | 12 شهرًا                                            |
| سجلات التدقيق   | تُحفظ مع PostgreSQL؛ لا تُفصل عن النسخة             |

## ما يُنسخ

1. **PostgreSQL**: قاعدة `edas` كاملة، وتشمل المستخدمين والصلاحيات والمستندات و`AuditEvent` و`UserSession`.
2. **MinIO**: كائنات `documents/` و`previews/`، مع تفعيل Bucket Versioning في `docker-compose.yml` لحماية الكتابة فوق النسخ.
3. **إعدادات النشر**: ملفات `.env` ليست نسخة بيانات، لكن يجب حفظ قيم الأسرار في مدير أسرار خارجي، لا داخل النسخة.
4. **مفتاح تشفير النسخ**: منفصل عن النسخة نفسها، وإلا فقد الغرض منه.

## النسخة المحلية

```bash
BACKUP_DIR=/srv/edas-backups RETENTION_DAYS=30 bash scripts/backup/backup.sh
bash scripts/backup/verify.sh /srv/edas-backups/<timestamp>
```

`backup.sh` ينفّذ `pg_dump --format=custom` ثم يؤرشف حجم `miniodata`، ويكتب `SHA256SUMS` و`MANIFEST`. لا يوقف الحاوية.

على Windows شُغّل السكربتان من Git Bash بمسارات بأسلوب ويندوز مع تعطيل تحويل مسارات MSYS (`MSYS_NO_PATHCONV=1`) وتمرير مسار `docker-compose.yml` بصيغة ويندوز؛ بدون ذلك فُسِّرت وسائط `-v` بشكل خاطئ. في الإنتاج (Linux) لا حاجة لذلك.

## نسخة PostgreSQL متواصلة (PITR)

في الإنتاج، شغّل `archive_mode=on` و`archive_command` إلى تخزين خارجي، مع نسخة أساس أسبوعية:

```conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
archive_timeout = 900
```

ثم استخدم `pg_basebackup` أسبوعيًا. عند الاستعادة إلى نقطة زمنية:

```bash
pg_restore --clean --if-exists --no-owner -d edas /backups/base.dump
# ثم أعِد تشغيل PostgreSQL مع recovery_target_time في postgresql.auto.conf
```

لا تنفّذ `--clean` على قاعدة الإنتاج دون نسخة تحقق ناجحة وبموافقة صريحة.

## MinIO

- فعّل `put-bucket-versioning` (مفعّل في `minio-init`).
- انسخ الكائنات بـ`mc mirror --preserve` إلى موقع خارجي، أو استخدم `backup.sh` للأرشفة.
- استخدم دورة حياة لحذف النسخ القديمة فقط بعد انتهاء مدة الاحتفاظ المعتمدة.
- لا تجعل الـBucket عامًا، ولا تضع روابط كائنات دائمة في السجلات.

## الاستعادة المعزولة

1. أنشئ قاعدة جديدة `edas_restore_<date>`، لا تعدّل `edas`.
2. استعد `postgres.dump` إليها، ثم شغّل ترحيلات Prisma للتحقق من التوافق:
   `cd api && DATABASE_URL=... npx prisma migrate deploy`.
3. استعد أرشيف MinIO إلى Bucket جديد `edas-documents-restore`.
4. شغّل API في بيئة منفصلة بمتغيرات تشير إلى القاعدة والـBucket الجديدين، ثم افتح مستندًا واختبر:
   - تسجيل الدخول عبر Keycloak،
   - قائمة المستندات وصلاحية `VIEW`،
   - تنزيل نسخة أصلية ومعاينة،
   - عنصر احتفاظ وحجز قانوني،
   - حدث تدقيق جديد يظهر بسلسلة hash سليمة.
5. لا توجّه المستخدمين إلى البيئة المستعادة قبل اجتياز قائمة التحقق.

## المراقبة والتنبيه

- تنبيه إذا تأخرت آخر نسخة ناجحة أكثر من 90 دقيقة.
- تنبيه إذا فشل `verify.sh`.
- تنبيه إذا تجاوز حجم النسخة 150% من المتوسط.
- اختبار استعادة كامل ربع سنوي، مع تسجيل النتيجة في سجل التشغيل.

## القيود الحالية

- لا توجد في المستودع بنية تخزين خارجي أو مفاتيح تشفير إنتاجية؛ يجب توفيرها من منصة النشر.
- `backup.sh` و`verify.sh` شُغّلا محليًا بنجاح (2026-11-17): النسخة أنتجت `postgres.dump` و`minio-data.tar.gz` و`SHA256SUMS`، وأعاد التحقق الاستعادة إلى قاعدة `edas_verify_*` معزولة (Document=25، Folder=14، AuditEvent=944) وقرأ أرشيف MinIO، ثم حذف القاعدة المؤقتة تلقائيًا.
- الاستعادة إلى إنتاج حقيقي تتطلب موافقة صريحة وخطة صيانة معلنة.

## النسخ خارج الموقع المشفّر (0.1.1)

`scripts/backup/backup.sh` ينسخ محليًا فقط. النسخة الخارجية تُنفَّذ عبر `scripts/backup/offsite.sh` بعد نجاح النسخة المحلية، ولا تُرفع أي بيانات صريحة أبدًا.

| المتغير | الغرض | الافتراضي |
| --- | --- | --- |
| `BACKUP_OFFSITE_BUCKET` | حاوية S3 المتوافقة (حساب/بيئة مستقلة) | فارغ = تخطٍّ صريح |
| `BACKUP_OFFSITE_PREFIX` | بادئة المفاتيح | `edas` |
| `BACKUP_OFFSITE_RETENTION_DAYS` | حذف النسخ الأقدم من N يومًا | فارغ = لا حذف |
| `BACKUP_S3_REGION` / `BACKUP_S3_ENDPOINT` | المنطقة/نقطة نهاية S3 المتوافقة | `us-east-1` / AWS |
| `BACKUP_ENCRYPTION_PASSPHRASE_FILE` | ملف عبارة التشفير (مفضّل) | — |
| `BACKUP_ENCRYPTION_PASSPHRASE` | عبارة التشفير عبر البيئة (بديل) | — |

- التشفير: `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000` لكل من `postgres.dump` و`minio-data.tar.gz`، والرفع بصيغة `.enc` فقط.
- بعد الرفع يُعاد تنزيل الكائن ويُقارن `sha256` مع الملف المشفّر محليًا، ثم يُتحقق من وجود المفتاح عبر `s3api head-object`.
- الحذف وفق سياسة الاحتفاظ يحدث **بعد** نجاح كل الرفع والتحقق فقط، ولا يحدث إطلاقًا إذا كان `BACKUP_OFFSITE_RETENTION_DAYS` فارغًا أو `0`.
- غياب `BACKUP_OFFSITE_BUCKET` يطبع «skipping the off-site copy» ولا يدّعي نجاح النسخ الخارجي.
- مفاتيح الاعتماد تُقرأ من بيئة AWS (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` أو `AWS_PROFILE`) ولا تُكتب في أي ملف داخل المستودع.

### الجدولة عبر systemd

الوحدات في `infra/systemd/`:

```bash
sudo install -d -o edas -g edas /srv/edas-backups
sudo install -d -m 0750 /etc/edas
sudo install -m 0640 -o root -g edas infra/systemd/backup.env.example /etc/edas/backup.env
sudo install -m 0644 infra/systemd/edas-backup.service infra/systemd/edas-backup-verify.service /etc/systemd/system/
sudo install -m 0644 infra/systemd/edas-backup.timer infra/systemd/edas-backup-verify.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now edas-backup.timer edas-backup-verify.timer
systemctl list-timers 'edas-*'
```

- `edas-backup.timer`: يوميًا 02:15 مع تأخير عشوائي 15 دقيقة و`Persistent=true` لتعويض فوات النافذة.
- `edas-backup-verify.timer`: تدريب استعادة أسبوعي (الأحد 05:00) عبر `verify-latest.sh`.
- المستخدم `edas` يحتاج عضوية `docker`، وملف `/etc/edas/backup.env` بصلاحية `0640`.

### التحقق من نسخة مشفّرة

```bash
export BACKUP_ENCRYPTION_PASSPHRASE_FILE=/etc/edas/backup-passphrase
bash scripts/backup/verify.sh /srv/edas-backups/<timestamp>
```

`verify.sh` يفك التشفير إلى مجلد مؤقت، يتحقق من `SHA256SUMS`، يستعيد في قاعدة `edas_verify_*` معزولة، ويحذفها عند الخروج. لا تُطبع عبارة التشفير.

### حالة الجاهزية (شفافية)

التكامل والاختبارات الآلية جاهزة (`scripts/backup/offsite.test.sh`، وتشغيلها في CI على حاوية S3 وهمية محلية). لم يُتحقق بعد من **رفع واستعادة فعليين من تخزين خارجي حقيقي** لعدم توفر بيانات اعتماد؛ لذلك لا تُعد النسخ الخارجية جاهزة للإنتاج حتى يُنفَّذ تمرين استعادة واحد من الحاوية الخارجية ويُوثَّق هنا.
