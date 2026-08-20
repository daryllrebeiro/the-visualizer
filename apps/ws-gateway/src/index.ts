import { logger } from '@the-visualizer/logging';
import { WebSocketServer } from 'ws';

export const wss = new WebSocketServer({ noServer: true });
logger.info('WebSocket Gateway initialized');
