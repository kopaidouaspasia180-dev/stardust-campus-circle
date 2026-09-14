import {chromium} from "playwright-core"
import {resolveBrowserExecutable} from "./qa-browser.mjs"

const browser=await chromium.launch({executablePath:resolveBrowserExecutable(),headless:true})
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const base=process.env.QA_BASE ?? "http://127.0.0.1:4176/campus-circle/"
const checks=[
  ["takeout/index",".takeout-v4"],
  ["market/index",".service-v2"],
  ["errand/index",".service-v2"],
  ["express/index",".service-v2"],
  ["jobs/index",".service-v2"],
  ["events/index",".service-v2"],
  ["schedule/index",".schedule-v4"],
  ["match/index",".service-v2"],
  ["campus-store/index?type=fruit",".service-v2"],
  ["campus-store/index?type=flowers",".service-v2"],
  ["campus-store/index?type=snacks",".service-v2"],
  ["lost/index",".service-v2"],
  ["market/index?category=电动车",".service-v2"],
  ["services/index",".services-page"]
]
const result={}
await page.goto(base,{waitUntil:"networkidle"})
for(const [route,selector] of checks){
  const errors=[]
  page.removeAllListeners("console")
  page.on("console",message=>{
    const text=message.text()
    const expectedLocalApiFailure=/blocked by CORS policy|Failed to load resource: (?:net::ERR_FAILED|the server responded with a status of 401)/.test(text)
    if(message.type()==="error"&&!expectedLocalApiFailure)errors.push(text)
  })
  await page.evaluate(hash=>{window.location.hash=hash},`#/campus-circle/pages/${route}`)
  await page.waitForSelector(selector)
  await page.waitForTimeout(250)
  result[route]={visible:await page.locator(selector).isVisible(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),errors}
}
await browser.close()
console.log(JSON.stringify(result,null,2))
if(Object.values(result).some(item=>!item.visible||item.overflow||item.errors.length))process.exitCode=1
