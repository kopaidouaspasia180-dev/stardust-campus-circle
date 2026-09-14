import fs from "node:fs"
import pg from "pg"
import "dotenv/config"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")

const pool = new pg.Pool({connectionString: databaseUrl})
try {
  const result = await pool.query(
    `select c.slug,c.name,
       (select count(*) from platform_admins a
        where a.tenant_slug=c.tenant_slug and a.status=$2
          and (a.campus_slug is null or a.campus_slug=c.slug))::int admins,
       (select count(*) from campus_settings s
        where s.tenant_slug=c.tenant_slug and s.campus_slug=c.slug
          and s.setting_key=$3 and btrim(s.setting_value)<>$4)::int operator_wechat,
       (select count(*) from campus_settings s
        where s.tenant_slug=c.tenant_slug and s.campus_slug=c.slug
          and s.setting_key=$5 and btrim(s.setting_value)<>$4)::int contact_note,
       (select count(*) from campus_service_products p
        where p.tenant_slug=c.tenant_slug and p.campus_slug=c.slug
          and p.status=$2 and p.stock>0)::int active_products,
       (select count(*) from daily_menu_items d
        where d.tenant_slug=c.tenant_slug and d.campus_slug=c.slug
          and d.status=$2 and d.capacity>0 and d.service_date>=current_date)::int future_menus,
       (select count(*) from campus_announcements n
        where n.tenant_slug=c.tenant_slug and n.campus_slug=c.slug
          and n.status=$2)::int announcements,
       (select count(*) from community_posts p
        where p.tenant_slug=c.tenant_slug and p.campus_slug=c.slug
          and p.status=$6)::int pending_posts
     from campus_sites c
     where c.tenant_slug=$1 and c.status=$2
     order by c.slug`,
    [process.env.READINESS_TENANT || "tangshan", "active", "operator_wechat", "", "operator_contact_note", "pending"]
  )
  console.log(JSON.stringify({
    allowDeviceAuth: process.env.ALLOW_DEVICE_AUTH === "true",
    checkoutMode: process.env.CHECKOUT_MODE || "",
    contentSafetyMode: process.env.WECHAT_CONTENT_SAFETY_MODE || "",
    contentSafetyConfigured: Boolean(process.env.WECHAT_APPID && process.env.WECHAT_APPSECRET),
    notificationConfigured: Boolean(process.env.NOTIFY_WEBHOOK_URL),
    scheduleOcrConfigured: Boolean(process.env.DEEPSEEK_OCR_API_URL && process.env.DEEPSEEK_OCR_API_KEY && process.env.DEEPSEEK_OCR_MODEL),
    campuses: result.rows
  }, null, 2))
} finally {
  await pool.end()
}
