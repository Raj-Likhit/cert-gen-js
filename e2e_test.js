const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    console.log("Starting E2E test...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Listen for console logs inside the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log("Navigating to app...");
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    console.log("Navigating to Admin Panel...");
    await page.click('.nav-btn:nth-child(2)');
    await page.waitForSelector('#adminUser');
    
    console.log("Logging in...");
    await page.type('#adminUser', 'admin');
    await page.type('#adminPass', 'admin123');
    await page.click('#loginForm button[type="submit"]');

    console.log("Uploading file...");
    await page.waitForSelector('#templateUpload');
    const inputUploadHandle = await page.$('#templateUpload');
    await inputUploadHandle.uploadFile('./sample_template.png');

    // Wait a brief moment for FileReader to process
    await new Promise(r => setTimeout(r, 1000));

    console.log("Adding participant...");
    await page.type('#newParticipant', 'John Doe');
    await page.click('#btnAddParticipant');

    console.log("Saving Configuration...");
    await page.click('#btnSaveConfig');
    
    // Wait for save toast to appear
    await new Promise(r => setTimeout(r, 500));

    console.log("Navigating to Download Certificate tab...");
    await page.click('.nav-btn:nth-child(1)');
    await page.waitForSelector('#userName');

    console.log("Generating Certificate...");
    await page.type('#userName', 'John Doe');
    await page.click('#btnGenerate');

    // Wait for canvas to draw and button href to update
    await new Promise(r => setTimeout(r, 2000));

    console.log("Extracting download result...");
    // Check if download link has data
    const href = await page.$eval('#btnDownload', el => el.href);
    if (href && href.startsWith('data:image/png')) {
        console.log("SUCCESS! Certificate generated perfectly with length:", href.length);
        const base64Data = href.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync('test_output.png', base64Data, 'base64');
        console.log("Saved test_output.png locally.");
    } else {
        console.log("FAIL! Certificate generate button href is empty or invalid:", href);
    }

    await browser.close();
})();
