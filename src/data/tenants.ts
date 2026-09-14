import type {Tenant} from "../types/tenant"

export const tenants: Tenant[] = [
  {
    id: "tangshan",
    name: "唐山学院",
    shortName: "唐院",
    province: "河北",
    city: "唐山",
    status: "active",
    theme: {primary: "#28aee5", secondary: "#426cd9", surface: "#f4fbff"},
    campuses: [
      {id: "daxuexidao", name: "南院"},
      {id: "beiyuan", name: "北院"},
      {id: "huayanbeilu", name: "华岩路"},
      {id: "longze", name: "东院"}
    ],
    capabilities: ["community", "services", "ai", "campus-guide"]
  },
  {
    id: "tstc",
    name: "唐山师范学院",
    shortName: "唐师",
    province: "河北",
    city: "唐山",
    status: "active",
    theme: {primary: "#28aee5", secondary: "#426cd9", surface: "#f4fbff"},
    campuses: [
      {id: "daxuedao", name: "大学道校区"},
      {id: "xueyuanlu", name: "学院路校区"}
    ],
    capabilities: ["community", "services", "ai", "campus-guide"]
  },
  {
    id: "stdu",
    name: "石家庄铁道大学",
    shortName: "石铁大",
    province: "河北",
    city: "石家庄",
    status: "preparing",
    theme: {primary: "#17467c", secondary: "#356fa8", surface: "#f4f8fc"},
    campuses: [{id: "main", name: "校本部"}],
    capabilities: ["campus-guide", "vr"]
  },
  {
    id: "lyit",
    name: "洛阳理工学院",
    shortName: "洛理",
    province: "河南",
    city: "洛阳",
    status: "preparing",
    theme: {primary: "#0f6a50", secondary: "#2b8a6b", surface: "#f5f1e7"},
    campuses: [
      {id: "wangcheng", name: "王城校区"},
      {id: "kaiyuan", name: "开元校区"},
      {id: "jiudu", name: "九都校区"}
    ],
    capabilities: ["campus-guide", "vr"]
  }
]

export const defaultTenant = tenants[0]
