const cron = require('node-cron');
const FacebookLeadSyncService = require('./facebook-lead-sync.service');
const TikTokLeadSyncService = require('./tiktok-lead-sync.service');

class CronService {
    constructor() {
        this.facebookLeadSync = new FacebookLeadSyncService();
        this.tiktokLeadSync = new TikTokLeadSyncService();
        this.jobs = [];
    }

    /**
     * Initialize all cron jobs
     */
    start() {
        console.log("⏰ Initializing cron jobs...");

        // Facebook leads sync every 5 minutes
        const facebookSyncJob = cron.schedule('*/1 * * * *', async () => {
            console.log("📅 Running Facebook leads sync (every 5 minutes)...");
            try {
                await this.facebookLeadSync.syncAllCampaigns();
            } catch (error) {
                console.error("❌ Error in Facebook leads sync cron:", error);
            }
        }, {
            scheduled: false, // Don't start immediately, we'll start it manually
            timezone: "Asia/Dubai"
        });

        this.jobs.push({
            name: 'facebook-leads-sync',
            schedule: '*/1 * * * *',
            description: 'Facebook leads sync every 5 minutes',
            job: facebookSyncJob
        });

        // TikTok leads sync every 5 minutes
        const tiktokSyncJob = cron.schedule('*/1 * * * *', async () => {
            console.log("📅 Running TikTok leads sync (every 5 minutes)...");
            try {
                await this.tiktokLeadSync.syncAllCampaigns();
            } catch (error) {
                console.error("❌ Error in TikTok leads sync cron:", error);
            }
        }, {
            scheduled: false, // Don't start immediately, we'll start it manually
            timezone: "Asia/Dubai"
        });

        this.jobs.push({
            name: 'tiktok-leads-sync',
            schedule: '*/1 * * * *',
            description: 'TikTok leads sync every 5 minutes',
            job: tiktokSyncJob
        });

        // Start all jobs
        this.jobs.forEach(job => {
            job.job.start();
            console.log(`✅ Started cron job: ${job.name} (${job.schedule})`);
        });

        console.log(`✅ All cron jobs initialized (${this.jobs.length} jobs)`);
    }

    /**
     * Stop all cron jobs
     */
    stop() {
        this.jobs.forEach(job => {
            job.job.stop();
            console.log(`🛑 Stopped cron job: ${job.name}`);
        });
    }

    /**
     * Manually trigger Facebook leads sync (for testing)
     */
    async triggerFacebookSync() {
        console.log("🔄 Manually triggering Facebook leads sync...");
        try {
            await this.facebookLeadSync.syncAllCampaigns();
        } catch (error) {
            console.error("❌ Error in manual Facebook sync:", error);
            throw error;
        }
    }

    /**
     * Manually trigger TikTok leads sync (for testing)
     */
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

