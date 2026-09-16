/* Minimal local Supabase Realtime client for the authenticated XCoda profile row. */
(function (global) {
  'use strict';

  class XCodaRealtimeClient {
    constructor({ url, anonKey, accessToken, userId, onChange, onStatus }) {
      this.url = String(url || '');
      this.anonKey = String(anonKey || '');
      this.accessToken = String(accessToken || '');
      this.userId = String(userId || '');
      this.onChange = typeof onChange === 'function' ? onChange : () => {};
      this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
      this.socket = null;
      this.heartbeat = null;
      this.reconnect = null;
      this.ref = 0;
      this.closed = false;
      this.retry = 1000;
      this.topic = 'realtime:public:vb_profiles';
    }

    nextRef() {
      this.ref += 1;
      return String(this.ref);
    }

    endpoint() {
      const base = this.url.replace(/^http/i, 'ws').replace(/\/$/, '');
      return `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(this.anonKey)}&vsn=1.0.0`;
    }

    send(topic, event, payload) {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify({
        topic,
        event,
        payload: payload || {},
        ref: this.nextRef()
      }));
    }

    connect() {
      if (
        this.closed ||
        !this.url ||
        !this.anonKey ||
        !this.accessToken ||
        !this.userId
      ) {
        this.onStatus('unavailable');
        return;
      }

      this.onStatus('connecting');
      try {
        this.socket = new WebSocket(this.endpoint());
      } catch (_) {
        this.scheduleReconnect();
        return;
      }

      this.socket.addEventListener('open', () => {
        this.retry = 1000;
        this.send(this.topic, 'phx_join', {
          config: {
            broadcast: { self: false },
            presence: { key: '' },
            postgres_changes: [{
              event: '*',
              schema: 'public',
              table: 'vb_profiles',
              filter: `user_id=eq.${this.userId}`
            }]
          },
          access_token: this.accessToken
        });
        this.heartbeat = setInterval(() => {
          this.send('phoenix', 'heartbeat', {});
        }, 25000);
      });

      this.socket.addEventListener('message', (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (_) {
          return;
        }
        if (
          message.event === 'phx_reply' &&
          message.topic === this.topic &&
          message.payload?.status === 'ok'
        ) {
          this.onStatus('connected');
          return;
        }
        if (message.event === 'postgres_changes' && message.topic === this.topic) {
          this.onChange();
        }
      });

      this.socket.addEventListener('close', () => {
        this.stopHeartbeat();
        if (!this.closed) this.scheduleReconnect();
      });
      this.socket.addEventListener('error', () => {
        this.onStatus('offline');
      });
    }

    scheduleReconnect() {
      if (this.closed) return;
      this.onStatus('offline');
      clearTimeout(this.reconnect);
      const delay = this.retry + Math.floor(Math.random() * 350);
      this.retry = Math.min(this.retry * 2, 30000);
      this.reconnect = setTimeout(() => this.connect(), delay);
    }

    stopHeartbeat() {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }

    close() {
      this.closed = true;
      clearTimeout(this.reconnect);
      this.stopHeartbeat();
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send(this.topic, 'phx_leave', {});
      }
      try { this.socket?.close(); } catch (_) {}
      this.socket = null;
      this.onStatus('closed');
    }
  }

  global.XCodaRealtime = Object.freeze({
    create(options) {
      const client = new XCodaRealtimeClient(options);
      client.connect();
      return client;
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
