const clean = (value, max) => String(value ?? "").trim().slice(0, max)

export function normalizeVehicleDetails(input = {}, category = "") {
  if (category !== "电动车") {
    return {vehicleRangeKm: null, batteryYear: null, registrationStatus: "", vehicleBrand: ""}
  }
  const vehicleRangeKm = Number(input.vehicleRangeKm)
  const batteryYear = Number(input.batteryYear)
  const currentYear = new Date().getFullYear()
  const registrationStatus = clean(input.registrationStatus, 20)
  const vehicleBrand = clean(input.vehicleBrand, 40)
  if (!vehicleBrand) throw Object.assign(new Error("请填写车辆品牌"), {status: 400})
  if (!Number.isInteger(vehicleRangeKm) || vehicleRangeKm < 5 || vehicleRangeKm > 250) {
    throw Object.assign(new Error("请填写 5 至 250 公里的实际续航"), {status: 400})
  }
  if (!Number.isInteger(batteryYear) || batteryYear < 2015 || batteryYear > currentYear) {
    throw Object.assign(new Error("请填写有效的电池年份"), {status: 400})
  }
  if (!new Set(["registered", "unregistered", "unknown"]).has(registrationStatus)) {
    throw Object.assign(new Error("请选择车辆登记情况"), {status: 400})
  }
  return {vehicleRangeKm, batteryYear, registrationStatus, vehicleBrand}
}

export function normalizeInspectionAppointment(input = {}) {
  const requestedDate = clean(input.requestedDate, 10)
  const requestedSlot = clean(input.requestedSlot, 30)
  const meetingPlace = clean(input.meetingPlace, 80)
  const note = clean(input.note, 200)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || Number.isNaN(Date.parse(`${requestedDate}T00:00:00`))) {
    throw Object.assign(new Error("请选择有效的验车日期"), {status: 400})
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const requested = new Date(`${requestedDate}T00:00:00`)
  const latest = new Date(today)
  latest.setDate(latest.getDate() + 30)
  if (requested < today || requested > latest) {
    throw Object.assign(new Error("验车日期需在未来 30 天内"), {status: 400})
  }
  if (!new Set(["上午", "下午", "晚上"]).has(requestedSlot)) {
    throw Object.assign(new Error("请选择验车时段"), {status: 400})
  }
  if (meetingPlace.length < 4) throw Object.assign(new Error("请填写具体的校内验车地点"), {status: 400})
  return {requestedDate, requestedSlot, meetingPlace, note}
}
