import { spawn } from "node:child_process"

/** Spawns a long-lived child whose output is prefixed with its name. */
export function spawnLogged(command, args, { name, env, cwd } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const prefix = `[${name ?? command}]`
  const forward = (stream, out) => {
    let buffer = ""
    stream.on("data", (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) out.write(`${prefix} ${line}\n`)
    })
  }
  forward(child.stdout, process.stdout)
  forward(child.stderr, process.stderr)
  child.on("exit", (code, signal) => {
    process.stdout.write(`${prefix} exited (code=${code} signal=${signal})\n`)
  })
  return child
}

/** Runs a command to completion, capturing combined output. */
export function run(command, args, { name, env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    const prefix = `[${name ?? command}]`
    const collect = (stream) => {
      stream.on("data", (chunk) => {
        const text = chunk.toString()
        output += text
        for (const line of text.split("\n")) {
          if (line.trim()) process.stdout.write(`${prefix} ${line}\n`)
        }
      })
    }
    collect(child.stdout)
    collect(child.stderr)
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve({ code, output })
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${output}`))
    })
  })
}

/** SIGTERMs a child and waits for it to exit (SIGKILL after timeout). */
export function stop(child, timeoutMs = 8000) {
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
    }, timeoutMs)
    child.once("exit", () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill("SIGTERM")
  })
}

/** Polls a URL until it responds (any HTTP status counts as up). */
export async function waitForHttp(url, { timeoutMs = 90_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      await fetch(url)
      return
    } catch (e) {
      lastError = e
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}
