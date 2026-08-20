import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  KafkaClusterStateSchema,
  ClientIntentSchema,
  ServerMessageSchema,
  TopologySchema,
} from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Target output directory in root packages/contracts/json-schemas
const outputDir = join(__dirname, '../../json-schemas');

try {
  mkdirSync(outputDir, { recursive: true });

  const schemas = [
    { name: 'cluster-state.json', schema: KafkaClusterStateSchema },
    { name: 'client-intent.json', schema: ClientIntentSchema },
    { name: 'server-message.json', schema: ServerMessageSchema },
    { name: 'topology.json', schema: TopologySchema },
  ];

  for (const { name, schema } of schemas) {
    const jsonSchema = zodToJsonSchema(schema, {
      name: name.replace('.json', ''),
      target: 'jsonSchema7',
    });
    const outputPath = join(outputDir, name);
    writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2), 'utf-8');
    console.warn(`✓ Exported ${name} to ${outputPath}`);
  }

  console.warn('✨ All Zod schemas successfully exported to JSON Schema format.');
} catch (err) {
  console.error('Failed to export JSON schemas:', err);
  process.exit(1);
}
