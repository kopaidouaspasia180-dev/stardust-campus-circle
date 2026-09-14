import Taro from "@tarojs/taro"

const LOCAL_TAKEOUT_ROUTE = "/pages/takeout/index"

export async function openCampusTakeout() {
  await Taro.navigateTo({url: LOCAL_TAKEOUT_ROUTE})
}
