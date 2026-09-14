import {
  Button,
  Image,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  apiRequest,
  resolveMediaUrl,
  showApiError,
  uploadMedia,
} from "../../api/client";
import { currentCampusName } from "../../store/tenant";
import "./index.css";
import "./daily-menu.css";

type Product = {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  stock: number;
  status: string;
  image_url?: string;
};
type Merchant = {
  id: number;
  name: string;
  campus_slug: string;
  category: string;
  description: string;
  status: string;
  products: Product[];
};
type DailyMenuItem = {
  id: number;
  product_id: number;
  service_date: string;
  name: string;
  description: string;
  category: string;
  price: string;
  capacity: number;
  reserved: number;
  available: number;
  status: string;
};
type Courier = {
  id: number;
  name: string;
  phone: string;
  status: string;
  account_count: number;
};
type Summary = {
  campus_slug: string;
  status: string;
  count: number;
  gross_cents: number;
};
type CampusFaq = {
  id: number;
  keywords: string;
  answer: string;
  source_label: string;
  status: string;
  campus_slug: string | null;
};
type ModerationPost = {
  id: string;
  channel: string;
  content: string;
  location: string;
  author: string;
  created_at: string;
};
type CommunityReport = {
  id: number;
  reason: string;
  detail: string;
  content: string;
  channel: string;
  reporter: string;
  created_at: string;
};
type ModerationRankingPlace = {
  id: string;
  category: string;
  name: string;
  note: string;
  location: string;
  author: string;
  created_at: string;
};
type RankingReport = {
  id: number;
  reason: string;
  detail: string;
  name: string;
  category: string;
  reporter: string;
  created_at: string;
};

const defaultMerchant = {
  name: "",
  category: "午餐",
  description: "",
  deliveryMinutes: "30",
  minOrder: "0",
};
const defaultProduct = {
  name: "",
  price: "",
  category: "午餐",
  stock: "80",
  description: "",
  imageUrl: "",
};

function defaultServiceDate() {
  const tomorrow = new Date(Date.now() + 86400000);
  return tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export default function TakeoutAdminPage() {
  const [summary, setSummary] = useState<Summary[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [faqs, setFaqs] = useState<CampusFaq[]>([]);
  const [communityPosts, setCommunityPosts] = useState<ModerationPost[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [pendingRankingPlaces, setPendingRankingPlaces] = useState<
    ModerationRankingPlace[]
  >([]);
  const [rankingReports, setRankingReports] = useState<RankingReport[]>([]);
  const [dailyMenuItems, setDailyMenuItems] = useState<DailyMenuItem[]>([]);
  const [dailyMenuLoading, setDailyMenuLoading] = useState(false);
  const [merchantId, setMerchantId] = useState(0);
  const [merchantForm, setMerchantForm] = useState(defaultMerchant);
  const [productForm, setProductForm] = useState(defaultProduct);
  const [dailyMenuForm, setDailyMenuForm] = useState({
    serviceDate: defaultServiceDate(),
    productId: "",
    price: "",
    capacity: "80",
    name: "",
    description: "",
  });
  const [editingProductId, setEditingProductId] = useState(0);
  const [courierForm, setCourierForm] = useState({ name: "", phone: "" });
  const [faqForm, setFaqForm] = useState({
    keywords: "",
    answer: "",
    sourceLabel: "校园运营知识库",
  });
  const [staffUserId, setStaffUserId] = useState("");
  const [courierUserId, setCourierUserId] = useState("");
  const [courierId, setCourierId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [
        summaryResult,
        merchantResult,
        courierResult,
        faqResult,
        communityResult,
        reportResult,
        pendingRankingResult,
        rankingReportResult,
      ] = await Promise.all([
        apiRequest<{ items: Summary[] }>("/admin/takeout/summary"),
        apiRequest<{ items: Merchant[] }>("/admin/takeout/merchants"),
        apiRequest<{ items: Courier[] }>("/admin/couriers"),
        apiRequest<{ items: CampusFaq[] }>("/admin/campus-faqs"),
        apiRequest<{ items: ModerationPost[] }>(
          "/admin/community/posts?status=active",
        ),
        apiRequest<{ items: CommunityReport[] }>("/admin/community/reports"),
        apiRequest<{ items: ModerationRankingPlace[] }>(
          "/admin/rankings/places?status=pending",
        ),
        apiRequest<{ items: RankingReport[] }>("/admin/rankings/reports"),
      ]);
      setSummary(summaryResult.items);
      setMerchants(merchantResult.items);
      setCouriers(courierResult.items);
      setFaqs(faqResult.items);
      setCommunityPosts(communityResult.items);
      setReports(reportResult.items);
      setPendingRankingPlaces(pendingRankingResult.items);
      setRankingReports(rankingReportResult.items);
      if (!merchantId && merchantResult.items[0])
        setMerchantId(merchantResult.items[0].id);
      if (!courierId && courierResult.items[0])
        setCourierId(courierResult.items[0].id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "运营数据加载失败",
      );
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  };
  useDidShow(load);
  usePullDownRefresh(load);

  const loadDailyMenu = async (
    targetMerchantId = merchantId,
    serviceDate = dailyMenuForm.serviceDate,
  ) => {
    if (!targetMerchantId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      setDailyMenuItems([]);
      return;
    }
    setDailyMenuLoading(true);
    try {
      const result = await apiRequest<{ items: DailyMenuItem[] }>(
        `/admin/merchants/${targetMerchantId}/daily-menu?serviceDate=${encodeURIComponent(serviceDate)}`,
      );
      setDailyMenuItems(result.items);
    } catch (requestError) {
      setDailyMenuItems([]);
      showApiError(requestError);
    } finally {
      setDailyMenuLoading(false);
    }
  };

  useEffect(() => {
    void loadDailyMenu();
  }, [merchantId, dailyMenuForm.serviceDate]);

  const submit = async (
    key: string,
    task: () => Promise<unknown>,
    success: string,
  ) => {
    setActing(key);
    try {
      await task();
      Taro.showToast({ title: success, icon: "success" });
      await load();
    } catch (requestError) {
      showApiError(requestError);
    } finally {
      setActing("");
    }
  };
  const selectedMerchant = merchants.find((item) => item.id === merchantId);

  const chooseProductImage = async () => {
    try {
      const selection = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });
      const filePath = selection.tempFiles[0]?.tempFilePath;
      if (!filePath) return;
      setActing("product-image");
      const imageUrl = await uploadMedia(filePath);
      setProductForm((current) => ({ ...current, imageUrl }));
      Taro.showToast({ title: "菜品图已上传", icon: "success" });
    } catch (requestError) {
      showApiError(requestError);
    } finally {
      setActing("");
    }
  };

  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      price: product.price,
      category: product.category,
      stock: String(product.stock),
      description: product.description || "",
      imageUrl: resolveMediaUrl(product.image_url),
    });
  };

  const saveProduct = async () => {
    if (!selectedMerchant) return;
    if (productForm.name.trim().length < 2)
      throw new Error("请填写菜品名称");
    if (!Number.isFinite(Number(productForm.price)) || Number(productForm.price) <= 0)
      throw new Error("请填写正确价格");
    if (!productForm.imageUrl)
      throw new Error("请先上传真实菜品图");
    const data = {
      ...productForm,
      price: Number(productForm.price),
      stock: Number(productForm.stock),
    };
    if (editingProductId)
      await apiRequest(`/admin/products/${editingProductId}`, {
        method: "PATCH",
        data,
      });
    else
      await apiRequest(`/admin/merchants/${selectedMerchant.id}/products`, {
        method: "POST",
        data,
      });
    setProductForm(defaultProduct);
    setEditingProductId(0);
  };

  if (loading)
    return <View className="admin-state">正在加载运营权限与数据…</View>;
  if (error)
    return (
      <View className="admin-state">
        <Text>{error}</Text>
        <Text>只有被分配为学校运营管理员的账号可使用此页。</Text>
        <Button onClick={load}>重新加载</Button>
      </View>
    );

  return (
    <View className="admin-page">
      <View className="admin-heading">
        <Text>午餐运营管理</Text>
        <Text>{currentCampusName()} · 档口、菜品和履约账号均由此维护</Text>
      </View>
      <View className="admin-summary">
        {summary.length ? (
          summary.map((item) => (
            <View key={`${item.campus_slug}-${item.status}`}>
              <Text>{item.campus_slug}</Text>
              <Text>
                {item.status} · {item.count} 单 · ¥
                {(item.gross_cents / 100).toFixed(2)}
              </Text>
            </View>
          ))
        ) : (
          <Text>当前学校还没有午餐订单</Text>
        )}
      </View>

      <View className="admin-section">
        <Text className="admin-title">新建当前校区档口</Text>
        <View className="admin-form">
          <Input
            placeholder="档口名称"
            value={merchantForm.name}
            onInput={(event) =>
              setMerchantForm({ ...merchantForm, name: event.detail.value })
            }
          />
          <Input
            placeholder="品类，如 午餐/轻食"
            value={merchantForm.category}
            onInput={(event) =>
              setMerchantForm({ ...merchantForm, category: event.detail.value })
            }
          />
          <Input
            placeholder="档口介绍"
            value={merchantForm.description}
            onInput={(event) =>
              setMerchantForm({
                ...merchantForm,
                description: event.detail.value,
              })
            }
          />
          <Button
            loading={acting === "merchant"}
            disabled={Boolean(acting)}
            onClick={() =>
              submit(
                "merchant",
                async () => {
                  await apiRequest("/admin/merchants", {
                    method: "POST",
                    data: {
                      ...merchantForm,
                      deliveryMinutes: Number(merchantForm.deliveryMinutes),
                      minOrder: Number(merchantForm.minOrder),
                    },
                  });
                  setMerchantForm(defaultMerchant);
                },
                "档口已创建",
              )
            }
          >
            创建档口
          </Button>
        </View>
      </View>

      <View className="admin-section">
        <Text className="admin-title">档口与每日菜品</Text>
        <View className="admin-chips">
          {merchants.map((item) => (
            <View
              key={item.id}
              className={
                item.id === merchantId ? "admin-chip active" : "admin-chip"
              }
              onClick={() => setMerchantId(item.id)}
            >
              <Text>{item.name}</Text>
            </View>
          ))}
        </View>
        {selectedMerchant && (
          <>
            <View className="merchant-caption">
              <Text>
                {selectedMerchant.name} · {selectedMerchant.campus_slug}
              </Text>
              <Text>
                {selectedMerchant.status === "active" ? "营业中" : "已停用"}
              </Text>
            </View>
            <View className="admin-form">
              <Input
                placeholder="菜品名称"
                value={productForm.name}
                onInput={(event) =>
                  setProductForm({ ...productForm, name: event.detail.value })
                }
              />
              <View className="admin-inline">
                <Input
                  type="digit"
                  placeholder="价格"
                  value={productForm.price}
                  onInput={(event) =>
                    setProductForm({
                      ...productForm,
                      price: event.detail.value,
                    })
                  }
                />
                <Input
                  type="number"
                  placeholder="当天库存"
                  value={productForm.stock}
                  onInput={(event) =>
                    setProductForm({
                      ...productForm,
                      stock: event.detail.value,
                    })
                  }
                />
              </View>
              <Input
                placeholder="分类，如 减脂餐/面食"
                value={productForm.category}
                onInput={(event) =>
                  setProductForm({
                    ...productForm,
                    category: event.detail.value,
                  })
                }
              />
              <Input
                placeholder="菜品介绍，如 鸡腿、时蔬与杂粮饭"
                value={productForm.description}
                onInput={(event) =>
                  setProductForm({
                    ...productForm,
                    description: event.detail.value,
                  })
                }
              />
              <View className="product-image-field">
                <View className="product-image-preview">
                  {productForm.imageUrl ? (
                    <Image src={productForm.imageUrl} mode="aspectFill" />
                  ) : (
                    <Text>请上传真实菜品图</Text>
                  )}
                </View>
                <Button
                  className="image-button"
                  loading={acting === "product-image"}
                  disabled={Boolean(acting)}
                  onClick={chooseProductImage}
                >
                  {productForm.imageUrl ? "更换菜品图" : "上传菜品图"}
                </Button>
              </View>
              <Button
                loading={acting === "product"}
                disabled={Boolean(acting)}
                onClick={() =>
                  submit(
                    "product",
                    saveProduct,
                    editingProductId ? "菜品已更新" : "菜品已创建",
                  )
                }
              >
                {editingProductId ? "保存菜品修改" : "创建菜品模板"}
              </Button>
              {editingProductId > 0 && (
                <Button
                  className="form-cancel"
                  disabled={Boolean(acting)}
                  onClick={() => {
                    setEditingProductId(0);
                    setProductForm(defaultProduct);
                  }}
                >
                  取消编辑
                </Button>
              )}
            </View>
            <View className="admin-products">
              {selectedMerchant.products.map((product) => (
                <View key={product.id}>
                  <View className="admin-product-main">
                    {product.image_url && (
                      <Image
                        src={resolveMediaUrl(product.image_url)}
                        mode="aspectFill"
                      />
                    )}
                    <View>
                      <Text>{product.name}</Text>
                      <Text>
                        ¥{product.price} · 库存 {product.stock} ·{" "}
                        {product.status === "active" ? "上架" : "下架"}
                      </Text>
                    </View>
                  </View>
                  <View className="admin-actions">
                    <Button
                      className="tiny"
                      disabled={Boolean(acting)}
                      onClick={() => editProduct(product)}
                    >
                      编辑
                    </Button>
                    <Button
                      className="tiny"
                      disabled={Boolean(acting)}
                      onClick={() =>
                        submit(
                          `product-${product.id}`,
                          () =>
                            apiRequest(`/admin/products/${product.id}`, {
                              method: "PATCH",
                              data: {
                                status:
                                  product.status === "active"
                                    ? "inactive"
                                    : "active",
                              },
                            }),
                          product.status === "active" ? "已下架" : "已上架",
                        )
                      }
                    >
                      {product.status === "active" ? "下架" : "上架"}
                    </Button>
                  </View>
                </View>
              ))}
            </View>
            <View className="admin-form compact">
              <Input
                placeholder="商家员工账号 ID"
                value={staffUserId}
                onInput={(event) => setStaffUserId(event.detail.value)}
              />
              <Button
                loading={acting === "staff"}
                disabled={Boolean(acting)}
                onClick={() =>
                  submit(
                    "staff",
                    async () => {
                      await apiRequest(
                        `/admin/merchants/${selectedMerchant.id}/staff`,
                        {
                          method: "POST",
                          data: {
                            userId: Number(staffUserId),
                            role: "operator",
                          },
                        },
                      );
                      setStaffUserId("");
                    },
                    "商家权限已分配",
                  )
                }
              >
                分配商家员工
              </Button>
            </View>
          </>
        )}
      </View>

      {selectedMerchant && (
        <View className="admin-section">
          <Text className="admin-title">发布与管理每日午餐菜单</Text>
          <Text className="admin-help">
            先选营业日期，再选择模板发布。重新选择同一模板并提交即可调整当天名称、价格和份数；已下单份数不会被覆盖。
          </Text>
          <View className="admin-form">
            <Picker
              mode="date"
              value={dailyMenuForm.serviceDate}
              onChange={(event) =>
                setDailyMenuForm({
                  ...dailyMenuForm,
                  serviceDate: event.detail.value,
                })
              }
            >
              <View className="admin-date-picker">
                <Text>营业日期</Text>
                <Text>{dailyMenuForm.serviceDate}</Text>
              </View>
            </Picker>
            <View className="admin-chips">
              {selectedMerchant.products
                .filter((item) => item.status === "active")
                .map((item) => (
                  <View
                    key={item.id}
                    className={
                      Number(dailyMenuForm.productId) === item.id
                        ? "admin-chip active"
                        : "admin-chip"
                    }
                    onClick={() =>
                      setDailyMenuForm({
                        ...dailyMenuForm,
                        productId: String(item.id),
                        name: item.name,
                        description: item.description,
                        price: item.price,
                        capacity: String(item.stock),
                      })
                    }
                  >
                    <Text>{item.name}</Text>
                  </View>
                ))}
            </View>
            <View className="admin-inline">
              <Input
                type="digit"
                placeholder="当天价格"
                value={dailyMenuForm.price}
                onInput={(event) =>
                  setDailyMenuForm({
                    ...dailyMenuForm,
                    price: event.detail.value,
                  })
                }
              />
              <Input
                type="number"
                placeholder="当天可售份数"
                value={dailyMenuForm.capacity}
                onInput={(event) =>
                  setDailyMenuForm({
                    ...dailyMenuForm,
                    capacity: event.detail.value,
                  })
                }
              />
            </View>
            <Input
              placeholder="当天菜单名（可选）"
              value={dailyMenuForm.name}
              onInput={(event) =>
                setDailyMenuForm({ ...dailyMenuForm, name: event.detail.value })
              }
            />
            <Textarea
              placeholder="套餐内容或当天说明（可选）"
              value={dailyMenuForm.description}
              onInput={(event) =>
                setDailyMenuForm({
                  ...dailyMenuForm,
                  description: event.detail.value,
                })
              }
            />
            <Button
              loading={acting === "daily-menu"}
              disabled={Boolean(acting)}
              onClick={() =>
                submit(
                  "daily-menu",
                  async () => {
                    await apiRequest(
                      `/admin/merchants/${selectedMerchant.id}/daily-menu`,
                      {
                        method: "POST",
                        data: {
                          ...dailyMenuForm,
                          productId: Number(dailyMenuForm.productId),
                          price: Number(dailyMenuForm.price),
                          capacity: Number(dailyMenuForm.capacity),
                        },
                      },
                    );
                    await loadDailyMenu(
                      selectedMerchant.id,
                      dailyMenuForm.serviceDate,
                    );
                  },
                  dailyMenuItems.some(
                    (item) =>
                      item.product_id === Number(dailyMenuForm.productId),
                  )
                    ? "当天餐品已更新"
                    : "每日菜单已发布",
                )
              }
            >
              {dailyMenuItems.some(
                (item) => item.product_id === Number(dailyMenuForm.productId),
              )
                ? "更新当天餐品"
                : "发布到对应日期"}
            </Button>
          </View>
          <View className="admin-daily-menu">
            <Text className="admin-subtitle">
              {dailyMenuForm.serviceDate
                ? `${dailyMenuForm.serviceDate} 已发布餐品`
                : "输入日期后查看已发布餐品"}
            </Text>
            {dailyMenuLoading && (
              <Text className="admin-empty">正在读取当天菜单…</Text>
            )}
            {!dailyMenuLoading &&
              dailyMenuForm.serviceDate &&
              !dailyMenuItems.length && (
                <Text className="admin-empty">当天尚未发布餐品</Text>
              )}
            {!dailyMenuLoading &&
              dailyMenuItems.map((item) => (
                <View className="admin-daily-item" key={item.id}>
                  <View>
                    <Text>{item.name}</Text>
                    <Text>
                      ¥{item.price} · 可售 {item.available}/{item.capacity} ·
                      已预约 {item.reserved} ·{" "}
                      {item.status === "active" ? "售卖中" : "已停止"}
                    </Text>
                  </View>
                  <View className="admin-actions">
                    <Button
                      className="tiny"
                      disabled={Boolean(acting)}
                      onClick={() =>
                        setDailyMenuForm({
                          ...dailyMenuForm,
                          productId: String(item.product_id),
                          name: item.name,
                          description: item.description,
                          price: item.price,
                          capacity: String(item.capacity),
                        })
                      }
                    >
                      编辑
                    </Button>
                    <Button
                      className={
                        item.status === "active" ? "tiny danger" : "tiny"
                      }
                      disabled={Boolean(acting)}
                      onClick={() =>
                        submit(
                          `daily-status-${item.id}`,
                          async () => {
                            await apiRequest(`/admin/daily-menu/${item.id}`, {
                              method: "PATCH",
                              data: {
                                status:
                                  item.status === "active"
                                    ? "inactive"
                                    : "active",
                              },
                            });
                            await loadDailyMenu(
                              selectedMerchant.id,
                              dailyMenuForm.serviceDate,
                            );
                          },
                          item.status === "active"
                            ? "已停止售卖"
                            : "已恢复售卖",
                        )
                      }
                    >
                      {item.status === "active" ? "停止售卖" : "恢复售卖"}
                    </Button>
                  </View>
                </View>
              ))}
          </View>
        </View>
      )}

      <View className="admin-section">
        <Text className="admin-title">骑手与配送权限</Text>
        <View className="admin-form">
          <Input
            placeholder="骑手姓名"
            value={courierForm.name}
            onInput={(event) =>
              setCourierForm({ ...courierForm, name: event.detail.value })
            }
          />
          <Input
            type="number"
            placeholder="手机号（可选）"
            value={courierForm.phone}
            onInput={(event) =>
              setCourierForm({ ...courierForm, phone: event.detail.value })
            }
          />
          <Button
            loading={acting === "courier"}
            disabled={Boolean(acting)}
            onClick={() =>
              submit(
                "courier",
                async () => {
                  await apiRequest("/admin/couriers", {
                    method: "POST",
                    data: courierForm,
                  });
                  setCourierForm({ name: "", phone: "" });
                },
                "骑手已创建",
              )
            }
          >
            创建骑手
          </Button>
        </View>
        <View className="admin-chips">
          {couriers.map((item) => (
            <View
              key={item.id}
              className={
                item.id === courierId ? "admin-chip active" : "admin-chip"
              }
              onClick={() => setCourierId(item.id)}
            >
              <Text>{item.name}</Text>
            </View>
          ))}
        </View>
        {courierId > 0 && (
          <View className="admin-form compact">
            <Input
              placeholder="骑手微信账号 ID"
              value={courierUserId}
              onInput={(event) => setCourierUserId(event.detail.value)}
            />
            <Button
              loading={acting === "courier-account"}
              disabled={Boolean(acting)}
              onClick={() =>
                submit(
                  "courier-account",
                  async () => {
                    await apiRequest(`/admin/couriers/${courierId}/accounts`, {
                      method: "POST",
                      data: { userId: Number(courierUserId) },
                    });
                    setCourierUserId("");
                  },
                  "骑手权限已分配",
                )
              }
            >
              分配骑手权限
            </Button>
          </View>
        )}
      </View>

      <View className="admin-section">
        <Text className="admin-title">校园问答知识库</Text>
        <Text className="admin-help">
          先填写可核验的信息；“问校园
          AI”会优先使用这里的答案，并向同学展示来源。
        </Text>
        <View className="admin-form">
          <Input
            placeholder="触发词，如 午餐 外卖 小饭桌"
            value={faqForm.keywords}
            onInput={(event) =>
              setFaqForm({ ...faqForm, keywords: event.detail.value })
            }
          />
          <Textarea
            placeholder="经核验的回答内容"
            value={faqForm.answer}
            onInput={(event) =>
              setFaqForm({ ...faqForm, answer: event.detail.value })
            }
          />
          <Input
            placeholder="信息来源，如 小饭桌运营规则"
            value={faqForm.sourceLabel}
            onInput={(event) =>
              setFaqForm({ ...faqForm, sourceLabel: event.detail.value })
            }
          />
          <Button
            loading={acting === "faq"}
            disabled={Boolean(acting)}
            onClick={() =>
              submit(
                "faq",
                async () => {
                  await apiRequest("/admin/campus-faqs", {
                    method: "POST",
                    data: faqForm,
                  });
                  setFaqForm({
                    keywords: "",
                    answer: "",
                    sourceLabel: "校园运营知识库",
                  });
                },
                "知识库已新增",
              )
            }
          >
            新增问答
          </Button>
        </View>
        <View className="admin-faqs">
          {faqs.map((item) => (
            <View key={item.id}>
              <View>
                <Text>{item.keywords}</Text>
                <Text>{item.answer}</Text>
                <Text>
                  来源：{item.source_label} · {item.campus_slug || "全校区"}
                </Text>
              </View>
              <Button
                className="tiny"
                disabled={Boolean(acting)}
                onClick={() =>
                  submit(
                    `faq-${item.id}`,
                    () =>
                      apiRequest(`/admin/campus-faqs/${item.id}`, {
                        method: "PATCH",
                        data: {
                          status:
                            item.status === "active" ? "inactive" : "active",
                        },
                      }),
                    item.status === "active" ? "已停用" : "已启用",
                  )
                }
              >
                {item.status === "active" ? "停用" : "启用"}
              </Button>
            </View>
          ))}
        </View>
      </View>

      <View className="admin-section">
        <Text className="admin-title">社区内容管理</Text>
        <Text className="admin-help">
          新发布内容通过安全检测后会立即公开；管理员可在这里随时删除违规帖子。
        </Text>
        <View className="admin-faqs">
          {communityPosts.length ? (
            communityPosts.map((item) => (
              <View key={item.id}>
                <View>
                  <Text>
                    {item.author} · {item.channel}
                  </Text>
                  <Text>{item.content}</Text>
                  <Text>{item.location}</Text>
                </View>
                <View className="admin-actions">
                  <Button
                    className="tiny danger"
                    disabled={Boolean(acting)}
                    onClick={async () => {
                      const result = await Taro.showModal({
                        title: "删除这条帖子？",
                        content: "删除后将立即从当前学校的校园圈中消失，并保留后台操作记录。",
                        confirmText: "确认删除",
                        confirmColor: "#d94b61",
                      });
                      if (!result.confirm) return;
                      await submit(
                        `remove-${item.id}`,
                        () =>
                          apiRequest(`/admin/community/posts/${item.id}`, {
                            method: "PATCH",
                            data: { status: "removed", note: "管理员删除违规帖子" },
                          }),
                        "帖子已删除",
                      );
                    }}
                  >
                    删除帖子
                  </Button>
                </View>
              </View>
            ))
          ) : (
            <Text className="admin-empty">当前学校还没有公开帖子</Text>
          )}
        </View>
      </View>

      <View className="admin-section">
        <Text className="admin-title">社区举报</Text>
        <View className="admin-faqs">
          {reports.length ? (
            reports.map((item) => (
              <View key={item.id}>
                <View>
                  <Text>
                    {item.reason} · {item.reporter}
                  </Text>
                  <Text>{item.content}</Text>
                  <Text>{item.detail || "未补充说明"}</Text>
                </View>
                <Button
                  className="tiny"
                  disabled={Boolean(acting)}
                  onClick={() =>
                    submit(
                      `report-${item.id}`,
                      () =>
                        apiRequest(
                          `/admin/community/reports/${item.id}/resolve`,
                          { method: "POST" },
                        ),
                      "举报已处理",
                    )
                  }
                >
                  标记已处理
                </Button>
              </View>
            ))
          ) : (
            <Text className="admin-empty">当前没有待处理举报</Text>
          )}
        </View>
      </View>

      <View className="admin-section">
        <Text className="admin-title">校园榜单地点审核</Text>
        <Text className="admin-help">
          同学上传的地点仅在通过人工审核后公开。请核对地点是否真实、描述是否准确，并留意联系方式和广告内容。
        </Text>
        <View className="admin-faqs">
          {pendingRankingPlaces.length ? (
            pendingRankingPlaces.map((item) => (
              <View key={item.id}>
                <View>
                  <Text>
                    {item.author || "校园同学"} · {item.category}
                  </Text>
                  <Text>
                    {item.name} · {item.location}
                  </Text>
                  <Text>{item.note}</Text>
                </View>
                <View className="admin-actions">
                  <Button
                    className="tiny"
                    disabled={Boolean(acting)}
                    onClick={() =>
                      submit(
                        `ranking-approve-${item.id}`,
                        () =>
                          apiRequest(
                            `/admin/rankings/places/${item.id}/review`,
                            { method: "POST", data: { decision: "approve" } },
                          ),
                        "地点已加入榜单",
                      )
                    }
                  >
                    通过
                  </Button>
                  <Button
                    className="tiny danger"
                    disabled={Boolean(acting)}
                    onClick={() =>
                      submit(
                        `ranking-reject-${item.id}`,
                        () =>
                          apiRequest(
                            `/admin/rankings/places/${item.id}/review`,
                            {
                              method: "POST",
                              data: {
                                decision: "reject",
                                note: "地点信息未通过校园榜单规范",
                              },
                            },
                          ),
                        "地点已拒绝",
                      )
                    }
                  >
                    拒绝
                  </Button>
                </View>
              </View>
            ))
          ) : (
            <Text className="admin-empty">当前没有待审核地点</Text>
          )}
        </View>
      </View>

      <View className="admin-section">
        <Text className="admin-title">校园榜单举报</Text>
        <View className="admin-faqs">
          {rankingReports.length ? (
            rankingReports.map((item) => (
              <View key={item.id}>
                <View>
                  <Text>
                    {item.reason} · {item.reporter}
                  </Text>
                  <Text>
                    {item.name} · {item.category}
                  </Text>
                  <Text>{item.detail || "未补充说明"}</Text>
                </View>
                <Button
                  className="tiny"
                  disabled={Boolean(acting)}
                  onClick={() =>
                    submit(
                      `ranking-report-${item.id}`,
                      () =>
                        apiRequest(
                          `/admin/rankings/reports/${item.id}/resolve`,
                          { method: "POST" },
                        ),
                      "榜单举报已处理",
                    )
                  }
                >
                  标记已处理
                </Button>
              </View>
            ))
          ) : (
            <Text className="admin-empty">当前没有待处理榜单举报</Text>
          )}
        </View>
      </View>
    </View>
  );
}
