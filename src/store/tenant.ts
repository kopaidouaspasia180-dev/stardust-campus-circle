import Taro from "@tarojs/taro"
import {defaultTenant, tenants} from "../data/tenants"
import type {Tenant, TenantContext} from "../types/tenant"

const STORAGE_KEY = "stardust_tenant_context_v1"

/**
 * A tenant can be shown in the directory before its API/data has been opened.
 * Never persist or restore one of those preview tenants as the active context:
 * otherwise every following request fails with a tenant/campus 404.
 */
export function isTenantAvailable(tenant: Tenant | undefined): tenant is Tenant {
  return Boolean(tenant && tenant.status === "active" && tenant.campuses.length)
}

export function readTenantContext(): TenantContext {
  const saved = Taro.getStorageSync<TenantContext>(STORAGE_KEY)
  const savedTenant = tenants.find(item => item.id === saved?.tenantId)
  const tenant = isTenantAvailable(savedTenant) ? savedTenant : defaultTenant
  const campus = tenant.campuses.find(item => item.id === saved?.campusId) || tenant.campuses[0]
  return {tenantId: tenant.id, campusId: campus.id}
}

export function writeTenantContext(context: TenantContext) {
  const tenant = tenants.find(item => item.id === context.tenantId)
  if (!isTenantAvailable(tenant)) return
  const campus = tenant.campuses.find(item => item.id === context.campusId) || tenant.campuses[0]
  Taro.setStorageSync(STORAGE_KEY, {tenantId: tenant.id, campusId: campus.id})
}

export function currentTenant(): Tenant {
  const context = readTenantContext()
  const tenant = tenants.find(item => item.id === context.tenantId)
  return isTenantAvailable(tenant) ? tenant : defaultTenant
}

export function currentCampus() {
  const context = readTenantContext()
  const selectedTenant = tenants.find(item => item.id === context.tenantId)
  const tenant = isTenantAvailable(selectedTenant) ? selectedTenant : defaultTenant
  return tenant.campuses.find(item => item.id === context.campusId) || tenant.campuses[0]
}

export function currentCampusName(): string {
  return currentCampus().name
}
