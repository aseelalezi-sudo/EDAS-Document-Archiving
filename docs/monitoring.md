# المراقبة والتنبيهات — EDAS

## المكوّنات

مكدّس المراقبة كامل كخدمات اختيارية في `docker-compose.yml` تحت profile اسمه `observability`:

| الخدمة                  | الغرض                                          | المنفذ الافتراضي |
| ----------------------- | ---------------------------------------------- | ---------------- |
| Prometheus              | جمع `/api/v1/metrics` وتقييم `alerts.yml`      | 9090             |
| Alertmanager            | استقبال التنبيهات وتجميعها وكبت الأقل خطورة    | 9093             |
| Grafana                 | لوحة `EDAS API` ومصدرا بيانات Prometheus وLoki | 3000             |
| Loki                    | تجميع سجلات API المهيكلة                       | 3100             |
| Promtail                | قراءة سجلات حاوية API وإرسالها إلى Loki        | داخلي            |
| OpenTelemetry Collector | استقبال OTLP وإرساله إلى Jaeger                | 4317/4318        |
| Jaeger                  | عرض التتبّع الموزّع                            | 16686            |

## التشغيل

```bash
METRICS_TOKEN="$(openssl rand -hex 24)" \
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318 \
docker compose --profile observability up -d
```

- افتح Grafana على `http://localhost:3000` (بيانات الدخول التطويرية `admin/admin`، وبدّلها فورًا).
- افتح Jaeger على `http://localhost:16686`.
- إن كان المنفذ مشغولًا استخدم `GRAFANA_PORT` أو `PROMETHEUS_PORT` أو `LOKI_PORT` أو `JAEGER_UI_PORT` أو `REDIS_PORT`.
- أوقف خدمات المراقبة وحدها بـ`docker compose --profile observability stop prometheus alertmanager loki promtail grafana otel-collector jaeger`.

## ربط التتبع والسجلات

- API يبدأ OpenTelemetry SDK فقط عند ضبط `OTEL_EXPORTER_OTLP_ENDPOINT`.
- `HttpInstrumentation` و`ExpressInstrumentation` تنشئ spans للطلبات والوسطاء.
- `api/src/common/middleware/trace-context.ts` يقرأ الـspan النشط، فيحمل سجل JSON نفس `traceId` و`spanId` الظاهرين في Jaeger.
- يدعم الخادم W3C `traceparent` الوارد، ويعيد `x-trace-id` و`traceparent` في الاستجابة.
- عند تعطّل جامع OTLP لا يتوقف التطبيق؛ يُسجَّل الخطأ في `console.error` ويعمل بلا تتبّع.

## أهداف الخدمة (SLO)

| المؤشر            | الهدف                         |
| ----------------- | ----------------------------- |
| التوفر            | 99.9% شهريًا                  |
| زمن الاستجابة p95 | أقل من ثانية للطلبات العادية  |
| نسبة 5xx          | أقل من 2%                     |
| جاهزية القاعدة    | 100% لمدة 5 دقائق قبل التنبيه |

قواعد `alerts.yml` تغطي تعطل API، فشل readiness، نسبة 5xx، بطء p95، تراكم الطلبات، الذاكرة، وتأخر event loop. أضف تنبيهًا خارجيًا لآخر نسخة احتياطية ناجحة (انظر `docs/backup-restore.md`).

## التنبيهات

- `alertmanager.yml` يوجّه إلى receiver فارغ اسمه `default`، ويجمّع حسب `alertname` و`severity`، ويكبت التحذيرات عند وجود تنبيه حرج لنفس الاسم.
- اربط receiver فعليًا (بريد، Slack، PagerDuty، webhook) قبل الإنتاج؛ لا تُرسل بيانات مستندات أو أسرار في التنبيهات.
- كل تنبيه يحمل `severity`، ويفضّل إضافة `runbook_url` في `annotations`.

## الأمان

- `/api/v1/metrics` مقيّد بـ`METRICS_TOKEN` في الإنتاج؛ يستخدمه Prometheus عبر Docker secret `/run/secrets/metrics_token`.
- لا تنشر Prometheus أو Grafana أو Jaeger على الإنترنت العام دون مصادقة شبكية أو SSO.
- احتفظ بالمقاييس 30 يومًا (Prometheus)، والسجلات 31 يومًا (Loki `retention_period: 744h`)، وسجلات التدقيق حسب المتطلبات.
- لا تُسجّل الرموز أو الكوكيز أو `x-csrf-token` أو محتوى المستندات. Promtail يجمع حاوية API فقط ويستخرج `level` و`correlationId`، ولا يجعل `traceId` تسمية عالية التكرار.

## التحقق

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/infra/monitoring:/m" -v "$PWD/.metrics-token:/run/secrets/metrics_token:ro" \
  --entrypoint promtool prom/prometheus:v3.5.0 check config /m/prometheus.yml

MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/infra/monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  --entrypoint amtool prom/alertmanager:v0.28.1 check-config /etc/alertmanager/alertmanager.yml

MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/infra/monitoring/loki.yml:/etc/loki/loki.yml:ro" \
  grafana/loki:3.5.1 -config.file=/etc/loki/loki.yml -verify-config

MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/infra/monitoring/otel-collector.yml:/etc/otelcol-contrib/config.yml:ro" \
  otel/opentelemetry-collector-contrib:0.140.0 validate --config=/etc/otelcol-contrib/config.yml
```

## القيود

- المكدّس محلي/مفرد: لا HA لـPrometheus أو Loki، ولا تخزين كائنات بعيد، ولا مصادقة Grafana مسبقة.
- Alertmanager لا يملك قناة إشعار حقيقية بعد.
- تتبّع قاعدة البيانات وRedis غير مفعّل؛ spans الحالية تغطي HTTP وExpress فقط.
