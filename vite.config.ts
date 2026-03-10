import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { parseShorthand } from './src/command-shorthand';

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

export default defineConfig({
  plugins: [ordersPlugin()],
  server: {
    port: 7070,
  },
});
