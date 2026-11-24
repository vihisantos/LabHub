// Best-effort background heartbeat; browsers may still freeze workers.
setInterval(() => self.postMessage('tick'), 45000)
export {}
