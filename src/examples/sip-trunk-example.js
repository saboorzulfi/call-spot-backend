/**
 * SIP Trunk Integration Example
 * Demonstrates how to use the FreeSWITCH SIP trunk integration system
 */

const SipTrunkIntegrationService = require('../services/sip-trunk-integration.service');
const config = require('../config/freeswitch.config');

async function runExample() {
  console.log('Starting SIP Trunk Integration Example...');
  
  // Initialize the service
  const sipTrunkService = new SipTrunkIntegrationService(config);
  
  // Set up event listeners
  setupEventListeners(sipTrunkService);
  
  try {
    // Initialize the service
    await sipTrunkService.initialize();
    console.log('✅ Service initialized successfully');
    
    // Add some agents
    await addAgents(sipTrunkService);
    
    // Simulate incoming calls
    await simulateIncomingCalls(sipTrunkService);
    
    // Monitor system for a while
    await monitorSystem(sipTrunkService);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await sipTrunkService.shutdown();
    console.log('✅ Service shutdown complete');
  }
}

function setupEventListeners(sipTrunkService) {
  // Call flow events
  sipTrunkService.on('callerQueued', (data) => {
    console.log(`📞 Caller queued: ${data.callerUuid}`);
  });
  
  sipTrunkService.on('agentAssigned', (data) => {
    console.log(`👤 Agent assigned: ${data.agentId} to call ${data.callId}`);
  });
  
  sipTrunkService.on('agentAnswered', (data) => {
    console.log(`✅ Agent answered: ${data.agentUuid}`);
  });
  
  sipTrunkService.on('outboundCallInitiated', (data) => {
    console.log(`📞 Outbound call initiated to: ${data.leadNumber}`);
  });
  
  sipTrunkService.on('outboundAnswered', (data) => {
    console.log(`✅ Outbound answered: ${data.outboundUuid}`);
  });
  
  sipTrunkService.on('channelsBridged', (data) => {
    console.log(`🔗 Channels bridged: ${data.agentUuid} <-> ${data.outboundUuid}`);
  });
  
  sipTrunkService.on('callCompleted', (data) => {
    console.log(`✅ Call completed: ${data.callId} (Duration: ${data.duration}s)`);
  });
  
  // Error events
  sipTrunkService.on('bridgeError', (error) => {
    console.error(`❌ Bridge error:`, error);
  });
  
  sipTrunkService.on('originateError', (error) => {
    console.error(`❌ Originate error:`, error);
  });
  
  // System events
  sipTrunkService.on('noAgentsAvailable', (data) => {
    console.log(`⚠️ No agents available (Queue length: ${data.queueLength})`);
  });
  
  sipTrunkService.on('callExpired', (data) => {
    console.log(`⏰ Call expired: ${data.callId} (Wait time: ${data.waitTime}s)`);
  });
}

async function addAgents(sipTrunkService) {
  console.log('\n👥 Adding agents...');
  
  const agents = [
    { id: 'agent-001', name: 'John Doe', extension: '1001' },
    { id: 'agent-002', name: 'Jane Smith', extension: '1002' },
    { id: 'agent-003', name: 'Bob Johnson', extension: '1003' }
  ];
  
  for (const agent of agents) {
    await sipTrunkService.addAgent({
      ...agent,
      accountId: 'account-123'
    });
    console.log(`✅ Added agent: ${agent.name} (${agent.id})`);
  }
}

async function simulateIncomingCalls(sipTrunkService) {
  console.log('\n📞 Simulating incoming calls...');
  
  const calls = [
    { callerNumber: '+1234567890', leadNumber: '+0987654321', priority: 1 },
    { callerNumber: '+1234567891', leadNumber: '+0987654322', priority: 2 },
    { callerNumber: '+1234567892', leadNumber: '+0987654323', priority: 1 }
  ];
  
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    
    console.log(`📞 Simulating call ${i + 1}: ${call.callerNumber} -> ${call.leadNumber}`);
    
    await sipTrunkService.handleIncomingCall({
      callerNumber: call.callerNumber,
      leadNumber: call.leadNumber,
      accountId: 'account-123',
      widgetId: 'widget-456',
      priority: call.priority,
      maxWaitTime: 60
    });
    
    // Wait a bit between calls
    await sleep(2000);
  }
}

async function monitorSystem(sipTrunkService) {
  console.log('\n📊 Monitoring system...');
  
  for (let i = 0; i < 10; i++) {
    const stats = sipTrunkService.getSystemStats();
    
    console.log(`\n📊 System Stats (${i + 1}/10):`);
    console.log(`   Queue Length: ${stats.queue.queueLength}`);
    console.log(`   Active Calls: ${stats.queue.activeCalls}`);
    console.log(`   Available Agents: ${stats.queue.availableAgents}/${stats.queue.totalAgents}`);
    console.log(`   FreeSWITCH Connected: ${stats.freeswitch.connected}`);
    
    // Health check
    const health = sipTrunkService.healthCheck();
    console.log(`   System Status: ${health.status}`);
    
    await sleep(5000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = { runExample };

