export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/login/index",
    "pages/community/index",
    "pages/profile/index",
    "pages/profile-edit/index",
    "pages/user-profile/index",
    "pages/legal/index",
    "pages/user-agreement/index",
    "pages/privacy-policy/index",
    "pages/publish/index",
    "pages/post-detail/index",
    "pages/messages/index",
    "pages/chat/index",
    "pages/school-select/index",
    "pages/express/index",
    "pages/schedule/index",
    "pages/services/index",
    "pages/takeout/index",
    "pages/takeout-orders/index",
    "pages/takeout-merchant/index",
    "pages/takeout-rider/index",
    "pages/takeout-admin/index",
    "pages/campus-store/index",
    "pages/market/index",
    "pages/errand/index",
    "pages/pdd-express/index",
    "pages/jobs/index",
    "pages/job-publish/index",
    "pages/events/index",
    "pages/lost/index",
    "pages/match/index",
    "pages/ai/index",
    "pages/new-student/index",
    "pages/rankings/index",
    "pages/ranking-create/index",
    "pages/ranking-submit/index"
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "星尘校园圈",
    navigationBarTextStyle: "black",
    backgroundColor: "#f4fbff"
  },
  lazyCodeLoading: "requiredComponents",
  sitemapLocation: "sitemap.json",
  tabBar: {
    color: "#6f7c85",
    selectedColor: "#28aee5",
    backgroundColor: "#ffffff",
    borderStyle: "black",
    list: [
      {
        pagePath: "pages/home/index",
        text: "首页",
        iconPath: "assets/icons/tab/normal/home.png",
        selectedIconPath: "assets/icons/tab/active/home.png"
      },
      {
        pagePath: "pages/community/index",
        text: "校园圈",
        iconPath: "assets/icons/tab/normal/message-circle.png",
        selectedIconPath: "assets/icons/tab/active/message-circle.png"
      },
      {
        pagePath: "pages/services/index",
        text: "校园服务",
        iconPath: "assets/icons/tab/normal/apps.png",
        selectedIconPath: "assets/icons/tab/active/apps.png"
      },
      {
        pagePath: "pages/rankings/index",
        text: "榜单",
        iconPath: "assets/icons/tab/normal/trophy.png",
        selectedIconPath: "assets/icons/tab/active/trophy.png"
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
        iconPath: "assets/icons/tab/normal/user.png",
        selectedIconPath: "assets/icons/tab/active/user.png"
      }
    ]
  }
})
