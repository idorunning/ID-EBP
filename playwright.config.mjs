import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,retries:0,reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}:{}},
 webServer:{command:'node scripts/browser-fixture-server.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
