import Taro from "@tarojs/taro"
import {defaultTenant, tenants} from "../data/tenants"
import type {Tenant, TenantContext} from "../types/tenant"

const STORAGE_KEY = "stardust_tenant_context_v1"

export function readTenantContext(): TenantContext {
  const saved = Taro.getStorageSync<TenantContext>(STORAGE_KEY)
  const tenant = tenants.find(item => item.id === saved?.tenantId) || defaultTenant
  const campus = tenant.campuses.find(item => item.id === saved?.campusId) || tenant.campuses[0]
  return {tenantId: tenant.id, campusId: campus.id}
}

export function writeTenantContext(context: TenantContext) {
  Taro.setStorageSync(STORAGE_KEY, context)
}

export function currentTenant(): Tenant {
  const context = readTenantContext()
  return tenants.find(item => item.id === context.tenantId) || defaultTenant
}

export function currentCampusName(): string {
  const context = readTenantContext()
  const tenant = tenants.find(item => item.id === context.tenantId) || defaultTenant
  return tenant.campuses.find(item => item.id === context.campusId)?.name || tenant.campuses[0].name
}
