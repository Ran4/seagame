import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { parseShorthand } from './src/command-shorthand';

function statePlugin() {
  let cachedState: any = null;

  return {
    name: 'state-api',
    configureServer(server: any) {
      server.middlewares.use('/api/state', (req: any, res: any) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
          req.on('end', () => {
            try {
              cachedState = JSON.parse(body);
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 400;
              res.end('Invalid JSON');
            }
          });
          return;
        }

        // GET
        if (!cachedState) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'No state yet — game client has not posted' }));
          return;
        }

        const url = new URL(req.url!, `http://${req.headers.host}`);
        const params = url.searchParams;
        let result: any;

        if (params.has('log')) {
          result = { log: cachedState.log };
        } else if (params.has('actors')) {
          result = { actors: cachedState.actors };
        } else if (params.has('actor')) {
          const name = params.get('actor')!.toLowerCase();
          const detail = cachedState.actorDetails?.[name];
          result = detail ? { actor: detail } : { error: `Actor "${name}" not found` };
        } else if (params.has('barrels')) {
          result = { barrels: cachedState.barrels };
        } else if (params.has('time')) {
          result = { time: cachedState.time };
        } else {
          // Return everything except actorDetails (use ?actor=name for that)
          const { actorDetails, ...rest } = cachedState;
          result = rest;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result, null, 2));
      });
    },
  };
}

function ordersPlugin() {
  const ordersDir = path.resolve(__dirname, 'orders');
  return {
    name: 'orders-api',
    configureServer(server: any) {
      server.middlewares.use('/api/orders', (_req: any, res: any) => {
        // Ensure orders dir exists
        if (!fs.existsSync(ordersDir)) {
          fs.mkdirSync(ordersDir, { recursive: true });
        }

        const results: { actorName: string; commands: any[] }[] = [];
        const files = fs.readdirSync(ordersDir).filter(f => f.startsWith('orders_for_') && f.endsWith('.jsonl'));

        for (const file of files) {
          const filePath = path.join(ordersDir, file);
          const content = fs.readFileSync(filePath, 'utf-8').trim();
          if (!content) continue;

          // Extract actor name from filename: orders_for_anne.jsonl -> anne
          const match = file.match(/^orders_for_(.+)\.jsonl$/);
          if (!match) continue;
          const actorName = match[1];

          const commands: any[] = [];
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            try {
              let parsed;
              if (trimmed.startsWith('{')) {
                // JS-style object literal
                parsed = new Function(`return (${trimmed})`)();
              } else {
                // Shorthand format
                parsed = parseShorthand(trimmed);
              }
              commands.push(parsed);
            } catch (e) {
              console.warn(`[orders] Failed to parse line in ${file}: ${trimmed}`);
            }
          }

          if (commands.length > 0) {
            results.push({ actorName, commands });
          }

          // Empty the file
          fs.writeFileSync(filePath, '');
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(results));
      });
    },
  };
}

function configPlugin() {
  return {
    name: 'config-api',
    configureServer(server: any) {
      server.middlewares.use('/api/config', (_req: any, res: any) => {
        const envPath = path.resolve(__dirname, 'config.env');
        const vars: Record<string, string> = {};
        if (fs.existsSync(envPath)) {
          for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq < 0) continue;
            vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(vars));
      });
    },
  };
}

export default defineConfig({
  plugins: [statePlugin(), ordersPlugin(), configPlugin()],
  server: {
    port: 7070,
  },
});
