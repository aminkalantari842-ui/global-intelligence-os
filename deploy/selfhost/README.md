# خودمیزبانی Convex برای Global Intelligence OS

این پوشه، بکاند این برنامه (همان ۱۶۲ تابع، ۳۸ جدول و ۱۲ کران، **بدون هیچ تغییر کد**) را روی سرور خودت اجرا میکند. موتور Convex اوپنسورس است (`get-convex/convex-backend`)، پس همان چیزی را اجرا میکنی که ابر Convex اجرا میکند — فقط بدون سهمیه و محدودیت پلن.

- ورودیها: `docker-compose.yml` (بکاند + داشبورد)، `Caddyfile` (TLS و مسیریابی)، `migrate-data.sh` (انتقال داده و بازسازی)
- خروجی: بکاند روی `https://api.example.com`، HTTP actions روی `https://site.example.com`، داشبورد روی `https://dash.example.com`
- هزینه: یک سرور ۵ تا ۱۵ دلاری در ماه

---

## ۰) چیزهایی که باید از قبل داشته باشی

- یک سرور لینوکسی (توصیه: ۴ هسته، ۴ گیگ رم، ۴۰ گیگ دیسک SSD) با Docker و Docker Compose v2
- یک دامنه با سه رکورد A به IP سرور: `api.example.com`، `site.example.com`، `dash.example.com`
- پورتهای ۸۰ و ۴۴۳ باز (Caddy خودش گواهی TLS میگیرد و تمدید میکند)

```bash
# نمونه آمادهسازی روی Ubuntu
sudo apt update && sudo apt install -y docker.io docker-compose-v2 curl
sudo usermod -aG docker "$USER"   # سپس یکبار logout/login
sudo ufw allow 80,443/tcp && sudo ufw enable
```

## ۱) فایل تنظیمات سرور

کنار `docker-compose.yml` یک `stack.env` بساز (این فایل هرگز نباید commit شود؛ در `.gitignore` هست):

```bash
CONVEX_REV=latest
INSTANCE_NAME=global-intelligence-os
INSTANCE_SECRET=<openssl rand -hex 32>
CONVEX_CLOUD_ORIGIN=https://api.example.com
CONVEX_SITE_ORIGIN=https://site.example.com
NEXT_PUBLIC_DEPLOYMENT_URL=https://api.example.com
```

| متغیر | چرا مهم است |
|---|---|
| `INSTANCE_SECRET` | رمز داخلی نمونه. **قبل از اولین اجرا** عوضش کن؛ مقدار پیشفرض ناامن است |
| `CONVEX_CLOUD_ORIGIN` | همان URLی که مرورگر برای API صدا میزند. اگر `127.0.0.1` بماند، فرانت کار نمیکند |
| `CONVEX_SITE_ORIGIN` | آدرس HTTP actions (CORS و لینکها بر همین مبنا ساخته میشوند) |
| `V8_ACTION_USER_TIMEOUT_SECS`، `NODE_ACTION_USER_TIMEOUT_SECS` | اگر اکشن بلند هوش مصنوعی (ترجمه متن کامل، گزارش هفتگی) نصفهکاره قطع شد، اینجا بالا ببر |

```bash
chmod 600 stack.env
```

## ۲) بالا آوردن بکاند

```bash
cd deploy/selfhost
docker compose --env-file stack.env up -d
docker compose --env-file stack.env ps          # هر دو سرویس باید healthy باشند
curl -fsS http://127.0.0.1:3210/version && echo
```

گرفتن admin key (برای CLI و داشبورد):

```bash
docker compose --env-file stack.env exec backend ./generate_admin_key.sh
```

پورتها فقط روی loopback باز شدهاند؛ تنها درِ عمومی، پروکسی است.

## ۳) پروکسی و TLS

`Caddyfile` را با دامنههای خودت ویرایش کن و بعد:

```bash
sudo docker run -d --name caddy --restart unless-stopped \
  --network host \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v caddy-data:/data -v caddy-config:/config \
  caddy:2
```

سه دامنه باید باز شوند: `api.` (ویرایش API و WebSocket سینک)، `site.` (HTTP actions)، `dash.` (داشبورد).

> بدون HTTPS کار نمیکند: مرورگر روی صفحهٔ https اجازهٔ اتصال به بکاند http را نمیدهد. پس دامنه و TLS جزء الزاماتاند، نه تزئین.

## ۴) اتصال پروژه به سرور خودت

روی ماشینی که مخزن کد در آن است، مقادیر زیر را ست کن (میخواهند بهجای ابر، به سرور تو اشاره کنند):

```bash
CONVEX_SELF_HOSTED_URL=https://api.example.com
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin key>
```

سپس فشار دادن کد و اجرای کوئریها:

```bash
bunx convex dev --once          # ۱۶۲ تابع و ۳۸ جدول را روی سرور خودت push میکند
bunx convex data thinkTanks --limit 3
```

**متغیرهای محیطی خود توابع** (کلیدهای هوش مصنوعی) جدا از سرور ذخیره میشوند:

```bash
bunx convex env set AI_API_KEY 'sk-...'                 # همان کلید قبلی
bunx convex env set AI_BASE_URL 'https://vyceai.com/v1'
bunx convex env set AI_MODEL 'deepseek-v4.1'
```

(اگر CLI روی نسخهٔ خودمیزبان این را قبول نکرد، همین کلیدها را در داشبورد خودمیزبان → Settings → Environment Variables وارد کن. کلید را از تب Keys پلتفرم بردار و اینجا مستقیم paste کن؛ من آن را نمیخوانم.)

**سمت فرانتاند**: آدرس بکاند از `VITE_CONVEX_URL` خوانده میشود. برای استقرار مستقل، همین مقدار را برابر `https://api.example.com` بگذار و اپ را روی هاست خودت بساز و سرو کن (`bun run build` → پوشهٔ `dist` روی هر وبسرور/CDN). نیازی به تغییر کد نیست.

## ۵) انتقال داده از ابر

```bash
export CONVEX_DEPLOY_KEY='prod:...'        # داشبورد Convex → Project Settings → Deploy Keys
./migrate-data.sh export                   # ابر → ./convex-backup/*.zip

export CONVEX_SELF_HOSTED_URL='https://api.example.com'
export CONVEX_SELF_HOSTED_ADMIN_KEY='<admin key>'
./migrate-data.sh import                   # zip → سرور خودت
./migrate-data.sh verify
```

`_id` و `_creationTime` اسناد حفظ میشوند، پس ارجاعهای بین جدولها (بازیگران، منشنها، ارجاعات مقالات) سالم منتقل میشوند.

**نکتهٔ مهم:** export فقط وقتی کار میکند که دیپلوی ابری «زنده» باشد. اگر پلن مسدود/غیرفعال است، ابتدا موقتاً پلن را فعال کن و بلافاصله export بگیر، بعد به سرور خودت منتقل کن. اگر این ممکن نیست، مسیر بازسازی هست:

```bash
./migrate-data.sh reseed
```

که رجیستری اندیشکدهها را از کد (`thinkTankSeed:syncRegistry`) میسازد و همهٔ فیدهای RSS را دوباره میگیرد (`rssIngest:refreshFeeds`). در این حالت مقالات از منبع اصلی بازخوانی میشوند؛ اما **متنهای ترجمهشده، بریفهای AI و claimهای استخراجشده باید دوباره تولید شوند** (با همان کلید AI و کرانهای موجود، یا با باز کردن مقاله در خواننده).

## ۶) پشتیبانگیری

دو لایه، هر دو را داشته باش:

```bash
# ۱) زیپ قابل حمل (روی خود سرور، در کران شبانه)
0 4 * * * cd /opt/global-intelligence-os/deploy/selfhost && \
  CONVEX_SELF_HOSTED_URL=https://api.example.com \
  CONVEX_SELF_HOSTED_ADMIN_KEY=<admin key> \
  bunx convex export --path /var/backups/convex >> /var/log/convex-backup.log 2>&1

# ۲) اسنپشات ولوم (همه چیز، شامل خود دیتابیس)
docker run --rm -v selfhost_convex-data:/data -v /var/backups:/backup alpine \
  tar czf /backup/convex-data-$(date +%F).tgz -C /data .
```

بازگردانی: `./migrate-data.sh import <backupDir>` یا `docker compose --env-file stack.env down && tar xzf ... && up -d`.

## ۷) بهروزرسانی و نگهداری

```bash
docker compose --env-file stack.env pull     # یا CONVEX_REV=<tag> در stack.env برای نسخهٔ pin شده
docker compose --env-file stack.env up -d
```

- برای محیط عملیاتی، `CONVEX_REV` را به یک تگ مشخص pin کن تا ارتقاها آگاهانه باشند.
- دیتا در ولوم `convex-data` است (پیشفرض SQLite). برای بار سنگینتر میتوانی `POSTGRES_URL` یا `MYSQL_URL` را در `stack.env` بدهی.
- متریکها: `DISABLE_METRICS_ENDPOINT=false` باعث میشود `/metrics` روی پورت ۳۲۱۰ در دسترس باشد (سازگار با Prometheus) — همین برای پایش سلامت منابع و velocity مفید است.
- لاگها: `docker compose --env-file stack.env logs -f backend`

## ۸) نکات امنیتی

- `INSTANCE_SECRET` را قبل از اولین بوت عوض کن و جایی خارج از سرور نگه ندار.
- admin key مثل رمز عمل میکند: در `stack.env` (chmod 600)، در CI بهصورت secret، هرگز در مخزن.
- پورتهای ۳۲۱۰/۳۲۱۱/۶۷۹۱ روی loopback بمانند (همین حالا هستند) و فقط Caddy عمومی باشد.
- داشبورد را میتوانی با basic auth در `Caddyfile` یا محدودسازی IP ببندی.
- `REDACT_LOGS_TO_CLIENT=true` را نگه دار تا جزئیات خطای سرور به مرورگر درز نکند.

## ۹) عیبیابی

| نشانه | علت رایج | کار |
|---|---|---|
| صفحهٔ خطای «BackendGate» با دستهٔ اتصال | فرانت به URL غلط وصل است یا سرور خاموش است | `curl https://api.example.com/version` و سپس `VITE_CONVEX_URL` را بررسی کن |
| مرورگر خطای mixed content / blocked | `VITE_CONVEX_URL` روی `http://` است | همیشه `https://` |
| CORS یا «origin not allowed» | `CONVEX_CLOUD_ORIGIN` با دامنهٔ واقعی یکی نیست | `stack.env` را اصلاح و `up -d` کن |
| داشبورد بالا نمیآید یا ۵۰۳ | `NEXT_PUBLIC_DEPLOYMENT_URL` نادرست | همان `CONVEX_CLOUD_ORIGIN` را بگذار |
| `401`/`admin key rejected` | کلید جابهجا یا کهنه است | `generate_admin_key.sh` را دوباره اجرا کن |
| آپدیتهای زنده نمیرسند | پروکسی بافر میکند | در `Caddyfile` همان `flush_interval -1` را نگه دار |
| دیسک پر میشود | متنهای کامل + ترجمهها | کران پشتیبان/پاکسازی و اسنپشات ولوم را فعال کن |

## چکلیست پایانی

- [ ] `docker compose ps` → هر دو سرویس healthy
- [ ] `https://api.example.com/version` پاسخ میدهد
- [ ] `bunx convex dev --once` بدون خطا توابع را push میکند
- [ ] کلیدهای AI با `convex env set` ست شدهاند
- [ ] داده منتقل شده یا `reseed` اجرا شده
- [ ] `VITE_CONVEX_URL` فرانت به `https://api.example.com` اشاره میکند
- [ ] پشتیبان شبانه و اسنپشات ولوم فعال است
