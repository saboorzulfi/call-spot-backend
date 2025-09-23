/**
 * FreeSWITCH Configuration
 * Environment variables for FreeSWITCH connection and SIP trunk settings
 */

module.exports = {
  // FreeSWITCH Event Socket Configuration
  freeswitch: {
    servers: process.env.FS_SERVERS ? 
      process.env.FS_SERVERS.split('|').map(server => {
        const [host, port, password] = server.split(',');
        return {
          host: host || 'localhost',
          port: parseInt(port) || 8021,
          password: password || 'ClueCon',
          eventList: 'CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE CHANNEL_ORIGINATE'
        };
      }) : [
        {
          host: 'localhost',
          port: 8021,
          password: 'ClueCon',
          eventList: 'CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE CHANNEL_ORIGINATE'
        }
      ]
  },

  // SIP Trunk Configuration
  sipTrunk: {
    name: 'my-sip-trunk',
    username: process.env.SIP_TRUNK_USERNAME || 'your_username',
    realm: process.env.SIP_TRUNK_REALM || 'your_provider.com',
    password: process.env.SIP_TRUNK_PASSWORD || 'your_password',
    proxy: process.env.SIP_TRUNK_PROXY || 'your_provider.com',
    extension: process.env.SIP_TRUNK_EXTENSION || '1000',
    context: 'public'
  },

  // Call Routing Configuration
  routing: {
    defaultTimeout: parseInt(process.env.DEFAULT_CALL_TIMEOUT) || 30,
    maxRetries: parseInt(process.env.MAX_CALL_RETRIES) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 5000,
    bridgeTimeout: parseInt(process.env.BRIDGE_TIMEOUT) || 60
  },

  // Queue Configuration
  queue: {
    maxAgents: parseInt(process.env.MAX_AGENTS) || 100,
    ringTimeout: parseInt(process.env.AGENT_RING_TIMEOUT) || 20,
    agentTimeout: parseInt(process.env.AGENT_TIMEOUT) || 30,
    queueTimeout: parseInt(process.env.QUEUE_TIMEOUT) || 60
  }
};
