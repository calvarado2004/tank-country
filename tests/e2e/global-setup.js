import { rmSync } from 'node:fs';

export default function globalSetup() {
  rmSync('coverage/e2e', { recursive: true, force: true });
  rmSync('coverage/e2e-report', { recursive: true, force: true });
}
