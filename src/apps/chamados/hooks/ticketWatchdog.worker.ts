// Best-effort background heartbeat; browsers may still freeze workers.
const timer = setInterval(() => self.postMessage('tick'), 45000)
export {}
