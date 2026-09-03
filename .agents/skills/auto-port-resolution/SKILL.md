---
name: auto-port-resolution
description: >-
  Rules, detection protocols, and automatic port re-allocation patterns for web services (Vite, FastAPI/Uvicorn, Next.js, Node).
  Before starting any dev server or backend service, verifies whether the requested port is occupied. If occupied,
  automatically selects an unused port and updates configuration, proxy targets, and launch scripts to prevent port collisions.
---

# Auto Port Resolution Skill

This skill enforces zero port friction across frontend and backend services. Developers and agents should never fail or halt execution due to `EADDRINUSE`, `address already in use`, or conflicts with default ports (e.g., `5173`, `3000`, `8000`, `8080`).

---

## 1. Golden Rules for Port Management

1. **Never assume a standard port is free.**
   - Do NOT blindly run `vite`, `uvicorn`, `flask`, or `next dev` on default ports (`5173`, `8000`, `3000`).
   - Specifically, `5173` must be avoided or checked first, as it is commonly occupied by other background projects.
2. **Always test port availability before starting.**
   - Run a 1-second port check command before launching any long-running daemon or service.
3. **Auto-allocate to the next free port.**
   - If a port is occupied by an external process, dynamically allocate the next free port (e.g., `5180` -> `5181` -> `5182` or `8009` -> `8010`).
4. **Maintain bidirectional proxy alignment.**
   - When the backend port changes, immediately update the frontend reverse proxy (e.g., `vite.config.ts` -> `proxy["/api"].target`) or client environment variables (`VITE_API_URL`).

---

## 2. Fast Port Checking & Resolution Commands

### PowerShell (Windows)
To check if a specific port is in use:
```powershell
Get-NetTCPConnection -LocalPort 5180 -ErrorAction SilentlyContinue
```
If this returns nothing, the port is free.

To find the next available port starting from a base:
```powershell
function Get-FreePort([int]$startPort) {
    $p = $startPort
    while ($p -lt 65535) {
        $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
        if (-not $conn) { return $p }
        $p++
    }
    throw "No free ports found."
}
$freePort = Get-FreePort 5180
```

### Python (Cross-Platform)
```python
import socket

def get_free_port(start_port: int = 8009) -> int:
    port = start_port
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.2)
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
        port += 1
    raise RuntimeError("No free ports available.")
```

---

## 3. Technology-Specific Guidelines

### Vite (Frontend)
- In `vite.config.ts`, avoid `5173`. Use custom project ports (e.g. `5180` or higher).
- When a conflict occurs:
  ```typescript
  server: {
    port: 5180,
    strictPort: false, // Vite will automatically pick the next available port if 5180 is taken
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:8009",
        changeOrigin: true,
      },
    },
  }
  ```

### FastAPI / Uvicorn (Backend)
- Check whether port `8009` is occupied.
- If occupied, pass `--port <FREE_PORT>` to Uvicorn.
- Ensure the frontend proxy matches the dynamically selected backend port.

---

## 4. Troubleshooting Orphaned Processes
If a port is occupied by a previously crashed instance of the *same* project:
```powershell
# Identify process ID listening on the port
$conn = Get-NetTCPConnection -LocalPort 5180 -ErrorAction SilentlyContinue
if ($conn) {
    Get-Process -Id $conn.OwningProcess | Select-Object Id, ProcessName, Path
}
```
- If it is an orphaned node/python runner from this repo, safely terminate it or switch ports.
- If it belongs to an external system service or unrelated user program, **always shift this project's port** rather than killing the user's external process.
