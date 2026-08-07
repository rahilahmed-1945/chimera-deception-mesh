// Deterministic heuristic MITRE ATT&CK mapper (no LLM — that is a later rung).
// Kept as a simple, extensible rule set.
export function mapTechniques(kind: string): string[] {
  switch (kind) {
    case 'auth_attempt':
      return ['T1110.001']; // Brute Force: Password Guessing
    default:
      return [];
  }
}
