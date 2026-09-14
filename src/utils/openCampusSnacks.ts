import Taro from "@tarojs/taro"

const LOCAL_SNACKS_ROUTE = "/pages/campus-store/index?type=snacks"

export async function openCampusSnacks() {
  await Taro.navigateTo({url: LOCAL_SNACKS_ROUTE})
}
