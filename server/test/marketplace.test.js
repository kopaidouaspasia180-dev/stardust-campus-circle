import assert from "node:assert/strict"
import test from "node:test"
import {normalizeInspectionAppointment, normalizeVehicleDetails} from "../src/marketplace.js"

test("normalizes structured electric-bike details", () => {
  const currentYear = new Date().getFullYear()
  assert.deepEqual(normalizeVehicleDetails({vehicleRangeKm: "45", batteryYear: String(currentYear), registrationStatus: "registered", vehicleBrand: " 雅迪 "}, "电动车"), {
    vehicleRangeKm: 45,
    batteryYear: currentYear,
    registrationStatus: "registered",
    vehicleBrand: "雅迪"
  })
  assert.throws(() => normalizeVehicleDetails({vehicleRangeKm: 2, batteryYear: currentYear, registrationStatus: "registered", vehicleBrand: "雅迪"}, "电动车"), /实际续航/)
  assert.deepEqual(normalizeVehicleDetails({vehicleRangeKm: 2}, "数码"), {vehicleRangeKm: null, batteryYear: null, registrationStatus: "", vehicleBrand: ""})
})

test("validates inspection appointments inside the next 30 days", () => {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  const requestedDate = date.toISOString().slice(0, 10)
  assert.deepEqual(normalizeInspectionAppointment({requestedDate, requestedSlot: " 下午 ", meetingPlace: " 图书馆东门 ", note: "想重点检查电池"}), {
    requestedDate,
    requestedSlot: "下午",
    meetingPlace: "图书馆东门",
    note: "想重点检查电池"
  })
  assert.throws(() => normalizeInspectionAppointment({requestedDate, requestedSlot: "凌晨", meetingPlace: "东门"}), /验车时段/)
})
