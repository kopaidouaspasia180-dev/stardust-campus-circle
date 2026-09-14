# Production runbook

This folder is a deployment template, not a substitute for credentials, a registered domain, or WeChat acceptance.

1. Copy `server/.env.example` to `server/.env.production`, then set `DATABASE_URL` to the Compose `db` host and fill the real secrets through the host secret manager. Do not commit this file.
2. Copy the non-secret PostgreSQL values from `.env.production.example` into the same `server/.env.production` file. Set `WECHATPAY_SECRET_DIR` to a host directory containing the payment private key and platform certificate; point `WECHATPAY_*_PATH` at `/run/secrets/wechatpay/...`.
3. Run `npm --prefix server run preflight:production`. Add `-- --check-files` only when the certificate paths are visible on the same host; the command never prints values or secrets.
4. Validate the rendered deployment: `docker compose --env-file server/.env.production -f ops/docker-compose.production.yml config`.
5. Start database and API: `docker compose --env-file server/.env.production -f ops/docker-compose.production.yml up -d --build`.
6. Run the migration once per release: `docker compose --env-file server/.env.production -f ops/docker-compose.production.yml exec -T api npm run migrate`.
7. Put an HTTPS reverse proxy in front of `127.0.0.1:4310`; do not publish PostgreSQL or the API directly to the internet. Probe `/health` for liveness and `/ready` for readiness.

## Backup and recovery

Run `ops/backup-postgres.sh` daily from the deployment host and copy the resulting encrypted-at-rest archive to a separate retention location. The script verifies the gzip stream before declaring success.

The restore script intentionally requires `CONFIRM_RESTORE` to exactly match the selected absolute backup path. Use it only during a maintenance window, after a fresh backup and a restore rehearsal on a non-production database.
# 线上运维脚本

## 已有 Node + PostgreSQL 服务器

`backup-live-postgres.sh` 适用于当前校园圈的非 Docker 部署：读取服务器 API 的 `.env`，导出 PostgreSQL custom-format 备份并使用 `pg_restore --list` 验证归档，同时打包上传目录。

`rehearse-live-restore.sh` 会在同一 PostgreSQL 实例中创建带固定安全前缀的临时数据库，将 custom-format 备份恢复后检查公共表，无论成功或失败都会强制删除临时数据库。它不会对生产库执行恢复。

```bash
sudo install -m 750 ops/backup-live-postgres.sh /opt/stardust-campus-circle-api/ops/backup-live-postgres.sh
/opt/stardust-campus-circle-api/ops/backup-live-postgres.sh /opt/stardust-campus-circle-api/.env
```

脚本默认把文件写入 `/home/ubuntu/campus-circle-backups/daily/`，并且**不会自动删除**历史备份。首次启用定时任务前，应先把一份备份复制到异机/对象存储，再在维护窗口做恢复演练。
