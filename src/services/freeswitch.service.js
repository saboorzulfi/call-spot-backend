const net = require('net');
const EventEmitter = require('events');

/**
 * FreeSWITCH Event Socket Service
 * Handles connection to FreeSWITCH and processes events for SIP trunk integration
 */
class FreeSwitchService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.connections = new Map();
    this.eventHandlers = new Map();
    this.callStates = new Map(); // Track call states
    this.agentChannels = new Map(); // Track agent channels
    this.outboundChannels = new Map(); // Track outbound channels
    this.isConnected = false;
  }

  /**
   * Initialize FreeSWITCH connections
   */
  async initialize() {
    try {
      console.log('Initializing FreeSWITCH connections...');
      
      // Connect to all configured FreeSWITCH servers
      for (const server of this.config.servers) {
        await this.connectToServer(server);
      }
      
      this.isConnected = true;
      console.log('FreeSWITCH service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize FreeSWITCH service:', error);
      throw error;
    }
  }

  /**
   * Connect to a specific FreeSWITCH server
   */
  async connectToServer(server) {
    return new Promise((resolve, reject) => {
      const connection = new net.Socket();
      const serverKey = `${server.host}:${server.port}`;
      let authReceived = false;
      
      connection.connect(server.port, server.host, () => {
        console.log(`Connected to FreeSWITCH server: ${serverKey}`);
        
        // Set up event listeners first
        this.setupConnectionListeners(connection, serverKey, server);
        
        // Send authentication
        connection.write(`auth ${server.password}\n\n`);
      });

      // Handle authentication response
      connection.on('data', (data) => {
        const response = data.toString();
        if (response.includes('+OK accepted') && !authReceived) {
          authReceived = true;
          console.log(`Authentication successful for ${serverKey}`);
          
          this.connections.set(serverKey, {
            socket: connection,
            server: server,
            connected: true
          });
          
          resolve();
        } else if (response.includes('-ERR invalid') && !authReceived) {
          reject(new Error(`Authentication failed for ${serverKey}`));
        }
      });

      connection.on('error', (error) => {
        console.error(`Connection error to ${serverKey}:`, error);
        reject(error);
      });

      connection.on('close', () => {
        console.log(`Connection closed to ${serverKey}`);
        this.connections.delete(serverKey);
        this.isConnected = this.connections.size > 0;
        
        // Attempt reconnection after 5 seconds
        setTimeout(() => {
          console.log(`Attempting to reconnect to ${serverKey}...`);
          this.connectToServer(server).catch(error => {
            console.error(`Reconnection failed for ${serverKey}:`, error);
          });
        }, 5000);
      });
    });
  }

  /**
   * Set up event listeners for a connection
   */
  setupConnectionListeners(connection, serverKey, server) {
    let buffer = '';
    let eventSubscriptionSent = false;
    
    connection.on('data', (data) => {
      buffer += data.toString();
      
      // Send event subscription after authentication
      if (!eventSubscriptionSent && buffer.includes('+OK accepted')) {
        const eventCommand = `events json ${server.eventList || 'CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE CHANNEL_ORIGINATE'}\n\n`;
        connection.write(eventCommand);
        eventSubscriptionSent = true;
        console.log(`Event subscription sent to ${serverKey}`);
      }
      
      // Process complete events
      while (buffer.includes('\n\n')) {
        const eventEnd = buffer.indexOf('\n\n');
        const eventData = buffer.substring(0, eventEnd);
        buffer = buffer.substring(eventEnd + 2);
        
        // Skip authentication responses
        if (!eventData.includes('+OK') && !eventData.includes('-ERR') && eventData.trim()) {
          this.processEvent(eventData, serverKey);
        }
      }
    });
  }

  /**
   * Process incoming FreeSWITCH events
   */
  processEvent(eventData, serverKey) {
    try {
      // Parse event data
      const event = this.parseEventData(eventData);
      
      if (!event) return;

      console.log(`[${serverKey}] Event: ${event['Event-Name']} - UUID: ${event['Unique-ID']}`);
      
      // Handle specific events
      switch (event['Event-Name']) {
        case 'CHANNEL_CREATE':
          this.handleChannelCreate(event, serverKey);
          break;
        case 'CHANNEL_ANSWER':
          this.handleChannelAnswer(event, serverKey);
          break;
        case 'CHANNEL_HANGUP_COMPLETE':
          this.handleChannelHangup(event, serverKey);
          break;
        case 'CHANNEL_ORIGINATE':
          this.handleChannelOriginate(event, serverKey);
          break;
        default:
          // Emit other events for external handling
          this.emit('event', event, serverKey);
      }
    } catch (error) {
      console.error('Error processing event:', error);
    }
  }

  /**
   * Parse event data into object
   */
  parseEventData(eventData) {
    const lines = eventData.split('\n');
    const event = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        event[key] = value;
      }
    }
    
    return Object.keys(event).length > 0 ? event : null;
  }

  /**
   * Handle CHANNEL_CREATE events
   */
  handleChannelCreate(event, serverKey) {
    const uuid = event['Unique-ID'];
    const bridgeTo = event['variable_bridge_to'];
    
    if (bridgeTo) {
      // This is an outbound leg created for bridging
      console.log(`Outbound channel created: ${uuid} for agent: ${bridgeTo}`);
      this.outboundChannels.set(uuid, {
        agentUuid: bridgeTo,
        leadNumber: event['Caller-Destination-Number'],
        createdAt: new Date(),
        serverKey: serverKey
      });
      
      this.emit('outboundChannelCreated', {
        uuid: uuid,
        agentUuid: bridgeTo,
        leadNumber: event['Caller-Destination-Number'],
        serverKey: serverKey
      });
    }
  }

  /**
   * Handle CHANNEL_ANSWER events
   */
  handleChannelAnswer(event, serverKey) {
    const uuid = event['Unique-ID'];
    const queueVariable = event['variable_queue'];
    
    console.log(`Channel answered: ${uuid}, Queue: ${queueVariable}`);
    
    // Check if this is an agent channel
    if (queueVariable === 'agent') {
      this.handleAgentAnswer(uuid, event, serverKey);
    } else if (this.outboundChannels.has(uuid)) {
      // This is an outbound leg answering
      this.handleOutboundAnswer(uuid, event, serverKey);
    }
  }

  /**
   * Handle agent channel answer
   */
  handleAgentAnswer(uuid, event, serverKey) {
    console.log(`Agent answered: ${uuid}`);
    
    this.agentChannels.set(uuid, {
      agentId: event['variable_agent_id'],
      accountId: event['variable_account_id'],
      widgetId: event['variable_widget_id'],
      answeredAt: new Date(),
      serverKey: serverKey
    });
    
    // Emit event for external handling
    this.emit('agentAnswered', {
      uuid: uuid,
      agentId: event['variable_agent_id'],
      accountId: event['variable_account_id'],
      widgetId: event['variable_widget_id'],
      serverKey: serverKey
    });
  }

  /**
   * Handle outbound channel answer
   */
  handleOutboundAnswer(uuid, event, serverKey) {
    const outboundInfo = this.outboundChannels.get(uuid);
    
    if (outboundInfo) {
      console.log(`Outbound channel answered: ${uuid} for agent: ${outboundInfo.agentUuid}`);
      
      // Bridge the agent and outbound channels
      this.bridgeChannels(outboundInfo.agentUuid, uuid, serverKey);
      
      this.emit('outboundAnswered', {
        uuid: uuid,
        agentUuid: outboundInfo.agentUuid,
        leadNumber: outboundInfo.leadNumber,
        serverKey: serverKey
      });
    }
  }

  /**
   * Handle channel hangup
   */
  handleChannelHangup(event, serverKey) {
    const uuid = event['Unique-ID'];
    
    // Clean up tracking maps
    this.agentChannels.delete(uuid);
    this.outboundChannels.delete(uuid);
    
    this.emit('channelHangup', {
      uuid: uuid,
      serverKey: serverKey,
      hangupCause: event['Hangup-Cause']
    });
  }

  /**
   * Handle channel originate
   */
  handleChannelOriginate(event, serverKey) {
    const uuid = event['Unique-ID'];
    const callerUuid = event['variable_caller_uuid'];
    
    if (callerUuid) {
      console.log(`Channel originated: ${uuid} for caller: ${callerUuid}`);
      
      this.emit('channelOriginated', {
        uuid: uuid,
        callerUuid: callerUuid,
        serverKey: serverKey
      });
    }
  }

  /**
   * Bridge two channels together
   */
  async bridgeChannels(agentUuid, outboundUuid, serverKey) {
    try {
      const connection = this.connections.get(serverKey);
      if (!connection || !connection.connected) {
        throw new Error(`No connection to server: ${serverKey}`);
      }

      const command = `bgapi uuid_bridge ${agentUuid} ${outboundUuid}\n\n`;
      connection.socket.write(command);
      
      console.log(`Bridging channels: ${agentUuid} <-> ${outboundUuid}`);
      
      this.emit('channelsBridged', {
        agentUuid: agentUuid,
        outboundUuid: outboundUuid,
        serverKey: serverKey
      });
    } catch (error) {
      console.error('Error bridging channels:', error);
      this.emit('bridgeError', error);
    }
  }

  /**
   * Originate a call to a lead number
   */
  async originateCall(agentUuid, leadNumber, serverKey) {
    try {
      const connection = this.connections.get(serverKey);
      if (!connection || !connection.connected) {
        throw new Error(`No connection to server: ${serverKey}`);
      }

      // Use bgapi to originate call with bridge_to variable
      const command = `bgapi originate {bridge_to=${agentUuid}}sofia/gateway/my-sip-trunk/${leadNumber}\n\n`;
      connection.socket.write(command);
      
      console.log(`Originating call to ${leadNumber} for agent ${agentUuid}`);
      
      this.emit('callOriginated', {
        agentUuid: agentUuid,
        leadNumber: leadNumber,
        serverKey: serverKey
      });
    } catch (error) {
      console.error('Error originating call:', error);
      this.emit('originateError', error);
    }
  }

  /**
   * Send command to FreeSWITCH
   */
  async sendCommand(command, serverKey) {
    try {
      const connection = this.connections.get(serverKey);
      if (!connection || !connection.connected) {
        throw new Error(`No connection to server: ${serverKey}`);
      }

      connection.socket.write(`${command}\n\n`);
      console.log(`Sent command to ${serverKey}: ${command}`);
    } catch (error) {
      console.error('Error sending command:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    const status = {
      connected: this.isConnected,
      connections: []
    };

    for (const [serverKey, connection] of this.connections) {
      status.connections.push({
        server: serverKey,
        connected: connection.connected,
        serverConfig: connection.server
      });
    }

    return status;
  }

  /**
   * Close all connections
   */
  async close() {
    console.log('Closing FreeSWITCH connections...');
    
    for (const [serverKey, connection] of this.connections) {
      connection.socket.destroy();
    }
    
    this.connections.clear();
    this.isConnected = false;
    console.log('FreeSWITCH connections closed');
  }
}

module.exports = FreeSwitchService;
