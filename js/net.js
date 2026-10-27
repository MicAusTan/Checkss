// PeerJS wrapper. Star topology: clients talk to the host only.
// Messages are {t: type, d: data}. Host's own id is 'host'.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export class Net {
  constructor() { this.h = {}; this.conns = new Map(); this.isHost = false; this.id = null; this.hostConn = null; }
  on(t, f) { (this.h[t] ??= []).push(f); }
  emit(t, d, from) { (this.h[t] || []).forEach(f => f(d, from)); }
  host() {
    return new Promise((res, rej) => {
      this.isHost = true; this.id = 'host';
      this.code = Array.from({ length: 5 }, () => ALPHA[Math.random() * ALPHA.length | 0]).join('');
      this.peer = new Peer('partygame7-' + this.code);
      this.peer.on('open', () => res(this.code));
      this.peer.on('error', rej);
      this.peer.on('connection', c => {
        c.on('open', () => { this.conns.set(c.peer, c); this.emit('join', null, c.peer); });
        c.on('data', m => this.emit(m.t, m.d, c.peer));
        c.on('close', () => { this.conns.delete(c.peer); this.emit('leave', null, c.peer); });
      });
    });
  }
  join(code) {
    return new Promise((res, rej) => {
      this.peer = new Peer();
      this.peer.on('error', rej);
      this.peer.on('open', id => {
        this.id = id;
        const c = this.peer.connect('partygame7-' + code.toUpperCase(), { reliable: true });
        c.on('open', () => { this.hostConn = c; res(); });
        c.on('data', m => this.emit(m.t, m.d, 'host'));
        c.on('close', () => this.emit('closed'));
      });
    });
  }
  send(t, d) { this.hostConn?.send({ t, d }); }              // client -> host
  broadcast(t, d) { for (const c of this.conns.values()) c.send({ t, d }); } // host -> all
  sendTo(id, t, d) { this.conns.get(id)?.send({ t, d }); }
}
