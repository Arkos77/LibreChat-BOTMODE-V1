/* CI-only: real bundled UI, real Mongo and authenticated HTTP, no API routing mocks. */
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { ideaTitle, oracleText } = JSON.parse(fs.readFileSync('/tmp/botmode-ci-ui-projection.json','utf8'));
  if (!ideaTitle || !oracleText || !process.env.CI_UI_PASSWORD) throw Error('CI_BROWSER_CONFIG_MISSING');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    for(const [email,shouldSee] of [['botmode-ci-agent@example.invalid',true],['ci-foreign-reader@example.invalid',false]]) {
      const context=await browser.newContext({baseURL:'http://127.0.0.1:3080'});
      const page=await context.newPage();
      let projection200=0;
      page.on('response',response=>{
        if(response.url().includes('/api/projects/') && response.url().includes('/bot-mode') && response.status()===200) projection200++;
      });
      await page.goto('/login',{waitUntil:'domcontentloaded'});
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(process.env.CI_UI_PASSWORD);
      await page.getByTestId('login-button').click();
      await page.waitForURL(/\/c\/new/,{timeout:30000});
      await page.goto('/ideas',{waitUntil:'domcontentloaded'});
      if(shouldSee) {
        await page.getByRole('heading',{name:ideaTitle}).waitFor({timeout:30000});
        await page.getByText(oracleText,{exact:false}).first().waitFor({timeout:30000});
        if(projection200<1) throw Error('CI_BROWSER_REAL_PROJECTION_HTTP_MISSING');
        console.log('CI_REAL_IDEA_BROWSER_ORACLE_CONTENT_VISIBLE=PASS');
        console.log('CI_REAL_IDEA_BROWSER_PROJECTION_HTTP_200=PASS');
      } else {
        const foreignTitle=await page.getByRole('heading',{name:ideaTitle}).count();
        const foreignText=await page.getByText(oracleText,{exact:false}).count();
        if(foreignTitle || foreignText || projection200) throw Error('CI_BROWSER_FOREIGN_PROJECT_LEAK');
        console.log('CI_REAL_IDEA_BROWSER_FOREIGN_ISOLATION=PASS');
      }
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(err=>{console.error('CI_REAL_IDEA_BROWSER_FAIL='+err.message.replace(/[\w.+-]+@[\w.-]+/g,'[REDACTED]').slice(0,180));process.exit(1)});
