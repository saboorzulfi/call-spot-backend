const cron = require('node-cron');
const FacebookLeadSyncService = require('./facebook-lead-sync.service');
const TikTokLeadSyncService = require('./tiktok-lead-sync.service');

class CronService {
    constructor() {
        this.facebookLeadSync = new FacebookLeadSyncService();
        this.tiktokLeadSync = new TikTokLeadSyncService();
        this.jobs = [];
    }

    start() {
        console.log("⏰ Initializing cron jobs...");

        const facebookSyncJob = cron.schedule('*/1 * * * *', async () => {
            console.log("Running Facebook leads sync (every 1 minute)...");
            try {
                await this.facebookLeadSync.syncAllCampaigns();
            } catch (error) {
                console.error("Error in Facebook leads sync cron:", error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Dubai"
        });

        this.jobs.push({
            name: 'facebook-leads-sync',
            schedule: '*/1 * * * *',
            description: 'Facebook leads sync every 5 minutes',
            job: facebookSyncJob
        });

        const tiktokSyncJob = cron.schedule('*/1 * * * *', async () => {
            console.log("Running TikTok leads sync (every 1 minute)...");
            try {
                await this.tiktokLeadSync.syncAllCampaigns();
            } catch (error) {
                console.error("Error in TikTok leads sync cron:", error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Dubai"
        });

        this.jobs.push({
            name: 'tiktok-leads-sync',
            schedule: '*/1 * * * *',
            description: 'TikTok leads sync every 5 minutes',
            job: tiktokSyncJob
        });

        this.jobs.forEach(job => {
            job.job.start();
            console.log(`Started cron job: ${job.name} (${job.schedule})`);
        });

        console.log(`All cron jobs initialized (${this.jobs.length} jobs)`);
    }


    stop() {
        this.jobs.forEach(job => {
            job.job.stop();
            console.log(`🛑 Stopped cron job: ${job.name}`);
        });
    }


    async triggerFacebookSync() {
        console.log("🔄 Manually triggering Facebook leads sync...");
        try {
            await this.facebookLeadSync.syncAllCampaigns();
        } catch (error) {
            console.error("❌ Error in manual Facebook sync:", error);
            throw error;
        }
    }


    async triggerTikTokSync() {
        console.log("🔄 Manually triggering TikTok leads sync...");
        try {
            await this.tiktokLeadSync.syncAllCampaigns();
        } catch (error) {
            console.error("❌ Error in manual TikTok sync:", error);
            throw error;
        }
    }
}

module.exports = CronService;

