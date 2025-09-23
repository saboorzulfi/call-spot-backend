# FreeSWITCH SIP Trunk Integration

## Overview

This implementation provides a complete FreeSWITCH SIP trunk integration with Node.js event matching system. It handles the complete call flow from incoming callers to agent connection and outbound bridging.

## Architecture

```
Incoming Caller → Queue → Agent → Outbound Call → Bridge
     ↓              ↓        ↓         ↓           ↓
  caller_uuid   Queue Mgr  agent_uuid  outbound_uuid  Bridged Call
```

## Key Components

### 1. FreeSwitchService (`src/services/freeswitch.service.js`)
- Manages FreeSWITCH Event Socket connections
- Handles event processing and parsing
- Implements bgapi commands for originate and bridge
- Tracks channel states and UUIDs

### 2. CallManagerService (`src/services/call-manager.service.js`)
- Orchestrates the complete call flow
- Manages caller_uuid and agent_uuid matching
- Handles outbound call initiation
- Implements channel bridging logic

### 3. QueueManagerService (`src/services/queue-manager.service.js`)
- Manages call queues and agent availability
- Tracks agent status (available, busy, ringing)
- Implements priority-based call routing
- Handles call timeouts and retries

### 4. SipTrunkIntegrationService (`src/services/sip-trunk-integration.service.js`)
- Main orchestrator service
- Coordinates all other services
- Provides unified API interface
- Handles system health and monitoring

## Call Flow Implementation

### Step 1: Incoming Caller
```javascript
// Incoming caller has caller_uuid
const callerUuid = `caller-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// FreeSWITCH puts it into the queue
await sipTrunkService.handleIncomingCall({
  callerUuid,
  callerNumber: '+1234567890',
  leadNumber: '+0987654321',
  accountId: 'account123',
  widgetId: 'widget456'
});
```

### Step 2: Agent Assignment
```javascript
// Agent gets a ringing channel
// When agent answers, there will be an agent channel agent_uuid
fsService.on('agentAnswered', (data) => {
  const { uuid: agentUuid, agentId } = data;
  // Node sees CHANNEL_ANSWER and recognizes it's an agent (by queue variable)
});
```

### Step 3: Outbound Call Initiation
```javascript
// Node runs bgapi originate with bridge_to variable
await fsService.originateCall(agentUuid, leadNumber, serverKey);

// Command sent: bgapi originate {bridge_to=agent_uuid}sofia/gateway/my-sip-trunk/<lead-number>
```

### Step 4: Outbound Channel Creation
```javascript
// FreeSWITCH emits CHANNEL_CREATE for the outbound leg with header variable_bridge_to=agent_uuid
fsService.on('outboundChannelCreated', (data) => {
  const { uuid: outboundUuid, agentUuid } = data;
  // Node captures that outbound leg UUID
});
```

### Step 5: Channel Bridging
```javascript
// When outbound leg CHANNEL_ANSWER happens
fsService.on('outboundAnswered', (data) => {
  const { uuid: outboundUuid, agentUuid } = data;
  // Node runs bgapi uuid_bridge agent_uuid outbound_uuid to bridge them
  await fsService.bridgeChannels(agentUuid, outboundUuid, serverKey);
});
```

## Configuration

### Environment Variables
```bash
# FreeSWITCH Configuration
FS_SERVERS=localhost,8021,ClueCon|192.168.1.100,8021,ClueCon

# SIP Trunk Configuration
SIP_TRUNK_USERNAME=your_sip_username
SIP_TRUNK_REALM=your_provider.com
SIP_TRUNK_PASSWORD=your_sip_password
SIP_TRUNK_PROXY=your_provider.com
SIP_TRUNK_EXTENSION=1000

# Call Routing Configuration
CALL_RATE_PER_SEC=160
DEFAULT_CALL_TIMEOUT=30
MAX_CALL_RETRIES=3
BRIDGE_TIMEOUT=60
```

### FreeSWITCH Configuration Files

#### SIP Profile (`freeswitch/conf/sip_profiles/my-sip-trunk.xml`)
```xml
<gateway name="my-sip-trunk">
  <param name="username" value="${sip_trunk_username}"/>
  <param name="realm" value="${sip_trunk_realm}"/>
  <param name="password" value="${sip_trunk_password}"/>
  <param name="proxy" value="${sip_trunk_proxy}"/>
  <param name="register" value="true"/>
  <!-- Additional parameters -->
</gateway>
```

#### Dialplan (`freeswitch/conf/dialplan/sip-trunk.xml`)
```xml
<extension name="sip_trunk_incoming">
  <condition field="destination_number" expression="^(\+?[1-9]\d{1,14})$">
    <action application="set" data="caller_uuid=${uuid}"/>
    <action application="set" data="lead_number=${destination_number}"/>
    <action application="set" data="queue=caller"/>
    <action application="answer"/>
    <action application="transfer" data="queue_wait XML default"/>
  </condition>
</extension>
```

## API Endpoints

### Call Management
- `POST /v1/sip-trunk/incoming-call` - Handle incoming call
- `GET /v1/sip-trunk/calls/:callId` - Get call information
- `POST /v1/sip-trunk/calls/:callId/complete` - Handle call completion
- `GET /v1/sip-trunk/calls/active` - Get active calls

### Agent Management
- `POST /v1/sip-trunk/agents` - Add agent
- `DELETE /v1/sip-trunk/agents/:agentId` - Remove agent
- `PUT /v1/sip-trunk/agents/:agentId/status` - Update agent status
- `GET /v1/sip-trunk/agents/:agentId` - Get agent information
- `POST /v1/sip-trunk/agents/:agentId/login` - Handle agent login
- `POST /v1/sip-trunk/agents/:agentId/logout` - Handle agent logout

### System Management
- `GET /v1/sip-trunk/stats` - Get system statistics
- `GET /v1/sip-trunk/queue/status` - Get queue status
- `GET /v1/sip-trunk/health` - Health check
- `POST /v1/sip-trunk/freeswitch/command` - Send FreeSWITCH command
- `POST /v1/sip-trunk/emergency` - Handle emergency

## Usage Example

### Initialize Service
```javascript
const SipTrunkIntegrationService = require('./src/services/sip-trunk-integration.service');
const config = require('./src/config/freeswitch.config');

const sipTrunkService = new SipTrunkIntegrationService(config);

// Initialize
await sipTrunkService.initialize();

// Add agents
await sipTrunkService.addAgent({
  id: 'agent-001',
  name: 'John Doe',
  extension: '1001',
  accountId: 'account-123'
});

// Handle incoming call
await sipTrunkService.handleIncomingCall({
  callerNumber: '+1234567890',
  leadNumber: '+0987654321',
  accountId: 'account-123',
  widgetId: 'widget-456'
});
```

### Event Handling
```javascript
// Listen for events
sipTrunkService.on('callerQueued', (data) => {
  console.log('Caller queued:', data.callerUuid);
});

sipTrunkService.on('agentAnswered', (data) => {
  console.log('Agent answered:', data.agentUuid);
});

sipTrunkService.on('channelsBridged', (data) => {
  console.log('Channels bridged:', data.agentUuid, '<->', data.outboundUuid);
});

sipTrunkService.on('callCompleted', (data) => {
  console.log('Call completed:', data.callId);
});
```

## Event Flow Summary

1. **Incoming Caller**: `caller_uuid` → Queue
2. **Agent Assignment**: Agent gets ringing channel → `agent_uuid`
3. **Agent Answer**: `CHANNEL_ANSWER` event for agent
4. **Outbound Initiation**: `bgapi originate {bridge_to=agent_uuid}sofia/gateway/my-sip-trunk/<lead-number>`
5. **Outbound Creation**: `CHANNEL_CREATE` with `variable_bridge_to=agent_uuid`
6. **Outbound Answer**: `CHANNEL_ANSWER` for outbound leg
7. **Channel Bridging**: `bgapi uuid_bridge agent_uuid outbound_uuid`

## Monitoring and Health

### Health Check
```javascript
const health = sipTrunkService.healthCheck();
console.log('System Status:', health.status);
console.log('FreeSWITCH Connected:', health.services.freeswitch);
console.log('Queue Status:', health.services.queue);
```

### Statistics
```javascript
const stats = sipTrunkService.getSystemStats();
console.log('Queue Length:', stats.queue.queueLength);
console.log('Active Calls:', stats.queue.activeCalls);
console.log('Available Agents:', stats.queue.availableAgents);
```

## Error Handling

The system includes comprehensive error handling for:
- FreeSWITCH connection failures
- Agent unavailability
- Call timeouts
- Bridge failures
- Network issues

All errors are logged and can be monitored through the health check endpoint.

## Security Considerations

- All API endpoints require authentication
- FreeSWITCH connections use password authentication
- SIP trunk credentials are stored securely
- Rate limiting prevents abuse
- Input validation on all endpoints

## Performance Optimization

- Connection pooling for FreeSWITCH
- Efficient event processing
- Queue management with priorities
- Automatic cleanup of expired calls
- Resource monitoring and alerts

This implementation provides a robust, scalable solution for FreeSWITCH SIP trunk integration with comprehensive event matching and call management capabilities.

