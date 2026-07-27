import {chromium} from "playwright-core"

const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true})
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const base="https://stardust.sale/campus-circle/"
const checks=[
  ["takeout/index",".business-page"],
  ["market/index",".business-page"],
  ["errand/index",".service-page"],
  ["express/index",".service-page"],
  ["jobs/index",".service-page"],
  ["events/index",".service-page"],
  ["schedule/index",".service-page"],
  ["match/index",".service-page"],
  ["campus-store/index?type=fruit",".service-page"],
  ["services/index",".services-page"]
]
const result={}
await page.goto(base,{waitUntil:"networkidle"})
for(const [route,selector] of checks){
  const errors=[]
  page.removeAllListeners("console")
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text())})
  await page.evaluate(hash=>{window.location.hash=hash},`#/campus-circle/pages/${route}`)
  await page.waitForSelector(selector)
  result[route]={visible:await page.locator(selector).isVisible(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),errors}
}
await browser.close()
console.log(JSON.stringify(result,null,2))
if(Object.values(result).some(item=>!item.visible||item.overflow||item.errors.length))process.exitCode=1
