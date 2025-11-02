const CampaignRepository = require("../repositories/campaign.repository");
const CallRepository = require("../repositories/call.repository");
const AppResponse = require("../../utils/response.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");

class DashboardController {
  constructor() {
    this.campaignRepo = new CampaignRepository();
    this.callRepo = new CallRepository();
  }

  // GET /dashboard/stats - Get dashboard statistics
  getStats = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    // Get all campaigns for this account
    const campaigns = await this.campaignRepo.findByAccount(accountId, { 
      page: 1, 
      limit: 1000 // Get all campaigns
    });

    // Aggregate call stats from all campaigns
    let totalCalls = 0;
    let answeredCalls = 0;
    let missedCalls = 0;
    let noAnswerCalls = 0;

    campaigns.campaigns.forEach(campaign => {
      if (campaign.call_stats) {
        totalCalls += campaign.call_stats.total || 0;
        answeredCalls += campaign.call_stats.answered || 0;
        missedCalls += campaign.call_stats.missed || 0;
        noAnswerCalls += campaign.call_stats.no_answer || 0;
      }
    });

    // Calculate answer rate
    const answerRate = totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(2) : 0;

    const responseData = {
      stats: {
        total_calls: totalCalls,
        answered_calls: answeredCalls,
        missed_calls: missedCalls,
        no_answer_calls: noAnswerCalls,
        answer_rate: parseFloat(answerRate)
      },
      campaigns: {
        total: campaigns.pagination.totalCount,
        active: campaigns.campaigns.filter(c => c.is_active).length
      }
    };

    return AppResponse.success(res, responseData, "Dashboard statistics retrieved successfully", statusCode.OK);
  });

  // GET /dashboard/stats/by-campaign - Get stats grouped by campaign
  getStatsByCampaign = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    // Get all campaigns for this account
    const campaigns = await this.campaignRepo.findByAccount(accountId, { 
      page: 1, 
      limit: 1000 // Get all campaigns
    });

    const campaignStats = campaigns.campaigns.map(campaign => ({
      campaign_id: campaign._id,
      campaign_name: campaign.name,
      is_active: campaign.is_active,
      stats: {
        total_calls: campaign.call_stats?.total || 0,
        answered_calls: campaign.call_stats?.answered || 0,
        missed_calls: campaign.call_stats?.missed || 0,
        no_answer_calls: campaign.call_stats?.no_answer || 0,
        answer_rate: campaign.call_stats?.total > 0 
          ? parseFloat(((campaign.call_stats.answered / campaign.call_stats.total) * 100).toFixed(2))
          : 0
      }
    }));

    const responseData = {
      campaigns: campaignStats,
      summary: {
        total_campaigns: campaigns.pagination.totalCount,
        active_campaigns: campaigns.campaigns.filter(c => c.is_active).length
      }
    };

    return AppResponse.success(res, responseData, "Campaign statistics retrieved successfully", statusCode.OK);
  });
}

module.exports = DashboardController;

