const localPreview = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
const storedApiRoot = sessionStorage.getItem("campus_admin_api") || "";
const state = {
  apiRoot:
    localPreview &&
    (!storedApiRoot || storedApiRoot.startsWith("/campus-circle/"))
      ? "http://127.0.0.1:4323/v1"
      : storedApiRoot || "/campus-circle/api/v1",
  tenant: sessionStorage.getItem("campus_admin_tenant") || "tangshan",
  campus: sessionStorage.getItem("campus_admin_campus") || "daxuexidao",
  token: sessionStorage.getItem("campus_admin_token") || "",
  sessionToken: sessionStorage.getItem("campus_admin_session") || "",
  context: null,
  stats: null,
  serviceProducts: [],
  takeoutMerchants: [],
  editingServiceProductId: null,
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2200);
}
function friendlyConnectionError(error) {
  const message = String(error?.message || error || "");
  if (/Failed to fetch|NetworkError|fetch/i.test(message))
    return "连接失败：无法访问 API 地址，请确认后端服务已启动且地址填写正确。";
  if (/401|403|令牌|权限/.test(message))
    return "连接失败：员工登录码无效/过期，或当前账号没有此校区权限。";
  return `连接失败：${message || "请检查连接信息后重试。"}`;
}
async function api(path, options = {}) {
  const response = await fetch(`${state.apiRoot}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": state.tenant,
      "x-campus-id": state.campus,
      ...(state.sessionToken ? {"x-session-token": state.sessionToken} : {"x-admin-token": state.token}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(
        `接口返回了非 JSON 内容，请检查 API 地址（HTTP ${response.status}）`,
      );
    }
  }
  if (!response.ok)
    throw new Error(body?.error || `请求失败 ${response.status}`);
  return body;
}
async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${state.apiRoot}/uploads`, {
    method: "POST",
    headers: {
      "x-tenant-id": state.tenant,
      "x-campus-id": state.campus,
      ...(state.sessionToken ? {"x-session-token": state.sessionToken} : {"x-admin-token": state.token}),
    },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body?.error || `图片上传失败 ${response.status}`);
  return body.url;
}
function persist() {
  sessionStorage.setItem("campus_admin_api", state.apiRoot);
  sessionStorage.setItem("campus_admin_tenant", state.tenant);
  sessionStorage.setItem("campus_admin_campus", state.campus);
  sessionStorage.setItem("campus_admin_token", state.token);
  sessionStorage.setItem("campus_admin_session", state.sessionToken);
}
function setView(view) {
  if ($("#workspace").hidden && view !== "overview") {
    toast("请先连接运营后台");
    return;
  }
  $$("[data-view]").forEach((item) =>
    item.classList.toggle("active", item.dataset.view === view),
  );
  $$("[data-view-panel]").forEach((item) =>
    item.classList.toggle("active", item.dataset.viewPanel === view),
  );
  const labels = {
    payment_pending: "等待用户支付",
    overview: "运营总览",
    home: "首页运营",
    services: "服务运营",
    content: "内容管理",
    jobs: "兼职发布",
    reports: "沟通举报",
    users: "用户与权限",
    settings: "校区设置",
    audit: "审计日志",
  };
  $("#page-title").textContent = labels[view] || "运营后台";
}
function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}
function mediaPreview(urls) {
  const items = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  return items.length
    ? `<div class="queue-media">${items.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="待审核图片" loading="lazy"></a>`).join("")}</div>`
    : "";
}
function renderStats(stats) {
  const pending =
    Number(stats.pendingPosts) +
    Number(stats.pendingListings || 0) +
    Number(stats.pendingRankings || 0) +
    Number(stats.pendingJobs) +
    Number(stats.openReports) +
    Number(stats.openPublicReports || 0);
  const entries = [
    ["当前校区用户", stats.users, "身份已隔离"],
    ["外卖订单", stats.orders, "校区订单"],
    ["二手闲置", stats.listings, "校内交易"],
    ["待办审核", pending, "需要处理"],
  ];
  $("#stats").innerHTML = entries
    .map(
      ([label, value, note]) =>
        `<div class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`,
    )
    .join("");
  $("#todo-list").innerHTML = [
    ["校园圈历史待处理", stats.pendingPosts],
    ["二手待审核", stats.pendingListings || 0],
    ["榜单待审核", stats.pendingRankings || 0],
    ["公开内容举报", stats.openPublicReports || 0],
    ["兼职待沟通/审核", stats.pendingJobs],
    ["会话举报", stats.openReports],
    ["待取快递记录", stats.packages],
  ]
    .map(
      ([label, value]) =>
        `<div class="todo"><span>${label}</span><strong>${value}</strong></div>`,
    )
    .join("");
}
function renderPosts(items) {
  $("#post-queue").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card ${item.status === "pending" ? "review-required" : ""}"><div><h3>${escapeHtml(item.author)} · ${escapeHtml(item.channel)} · ${escapeHtml(item.status)}</h3><p>${escapeHtml(item.content)}</p>${mediaPreview(item.image_urls?.length ? item.image_urls : item.image_url)}<div class="queue-meta">${escapeHtml(item.location)} · ${new Date(item.created_at).toLocaleString()}${item.moderation_note ? ` · ${escapeHtml(item.moderation_note)}` : ""}</div></div><div class="queue-actions">${item.status === "pending" ? `<button class="primary" data-action="post-approve" data-id="${item.id}">处理旧记录</button><button class="danger" data-action="post-reject" data-id="${item.id}">拒绝</button>` : item.status === "active" ? `<button class="danger" data-action="community-post-remove" data-id="${item.id}">删除帖子</button>` : `<span>${item.status === "rejected" ? "已拒绝" : "已删除"}</span>`}</div></div>`,
        )
        .join("")
    : empty("当前校区还没有校园圈内容");
}
function renderMarket(items) {
  $("#market-queue").innerHTML = items.length
    ? items
        .slice(0, 30)
        .map(
          (item) =>
            `<div class="queue-card ${item.status === "pending" ? "review-required" : ""}"><div><h3>${escapeHtml(item.title)} · ¥${escapeHtml(item.price)}</h3><p>${escapeHtml(item.author)} · ${escapeHtml(item.category)} · ${escapeHtml(item.condition_label)}${item.category === "电动车" ? `<br>品牌 ${escapeHtml(item.vehicle_brand || "待补充")} · 续航 ${escapeHtml(item.vehicle_range_km || "待核验")}km · 电池 ${escapeHtml(item.battery_year || "待核验")} · ${escapeHtml({ registered: "已登记", unregistered: "未登记", unknown: "登记待核验" }[item.registration_status] || "登记待核验")}` : ""}<br>${escapeHtml(item.description || "")}</p>${mediaPreview(item.image_url)}<div class="queue-meta">状态 ${escapeHtml(item.status)}${item.moderation_note ? ` · ${escapeHtml(item.moderation_note)}` : ""}</div></div><div class="queue-actions">${item.status === "pending" ? `<button class="primary" data-action="market-approve" data-id="${item.id}">通过</button><button class="danger" data-action="market-reject" data-id="${item.id}">拒绝</button>` : item.status !== "removed" && item.status !== "rejected" ? `<button class="danger" data-action="market-remove" data-id="${item.id}">下架</button>` : `<span>${item.status === "rejected" ? "已拒绝" : "已下架"}</span>`}</div></div>`,
        )
        .join("")
    : empty("当前校区暂无二手内容");
}
function renderRankings(items) {
  $("#ranking-queue").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card ${item.status === "pending" ? "review-required" : ""}"><div><h3>${escapeHtml(item.name)} · ${escapeHtml(item.list_title || item.category)} · ${escapeHtml(item.status)}</h3><p>${escapeHtml(item.author || "运营精选")} · ${escapeHtml(item.campus_name || item.campus_slug || "校区未标注")} · ${escapeHtml(item.location)}<br>${escapeHtml(item.note)}</p>${mediaPreview(item.image_url)}<div class="queue-meta">${new Date(item.created_at).toLocaleString()} · 举报 ${item.report_count || 0}${item.moderation_note ? ` · ${escapeHtml(item.moderation_note)}` : ""}</div></div><div class="queue-actions">${item.status === "pending" ? `<button class="primary" data-action="ranking-approve" data-id="${item.id}">通过</button><button class="danger" data-action="ranking-reject" data-id="${item.id}">拒绝</button>` : item.status === "active" ? `<button class="danger" data-action="ranking-place-remove" data-id="${item.id}">下架</button>` : `<span>${item.status === "rejected" ? "已拒绝" : "已下架"}</span>`}</div></div>`,
        )
        .join("")
    : empty("当前学校还没有榜单地点");
}
function renderRankingLists(items) {
  $("#ranking-list-queue").innerHTML = items.length
    ? items.map(item =>
      `<div class="queue-card ${item.status === "pending" ? "review-required" : ""}"><div><h3>${escapeHtml(item.title)} · ${escapeHtml(item.status)}</h3><p>${escapeHtml(item.author || "学生")} · 参榜项目称呼：${escapeHtml(item.entry_label)}<br>${escapeHtml(item.description)}</p>${mediaPreview(item.cover_url)}<div class="queue-meta">${new Date(item.created_at).toLocaleString()} · 已公开 ${item.item_count || 0} 项${item.moderation_note ? ` · ${escapeHtml(item.moderation_note)}` : ""}</div></div><div class="queue-actions">${item.status === "pending" ? `<button class="primary" data-action="ranking-list-approve" data-id="${item.id}">通过</button><button class="danger" data-action="ranking-list-reject" data-id="${item.id}">拒绝</button>` : item.status === "active" ? `<button class="danger" data-action="ranking-list-remove" data-id="${item.id}">下架榜单</button>` : `<span>${item.status === "rejected" ? "已拒绝" : "已下架"}</span>`}</div></div>`
    ).join("")
    : empty("当前学校还没有学生创建的榜单");
}
function renderPublicReports(community, comments, rankings, rankingComments) {
  const communityCards = community.map(
    (item) =>
      `<div class="queue-card"><div><h3>校园圈帖子 · ${escapeHtml(item.channel)}</h3><p>${escapeHtml(item.reporter)}：${escapeHtml(item.reason)}${item.detail ? `<br>${escapeHtml(item.detail)}` : ""}<br>原内容：${escapeHtml(item.content)}</p><div class="queue-meta">${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions"><button data-action="community-report-resolve" data-id="${item.id}">处理完成</button><button class="danger" data-action="community-post-remove" data-id="${item.post_id}" data-report-id="${item.id}">下架并处理</button></div></div>`,
  );
  const commentCards = comments.map(
    (item) =>
      `<div class="queue-card"><div><h3>校园圈评论 · ${escapeHtml(item.channel)}</h3><p>${escapeHtml(item.reporter)} 举报 ${escapeHtml(item.author)}：${escapeHtml(item.reason)}${item.detail ? `<br>${escapeHtml(item.detail)}` : ""}<br>评论：${escapeHtml(item.content)}</p><div class="queue-meta">${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions"><button data-action="community-comment-report-resolve" data-id="${item.id}">处理完成</button><button class="danger" data-action="community-comment-remove" data-id="${item.id}">删除评论并处理</button></div></div>`,
  );
  const rankingCards = rankings.map(
    (item) =>
      `<div class="queue-card"><div><h3>榜单地点 · ${escapeHtml(item.name)}</h3><p>${escapeHtml(item.reporter)}：${escapeHtml(item.reason)}${item.detail ? `<br>${escapeHtml(item.detail)}` : ""}</p><div class="queue-meta">${escapeHtml(item.category)} · ${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions"><button data-action="ranking-report-resolve" data-id="${item.id}">处理完成</button><button class="danger" data-action="ranking-place-remove" data-id="${item.place_id}" data-report-id="${item.id}">下架并处理</button></div></div>`,
  );
  const rankingCommentCards = rankingComments.map(
    (item) =>
      `<div class="queue-card"><div><h3>榜单评论 · ${escapeHtml(item.name)}</h3><p>${escapeHtml(item.reporter)} 举报 ${escapeHtml(item.author)}：${escapeHtml(item.reason)}${item.detail ? `<br>${escapeHtml(item.detail)}` : ""}<br>评论：${escapeHtml(item.content)}</p><div class="queue-meta">${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions"><button data-action="ranking-comment-report-resolve" data-id="${item.id}">处理完成</button><button class="danger" data-action="ranking-comment-remove" data-id="${item.id}">删除评论并处理</button></div></div>`,
  );
  $("#public-report-queue").innerHTML =
    communityCards.length || commentCards.length || rankingCards.length || rankingCommentCards.length
      ? [...communityCards, ...commentCards, ...rankingCards, ...rankingCommentCards].join("")
      : empty("当前学校没有待处理公开内容举报");
}
function renderJobs(items) {
  $("#job-queue").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.title)} · ${escapeHtml(item.salary_text)}</h3><p>${escapeHtml(item.organization)} · ${escapeHtml(item.location)}<br>${escapeHtml(item.description)}</p><div class="queue-meta">${escapeHtml(item.order_no)} · 支付 ${escapeHtml(item.payment_status)} · 状态 ${escapeHtml(item.status)}</div></div><div class="queue-actions">${item.status === "pending_contact" ? `<button class="primary" data-action="job-contacted" data-id="${item.id}">已沟通</button>` : ""}${item.status === "pending_review" ? `<button class="primary" data-action="job-approve" data-id="${item.id}">通过发布</button><button class="danger" data-action="job-reject" data-id="${item.id}">拒绝退款</button>` : ""}</div></div>`,
        )
        .join("")
    : empty("当前校区没有待处理兼职发布单");
}
function renderReports(items) {
  $("#report-queue").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.reporter)} 举报 ${escapeHtml(item.resource_type)}</h3><p>${escapeHtml(item.reason)}${item.detail ? `<br>${escapeHtml(item.detail)}` : ""}</p><div class="queue-meta">资源 ${escapeHtml(item.resource_id)} · ${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions"><button data-action="report-resolve" data-id="${item.id}">处理完成</button><button class="danger" data-action="report-block" data-id="${item.id}">冻结会话</button></div></div>`,
        )
        .join("")
    : empty("当前校区没有待处理会话举报");
}
function renderUsers(items) {
  $("#user-list").innerHTML = items.length
    ? `<table><thead><tr><th>ID</th><th>昵称</th><th>最近访问</th><th>校区状态</th><th>运营角色</th><th>操作</th></tr></thead><tbody>${items.map((item) => `<tr><td>${item.id}</td><td>${escapeHtml(item.nickname)}</td><td>${new Date(item.last_seen_at).toLocaleString()}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.admin_role || "-")}</td><td><button class="${item.status === "active" ? "danger" : "primary"}" data-action="membership-status" data-id="${item.id}" data-status="${item.status === "active" ? "suspended" : "active"}">${item.status === "active" ? "暂停" : "恢复"}</button></td></tr>`).join("")}</tbody></table>`
    : empty("当前校区还没有用户记录");
}
function renderAudit(items) {
  $("#audit-list").innerHTML = items.length
    ? `<table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>资源</th><th>详情</th></tr></thead><tbody>${items.map((item) => `<tr><td>${new Date(item.created_at).toLocaleString()}</td><td>${escapeHtml(item.actor || "系统")}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.resource_type)} · ${escapeHtml(item.resource_id || "")}</td><td>${escapeHtml(JSON.stringify(item.detail || {}))}</td></tr>`).join("")}</tbody></table>`
    : empty("暂无审计记录");
}
function renderSettings(items) {
  const values = Object.fromEntries(
    items.map((item) => [item.setting_key, item.setting_value]),
  );
  $("#setting-wechat").value = values.operator_wechat || "";
  $("#setting-qr").value = values.operator_qr_url || "";
  $("#setting-note").value = values.operator_contact_note || "";
  $("#setting-ebike").checked = values.ebike_contact_enabled === "true";
}
function renderAnnouncements(items) {
  $("#announcement-list").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.title)} · ${item.status === "active" ? "启用中" : item.status === "draft" ? "草稿" : "已归档"}</h3><p>${escapeHtml(item.content)}</p><div class="queue-meta">优先级 ${item.priority} · ${new Date(item.publish_at).toLocaleString()} · ${escapeHtml(item.route)}</div></div><div class="queue-actions"><button class="${item.status === "active" ? "danger" : "primary"}" data-action="announcement-toggle" data-id="${item.id}" data-status="${item.status === "active" ? "archived" : "active"}">${item.status === "active" ? "归档" : "启用"}</button></div></div>`,
        )
        .join("")
    : empty("当前校区还没有公告");
}
function renderHomeStatus(item) {
  $("#home-weather-temperature").value = item?.weather_temperature || "";
  $("#home-weather-condition").value = item?.weather_condition || "";
  $("#home-weather-note").value = item?.weather_note || "";
}
function renderServiceProducts(items) {
  state.serviceProducts = items;
  const labels = { fruit: "水果店", flowers: "花店", snacks: "零食店" };
  $("#service-product-list").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.name)} · ¥${(Number(item.price_cents) / 100).toFixed(2)} ${item.data_mode === "test" ? '<span class="fee">测试</span>' : ""}</h3><p>${escapeHtml(labels[item.service_type] || item.service_type)} · ${escapeHtml(item.category || "其他")} · 库存 ${item.stock} · ${escapeHtml(item.description || "暂无说明")}</p><div class="queue-meta">状态 ${escapeHtml(item.status)} · 排序 ${item.sort_order}</div></div><div class="queue-actions"><button data-action="service-product-edit" data-id="${item.id}">编辑</button><button class="${item.status === "active" ? "danger" : "primary"}" data-action="service-product-toggle" data-id="${item.id}" data-status="${item.status === "active" ? "inactive" : "active"}">${item.status === "active" ? "下架" : "上架"}</button></div></div>`,
        )
        .join("")
    : empty("当前校区还没有商店商品");
}
function todayText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function selectedMerchant() {
  return state.takeoutMerchants.find(
    (item) => String(item.id) === $("#takeout-merchant-select").value,
  );
}
function renderTakeout(items) {
  state.takeoutMerchants = items;
  const merchantSelect = $("#takeout-merchant-select");
  const previous = merchantSelect.value;
  merchantSelect.innerHTML = items
    .map(
      (item) =>
        `<option value="${item.id}">${escapeHtml(item.name)}${item.data_mode === "test" ? "（测试）" : ""}</option>`,
    )
    .join("");
  if (items.some((item) => String(item.id) === previous))
    merchantSelect.value = previous;
  $("#takeout-merchant-list").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.name)} ${item.data_mode === "test" ? '<span class="fee">测试</span>' : ""}</h3><p>${escapeHtml(item.category)} · ${item.delivery_minutes} 分钟 · ${item.products.length} 个商品</p></div><div class="queue-actions"><button class="${item.status === "active" ? "danger" : "primary"}" data-action="takeout-merchant-toggle" data-id="${item.id}" data-status="${item.status === "active" ? "inactive" : "active"}">${item.status === "active" ? "停用" : "启用"}</button></div></div>`,
        )
        .join("")
    : empty("当前校区还没有外卖商户");
  renderTakeoutProducts();
  void loadTakeoutMenu();
}
function renderTakeoutProducts() {
  const merchant = selectedMerchant();
  const products = merchant?.products || [];
  const productSelect = $("#takeout-menu-product");
  const previous = productSelect.value;
  productSelect.innerHTML = products
    .filter((item) => item.status === "active")
    .map(
      (item) =>
        `<option value="${item.id}" data-price="${item.price}" data-stock="${item.stock}">${escapeHtml(item.name)}</option>`,
    )
    .join("");
  if (products.some((item) => String(item.id) === previous))
    productSelect.value = previous;
  $("#takeout-product-list").innerHTML = products.length
    ? products
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.name)} · ¥${Number(item.price).toFixed(2)} ${item.data_mode === "test" ? '<span class="fee">测试</span>' : ""}</h3><p>${escapeHtml(item.category)} · 库存 ${item.stock}</p></div><div class="queue-actions"><button class="${item.status === "active" ? "danger" : "primary"}" data-action="takeout-product-toggle" data-id="${item.id}" data-status="${item.status === "active" ? "inactive" : "active"}">${item.status === "active" ? "下架" : "上架"}</button></div></div>`,
        )
        .join("")
    : empty("该商户还没有商品模板");
  syncMenuProductDefaults();
}
function syncMenuProductDefaults() {
  const option = $("#takeout-menu-product").selectedOptions?.[0];
  if (!option) return;
  $("#takeout-menu-price").value = option.dataset.price || "";
  $("#takeout-menu-capacity").value = option.dataset.stock || "";
}
async function loadTakeoutMenu() {
  const merchant = selectedMerchant();
  if (!merchant) {
    $("#takeout-menu-list").innerHTML = empty("请先创建外卖商户");
    return;
  }
  const date = $("#takeout-menu-date").value || todayText();
  const result = await api(
    `/admin/merchants/${merchant.id}/daily-menu?serviceDate=${date}`,
  );
  $("#takeout-menu-list").innerHTML = result.items.length
    ? result.items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.name)} · ¥${Number(item.price).toFixed(2)}</h3><p>${date} · 剩余 ${item.available}/${item.capacity} · ${item.data_mode === "test" ? "测试菜单" : "正式菜单"}</p></div><div class="queue-actions"><button class="${item.status === "active" ? "danger" : "primary"}" data-action="takeout-menu-toggle" data-id="${item.id}" data-status="${item.status === "active" ? "inactive" : "active"}">${item.status === "active" ? "停用" : "启用"}</button></div></div>`,
        )
        .join("")
    : empty("该日期尚未发布菜单");
}
function resetServiceProductForm() {
  state.editingServiceProductId = null;
  [
    "#service-product-name",
    "#service-product-category",
    "#service-product-description",
    "#service-product-price",
    "#service-product-stock",
    "#service-product-image",
    "#service-product-file",
  ].forEach((selector) => ($(selector).value = ""));
  $("#service-product-sort").value = "0";
  $("#service-product-mode").value = "test";
  $("#service-product-type").disabled = false;
  $("#save-service-product").textContent = "保存商品";
  $("#cancel-service-product-edit").hidden = true;
}
function renderServiceOrders(items) {
  const labels = {
    submitted: "待确认",
    confirmed: "已确认",
    preparing: "备货中",
    ready: "待取/待送",
    completed: "已完成",
    cancelled: "已取消",
  };
  const next = {
    submitted: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: "completed",
  };
  const nextLabels = {
    confirmed: "确认订单",
    preparing: "开始备货",
    ready: "标记就绪",
    completed: "完成订单",
  };
  $("#service-order-list").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.order_no)} · ${escapeHtml(labels[item.status] || item.status)}</h3><p>${escapeHtml(item.nickname)} · ${item.items.map((entry) => `${escapeHtml(entry.name)}×${entry.quantity}`).join("、")}<br>${item.fulfillment_type === "delivery" ? `校内送达：${escapeHtml(item.delivery_address || "待确认")}` : "到店自取"} · 联系人 ${escapeHtml(item.contact_name || "未填写")} ${escapeHtml(item.contact_phone || "")}${item.desired_date ? `<br>期望时间：${escapeHtml(String(item.desired_date).slice(0, 10))} ${escapeHtml(item.desired_time || "")}` : ""}${item.gift_message ? `<br>花卡留言：${escapeHtml(item.gift_message)}` : ""}<br>合计 ¥${(Number(item.total_amount_cents) / 100).toFixed(2)} · 支付 ${escapeHtml(item.payment_status || "offline")}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</p><div class="queue-meta">${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions">${next[item.status] ? `<button class="primary" data-action="service-order-status" data-id="${item.id}" data-status="${next[item.status]}">${nextLabels[next[item.status]]}</button>` : ""}${["submitted", "confirmed"].includes(item.status) ? `<button class="danger" data-action="service-order-status" data-id="${item.id}" data-status="cancelled">取消</button>` : ""}</div></div>`,
        )
        .join("")
    : empty("当前校区还没有服务订单");
}
function renderEvents(items) {
  $("#event-list").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.title)} · ${escapeHtml(item.event_time)}</h3><p>${escapeHtml(item.organizer)} · ${escapeHtml(item.location)} · 已报名 ${item.signup_count}/${item.capacity || "不限"}<br>${escapeHtml(item.description)}</p><div class="queue-meta">状态 ${escapeHtml(item.status)}</div></div><div class="queue-actions"><button class="${item.status === "active" ? "danger" : "primary"}" data-action="event-toggle" data-id="${item.id}" data-status="${item.status === "active" ? "inactive" : "active"}">${item.status === "active" ? "停用" : "启用"}</button></div></div>`,
        )
        .join("")
    : empty("当前校区还没有活动");
}
function renderExpressPackages(items) {
  $("#express-package-list").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="queue-card"><div><h3>${escapeHtml(item.nickname)} · ${escapeHtml(item.carrier)} · ${escapeHtml(item.pickup_code || "待补取件码")}</h3><p>${escapeHtml(item.tracking_no)} · ${escapeHtml(item.station)}</p><div class="queue-meta">用户 ${item.user_id} · ${item.status === "waiting" ? "待取件" : "已取件"} · ${new Date(item.created_at).toLocaleString()}</div></div><div class="queue-actions">${item.status === "waiting" ? `<button class="primary" data-action="express-picked" data-id="${item.id}">标记已取</button>` : ""}</div></div>`,
        )
        .join("")
    : empty("当前校区还没有快递记录");
}
async function loadAll() {
  const [
    context,
    stats,
    readiness,
    posts,
    market,
    rankingLists,
    rankings,
    communityReports,
    commentReports,
    rankingReports,
    rankingCommentReports,
    jobs,
    reports,
    users,
    settings,
    audit,
    announcements,
    homeStatus,
    serviceProducts,
    serviceOrders,
    events,
    expressPackages,
    takeoutMerchants,
  ] = await Promise.all([
    api("/admin/context"),
    api("/admin/stats"),
    api("/admin/readiness"),
    api("/admin/community/posts?status=all"),
    api("/admin/market/listings"),
    api("/admin/rankings/lists?status=all"),
    api("/admin/rankings/places?status=all"),
    api("/admin/community/reports"),
    api("/admin/community/comment-reports"),
    api("/admin/rankings/reports"),
    api("/admin/rankings/comment-reports"),
    api("/admin/jobs/posting-orders"),
    api("/admin/conversation-reports"),
    api("/admin/users"),
    api("/admin/settings"),
    api("/admin/audit-logs"),
    api("/admin/announcements"),
    api("/admin/home-status"),
    api("/admin/service/products"),
    api("/admin/service/orders"),
    api("/admin/events"),
    api("/admin/express/packages"),
    api("/admin/takeout/merchants"),
  ]);
  state.context = context;
  state.stats = stats;
  $("#scope-school").textContent = context.school.name;
  $("#scope-campus").textContent = context.campus.name;
  $("#header-school").textContent = context.school.name;
  $("#header-campus").textContent = context.campus.name;
  $("#campus-select").innerHTML = context.campuses
    .map(
      (item) =>
        `<option value="${escapeHtml(item.slug)}" ${item.slug === state.campus ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
    )
    .join("");
  renderStats(stats);
  const readinessState = $("#readiness-state");
  readinessState.textContent = readiness.publicLaunchReady
    ? "可进入灰度验收"
    : "尚有阻断项";
  readinessState.className = readiness.publicLaunchReady ? "ok" : "warn";
  $("#readiness-list").innerHTML = readiness.checks
    .map(
      (item) =>
        `<div class="readiness-item ${item.ready ? "ready" : "blocked"}"><span>${item.ready ? "✓" : "!"}</span><div><strong>${escapeHtml(item.label)}${item.optional ? "（可选）" : ""}</strong><small>${escapeHtml(item.detail)}</small></div></div>`,
    )
    .join("");
  $("#readiness-queue").textContent =
    `当前内容队列：${readiness.moderation.pendingPosts} 条待审帖子 · ${readiness.moderation.pendingListings || 0} 条待审二手 · ${readiness.moderation.pendingRankings || 0} 条待审榜单 · ${readiness.moderation.openReports} 条待处理举报`;
  renderPosts(posts.items);
  renderMarket(market.items);
  renderRankingLists(rankingLists.items);
  renderRankings(rankings.items);
  renderPublicReports(
    communityReports.items,
    commentReports.items,
    rankingReports.items,
    rankingCommentReports.items,
  );
  renderJobs(jobs.items);
  renderReports(reports.items);
  renderUsers(users.items);
  renderSettings(settings.items);
  renderAudit(audit.items);
  renderAnnouncements(announcements.items);
  renderHomeStatus(homeStatus.item);
  renderServiceProducts(serviceProducts.items);
  renderServiceOrders(serviceOrders.items);
  renderEvents(events.items);
  renderExpressPackages(expressPackages.items);
  renderTakeout(takeoutMerchants.items);
}
async function connect() {
  state.apiRoot = $("#api-root").value.trim().replace(/\/$/, "");
  state.tenant = $("#tenant-input").value.trim();
  state.campus = $("#campus-input").value.trim();
  state.token = $("#admin-token").value.trim();
  const employeeCode = $("#employee-code").value.trim().replace(/\s+/g, "");
  $("#login-error").textContent = "";
  try {
    if (employeeCode) {
      const exchange = await fetch(`${state.apiRoot}/admin/auth/exchange`, {
        method: "POST",
        headers: {"content-type": "application/json", "x-tenant-id": state.tenant, "x-campus-id": state.campus},
        body: JSON.stringify({code: employeeCode}),
      });
      const payload = await exchange.json().catch(() => ({}));
      if (!exchange.ok) throw new Error(payload.error || `员工登录失败 ${exchange.status}`);
      state.sessionToken = payload.sessionToken;
      state.token = "";
      $("#admin-token").value = "";
      $("#employee-code").value = "";
    } else if (state.token) {
      state.sessionToken = "";
    }
    await loadAll();
    persist();
    $("#login-panel").hidden = true;
    $("#preview-loading").hidden = true;
    $("#workspace").hidden = false;
    toast("后台连接成功");
  } catch (error) {
    $("#preview-loading").hidden = true;
    $("#login-panel").hidden = false;
    $("#workspace").hidden = true;
    $("#login-error").textContent = friendlyConnectionError(error);
  }
}
async function action(target) {
  if (!target?.dataset) return;
  const { action, id, status, reportId } = target.dataset;
  if (!action) return;
  if (action === "service-product-edit") {
    const item = state.serviceProducts.find(
      (entry) => String(entry.id) === String(id),
    );
    if (!item) return;
    state.editingServiceProductId = item.id;
    $("#service-product-type").value = item.service_type;
    $("#service-product-type").disabled = true;
    $("#service-product-name").value = item.name;
    $("#service-product-category").value = item.category || "";
    $("#service-product-description").value = item.description || "";
    $("#service-product-price").value = (
      Number(item.price_cents) / 100
    ).toFixed(2);
    $("#service-product-stock").value = item.stock;
    $("#service-product-image").value = item.image_url || "";
    $("#service-product-sort").value = item.sort_order || 0;
    $("#service-product-mode").value = item.data_mode || "live";
    $("#save-service-product").textContent = "更新商品";
    $("#cancel-service-product-edit").hidden = false;
    $("#service-product-name").focus();
    return;
  }
  try {
    if (action.startsWith("post-")) {
      await api(`/admin/community/posts/${id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision: action.endsWith("approve") ? "approve" : "reject",
          note: action.endsWith("reject") ? "运营审核未通过" : "",
        }),
      });
    }
    if (action === "market-approve")
      await api(`/admin/market/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
    if (action === "market-reject") {
      const note = prompt("请输入拒绝原因") || "运营审核未通过";
      await api(`/admin/market/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected", note }),
      });
    }
    if (action === "market-remove")
      await api(`/admin/market/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", note: "运营下架" }),
      });
    if (action === "ranking-approve")
      await api(`/admin/rankings/places/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      });
    if (action === "ranking-reject") {
      const note = prompt("请输入拒绝原因") || "运营审核未通过";
      await api(`/admin/rankings/places/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "reject", note }),
      });
    }
    if (action === "ranking-list-approve")
      await api(`/admin/rankings/lists/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      });
    if (action === "ranking-list-reject") {
      const note = prompt("请输入拒绝原因") || "榜单主题或说明不符合发布规则";
      await api(`/admin/rankings/lists/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "reject", note }),
      });
    }
    if (action === "ranking-list-remove")
      await api(`/admin/rankings/lists/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", note: "运营下架" }),
      });
    if (action === "community-report-resolve")
      await api(`/admin/community/reports/${id}/resolve`, { method: "POST" });
    if (action === "community-comment-report-resolve")
      await api(`/admin/community/comment-reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ remove: false }),
      });
    if (action === "community-comment-remove")
      await api(`/admin/community/comment-reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ remove: true }),
      });
    if (action === "community-post-remove") {
      await api(`/admin/community/posts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", note: "运营下架" }),
      });
      if (reportId)
        await api(`/admin/community/reports/${reportId}/resolve`, {
          method: "POST",
        });
    }
    if (action === "ranking-report-resolve")
      await api(`/admin/rankings/reports/${id}/resolve`, { method: "POST" });
    if (action === "ranking-comment-report-resolve")
      await api(`/admin/rankings/comment-reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ remove: false }),
      });
    if (action === "ranking-comment-remove")
      await api(`/admin/rankings/comment-reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ remove: true }),
      });
    if (action === "ranking-place-remove") {
      await api(`/admin/rankings/places/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", note: "运营下架" }),
      });
      if (reportId)
        await api(`/admin/rankings/reports/${reportId}/resolve`, {
          method: "POST",
        });
    }
    if (action === "membership-status")
      await api(`/admin/users/${id}/membership`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "job-contacted")
      await api(`/admin/jobs/posting-orders/${id}/contacted`, {
        method: "POST",
      });
    if (action === "job-approve")
      await api(`/admin/jobs/posting-orders/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      });
    if (action === "job-reject") {
      const note = prompt("请输入拒绝原因（系统将排队原路退款）");
      if (!note) return;
      await api(`/admin/jobs/posting-orders/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "reject", note }),
      });
    }
    if (action === "report-resolve" || action === "report-block")
      await api(`/admin/conversation-reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ block: action === "report-block" }),
      });
    if (action === "announcement-toggle")
      await api(`/admin/announcements/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "service-product-toggle")
      await api(`/admin/service/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "takeout-merchant-toggle")
      await api(`/admin/merchants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "takeout-product-toggle")
      await api(`/admin/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "takeout-menu-toggle")
      await api(`/admin/daily-menu/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "service-order-status")
      await api(`/admin/service/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "event-toggle")
      await api(`/admin/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    if (action === "express-picked")
      await api(`/admin/express/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "picked" }),
      });
    toast("操作已完成");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
}
document.addEventListener("click", (event) => {
  const source = event.target instanceof Element ? event.target : null;
  action(source?.closest("[data-action]"));
});
$$("[data-view]").forEach((button) =>
  button.addEventListener("click", () => setView(button.dataset.view)),
);
$("#connect").addEventListener("click", connect);
$("#refresh").addEventListener("click", () => {
  if ($("#workspace").hidden) {
    toast("请先连接运营后台");
    return;
  }
  loadAll()
    .then(() => toast("数据已刷新"))
    .catch((error) => toast(friendlyConnectionError(error)));
});
$("#campus-select").addEventListener("change", async (event) => {
  if ($("#workspace").hidden) return;
  state.campus = event.target.value;
  persist();
  await loadAll();
  toast("已切换校区");
});
$("#save-settings").addEventListener("click", async () => {
  try {
    await api("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        operator_wechat: $("#setting-wechat").value,
        operator_qr_url: $("#setting-qr").value,
        operator_contact_note: $("#setting-note").value,
        ebike_contact_enabled: $("#setting-ebike").checked,
      }),
    });
    toast("校区设置已保存");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-role").addEventListener("click", async () => {
  try {
    await api("/admin/roles", {
      method: "POST",
      body: JSON.stringify({
        userId: Number($("#role-user-id").value),
        role: $("#role-name").value,
        campusSlug: state.campus,
      }),
    });
    toast("角色已保存");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-announcement").addEventListener("click", async () => {
  try {
    await api("/admin/announcements", {
      method: "POST",
      body: JSON.stringify({
        title: $("#announcement-title").value,
        content: $("#announcement-content").value,
        route: $("#announcement-route").value,
        status: $("#announcement-status").value,
        priority: Number($("#announcement-priority").value || 0),
      }),
    });
    $("#announcement-title").value = "";
    $("#announcement-content").value = "";
    toast("公告已保存");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-home-status").addEventListener("click", async () => {
  try {
    await api("/admin/home-status", {
      method: "PATCH",
      body: JSON.stringify({
        temperature: $("#home-weather-temperature").value,
        condition: $("#home-weather-condition").value,
        note: $("#home-weather-note").value,
      }),
    });
    toast("首页天气状态已保存");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-service-product").addEventListener("click", async () => {
  try {
    const price = Number($("#service-product-price").value);
    const file = $("#service-product-file").files?.[0];
    const imageUrl = file
      ? await uploadFile(file)
      : $("#service-product-image").value;
    const editing = state.editingServiceProductId;
    await api(
      editing
        ? `/admin/service/products/${editing}`
        : "/admin/service/products",
      {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          serviceType: $("#service-product-type").value,
          name: $("#service-product-name").value,
          category: $("#service-product-category").value,
          description: $("#service-product-description").value,
          priceCents: Math.round(price * 100),
          stock: Number($("#service-product-stock").value),
          imageUrl,
          sortOrder: Number($("#service-product-sort").value || 0),
          dataMode: $("#service-product-mode").value,
        }),
      },
    );
    resetServiceProductForm();
    toast(editing ? "商品已更新" : "商品已保存");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#cancel-service-product-edit").addEventListener(
  "click",
  resetServiceProductForm,
);
$("#takeout-merchant-select").addEventListener("change", () => {
  renderTakeoutProducts();
  void loadTakeoutMenu();
});
$("#takeout-menu-product").addEventListener("change", syncMenuProductDefaults);
$("#takeout-menu-date").addEventListener(
  "change",
  () => void loadTakeoutMenu(),
);
$("#save-takeout-merchant").addEventListener("click", async () => {
  try {
    await api("/admin/merchants", {
      method: "POST",
      body: JSON.stringify({
        name: $("#takeout-merchant-name").value,
        category: $("#takeout-merchant-category").value,
        description: $("#takeout-merchant-description").value,
        deliveryMinutes: Number($("#takeout-merchant-minutes").value || 30),
        minOrder: 0,
        dataMode: $("#takeout-merchant-mode").value,
      }),
    });
    $("#takeout-merchant-name").value = "";
    $("#takeout-merchant-description").value = "";
    toast("外卖商户已新增");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-takeout-product").addEventListener("click", async () => {
  const merchant = selectedMerchant();
  if (!merchant) return toast("请先创建并选择商户");
  try {
    const file = $("#takeout-product-file").files?.[0];
    const imageUrl = file ? await uploadFile(file) : "";
    await api(`/admin/merchants/${merchant.id}/products`, {
      method: "POST",
      body: JSON.stringify({
        name: $("#takeout-product-name").value,
        category: $("#takeout-product-category").value,
        description: $("#takeout-product-description").value,
        price: Number($("#takeout-product-price").value),
        stock: Number($("#takeout-product-stock").value),
        dataMode: $("#takeout-product-mode").value,
        imageUrl,
      }),
    });
    [
      "#takeout-product-name",
      "#takeout-product-description",
      "#takeout-product-price",
      "#takeout-product-stock",
      "#takeout-product-file",
    ].forEach((selector) => ($(selector).value = ""));
    toast("外卖商品模板已新增");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#publish-takeout-menu").addEventListener("click", async () => {
  const merchant = selectedMerchant();
  if (!merchant) return toast("请先选择商户");
  try {
    await api(`/admin/merchants/${merchant.id}/daily-menu`, {
      method: "POST",
      body: JSON.stringify({
        productId: Number($("#takeout-menu-product").value),
        serviceDate: $("#takeout-menu-date").value,
        price: Number($("#takeout-menu-price").value),
        capacity: Number($("#takeout-menu-capacity").value),
      }),
    });
    toast("当天菜单已发布");
    await loadTakeoutMenu();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-event").addEventListener("click", async () => {
  try {
    await api("/admin/events", {
      method: "POST",
      body: JSON.stringify({
        title: $("#event-title").value,
        organizer: $("#event-organizer").value,
        eventTime: $("#event-time").value,
        location: $("#event-location").value,
        capacity: Number($("#event-capacity").value || 0),
        description: $("#event-description").value,
      }),
    });
    [
      "#event-title",
      "#event-organizer",
      "#event-time",
      "#event-location",
      "#event-capacity",
      "#event-description",
    ].forEach((selector) => ($(selector).value = ""));
    toast("活动已发布");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#save-express-package").addEventListener("click", async () => {
  try {
    await api("/admin/express/packages", {
      method: "POST",
      body: JSON.stringify({
        userId: Number($("#express-user-id").value),
        carrier: $("#express-carrier").value,
        trackingNo: $("#express-tracking-no").value,
        pickupCode: $("#express-pickup-code").value,
        station: $("#express-station").value,
        status: "waiting",
      }),
    });
    [
      "#express-user-id",
      "#express-carrier",
      "#express-tracking-no",
      "#express-pickup-code",
    ].forEach((selector) => ($(selector).value = ""));
    toast("快递已录入并同步到用户首页");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});
$("#takeout-menu-date").value = todayText();
$("#api-root").value = state.apiRoot;
$("#tenant-input").value = state.tenant;
$("#campus-input").value = state.campus;
$("#admin-token").value = state.token;
$("#campus-select").innerHTML =
  `<option>${({daxuexidao: "南院", beiyuan: "北院", huayanbeilu: "华岩路", longze: "东院"})[state.campus] || state.campus}</option>`;
if (localPreview) {
  $("#login-panel").hidden = true;
  $("#preview-loading").hidden = false;
  connect();
} else if (state.token || state.sessionToken) connect();
