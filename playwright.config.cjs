const {defineConfig,devices}=require('@playwright/test');
const executablePath=process.env.TRIAGE_CHROMIUM_EXECUTABLE;
const chromiumOptions=executablePath?{launchOptions:{executablePath,args:process.env.TRIAGE_CHROMIUM_ARGS?JSON.parse(process.env.TRIAGE_CHROMIUM_ARGS):[]}}:{};
module.exports=defineConfig({
  testDir:'./tests/browser',testMatch:'*.spec.cjs',timeout:30000,expect:{timeout:10000},
  fullyParallel:true,workers:process.env.CI?2:2,forbidOnly:!!process.env.CI,retries:process.env.CI?1:0,
  reporter:[['list']],outputDir:'test-results',
  use:{baseURL:'http://127.0.0.1:4173',acceptDownloads:true,timezoneId:'UTC',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node scripts/test-server.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:15000},
  projects:[
    {name:'chromium-desktop',use:{...devices['Desktop Chrome'],...chromiumOptions}},
    {name:'firefox-desktop',use:{...devices['Desktop Firefox']}},
    {name:'chromium-mobile',use:{...devices['Pixel 7'],...chromiumOptions}}
  ]
});
