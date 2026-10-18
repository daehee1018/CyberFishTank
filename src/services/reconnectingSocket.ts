// A suspended mobile browser may retain a socket that appears open but is dead.
// Replace it on foreground/online, and retry failed connections with backoff.
export class ReconnectingSocket {
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private attempts = 0;

  constructor(privateUrl: string) {
    this.url = privateUrl;
    window.addEventListener('online', this.resume);
    window.addEventListener('offline', this.pause);
    window.addEventListener('cft:reconnect', this.resume);
    document.addEventListener('visibilitychange', this.visibility);
    this.connect();
  }
  private url: string;
  private visibility = () => { if (document.visibilityState === 'visible') this.resume(); };
  private pause = () => {
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
    this.socket?.close();
  };
  private resume = () => {
    if (this.stopped || !navigator.onLine) return;
    this.attempts = 0;
    this.connect();
  };
  private connect = () => {
    if (this.stopped || !navigator.onLine) return;
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
    const old = this.socket;
    this.socket = null;
    old?.close();
    // Tell the UI that even a formerly open connection is now being replaced.
    this.onclose?.(new CloseEvent('close'));
    const socket = new WebSocket(this.url);
    this.socket = socket;
    const current = () => !this.stopped && this.socket === socket;
    this.timeout = setTimeout(() => { if (current()) socket.close(); }, 12000);
    socket.onopen = event => {
      if (!current()) return;
      clearTimeout(this.timeout);
      this.attempts = 0;
      this.onopen?.(event);
    };
    socket.onmessage = event => { if (current()) this.onmessage?.(event); };
    socket.onerror = event => { if (current()) this.onerror?.(event); };
    socket.onclose = event => {
      if (!current()) return;
      clearTimeout(this.timeout);
      this.onclose?.(event);
      if (navigator.onLine) {
        const delay = Math.min(30000, 1000 * 2 ** this.attempts++) + Math.random() * 500;
        this.timer = setTimeout(this.connect, delay);
      }
    };
  };
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
    window.removeEventListener('online', this.resume);
    window.removeEventListener('offline', this.pause);
    window.removeEventListener('cft:reconnect', this.resume);
    document.removeEventListener('visibilitychange', this.visibility);
    this.socket?.close();
  }
}
