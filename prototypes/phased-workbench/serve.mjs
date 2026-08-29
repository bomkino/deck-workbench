import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(here, '../..')
const port = Number(process.env.PORT ?? 8124)
const host = process.env.HOST ?? '127.0.0.1'

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

const server = createServer(async (request, response) => {
  try {
    const parsed = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
    let pathname = decodeURIComponent(parsed.pathname)
    if (pathname === '/') pathname = '/prototypes/phased-workbench/'
    if (pathname.endsWith('/')) pathname += 'index.html'
    const relative = normalize(pathname).replace(/^[/\\]+/, '')
    const target = resolve(repositoryRoot, relative)
    if (target !== repositoryRoot && !target.startsWith(`${repositoryRoot}${sep}`)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    const info = await stat(target)
    if (!info.isFile()) {
      response.writeHead(404).end('Not found')
      return
    }
    const content = await readFile(target)
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(extname(target)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    })
    response.end(content)
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(error?.code === 'ENOENT' ? 'Not found' : 'Prototype server failed')
  }
})

server.listen(port, host, () => {
  console.log(`Phased Workbench tracer: http://${host}:${port}/prototypes/phased-workbench/`)
})
