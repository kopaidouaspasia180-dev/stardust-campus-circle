export type TenantTheme = {
  primary: string
  secondary: string
  surface: string
}

export type Campus = {
  id: string
  name: string
}

export type Tenant = {
  id: string
  name: string
  shortName: string
  province: string
  city: string
  status: "active" | "preparing"
  theme: TenantTheme
  campuses: Campus[]
  capabilities: string[]
}

export type TenantContext = {
  tenantId: string
  campusId: string
}
